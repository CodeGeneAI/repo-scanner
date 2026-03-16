import { describe, expect, it } from "vitest";
import type { FileAnalysis } from "../queries/types";
import { analyzeDip } from "./dip";

/** Create a minimal FileAnalysis with overrides. */
const makeAnalysis = (overrides: Partial<FileAnalysis> = {}): FileAnalysis => ({
  classes: [],
  imports: [],
  interfaces: [],
  instantiations: [],
  typeChecks: [],
  ...overrides,
});

describe("analyzeDip", () => {
  it("returns score 100 for empty file map", () => {
    const result = analyzeDip(new Map());

    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
    expect(result.summary).toBe("No DIP violations detected");
  });

  it("flags file with 5+ instantiations as warning", () => {
    const instantiations = Array.from({ length: 5 }, (_, i) => ({
      className: `Service${i}`,
      line: i + 1,
      inFunction: "init",
    }));

    const fileMap = new Map([
      ["src/factory.ts", makeAnalysis({ instantiations })],
    ]);

    const result = analyzeDip(fileMap);

    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    const violation = result.violations.find(
      (v) => v.metric?.name === "concreteInstantiations",
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("warning");
    expect(violation!.metric!.value).toBe(5);
    expect(violation!.metric!.threshold).toBe(5);
  });

  it("flags file with 10+ instantiations as error", () => {
    const instantiations = Array.from({ length: 10 }, (_, i) => ({
      className: `Service${i}`,
      line: i + 1,
      inFunction: "bootstrap",
    }));

    const fileMap = new Map([
      ["src/bootstrap.ts", makeAnalysis({ instantiations })],
    ]);

    const result = analyzeDip(fileMap);

    const violation = result.violations.find(
      (v) => v.metric?.name === "concreteInstantiations",
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("error");
    expect(violation!.entity).toBe("bootstrap.ts");
    expect(violation!.metric!.value).toBe(10);
    expect(violation!.metric!.threshold).toBe(10);
  });
});
