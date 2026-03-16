import { describe, expect, it } from "vitest";
import type { FileAnalysis } from "../queries/types";
import { analyzeDip } from "./dip";

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
  });

  it("flags file with 15+ instantiations as warning", () => {
    const instantiations = Array.from({ length: 16 }, (_, i) => ({
      className: `Service${i}`,
      line: i + 1,
      inFunction: "init",
    }));

    const fileMap = new Map([
      ["src/factory.ts", makeAnalysis({ instantiations })],
    ]);

    const result = analyzeDip(fileMap);
    const violation = result.violations.find(
      (v) => v.metric?.name === "concreteInstantiations",
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("warning");
    expect(violation!.metric!.threshold).toBe(15);
  });

  it("flags file with 30+ instantiations as error", () => {
    const instantiations = Array.from({ length: 31 }, (_, i) => ({
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
    expect(violation!.metric!.threshold).toBe(30);
  });

  it("skips test files", () => {
    const instantiations = Array.from({ length: 50 }, (_, i) => ({
      className: `Mock${i}`,
      line: i + 1,
      inFunction: "setup",
    }));

    const fileMap = new Map([
      ["src/service.test.ts", makeAnalysis({ instantiations })],
      ["src/service_test.go", makeAnalysis({ instantiations })],
    ]);

    const result = analyzeDip(fileMap);
    expect(result.violations).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("does not flag file below threshold", () => {
    const instantiations = Array.from({ length: 10 }, (_, i) => ({
      className: `Service${i}`,
      line: i + 1,
      inFunction: "init",
    }));

    const fileMap = new Map([
      ["src/factory.ts", makeAnalysis({ instantiations })],
    ]);

    const result = analyzeDip(fileMap);
    expect(result.violations).toHaveLength(0);
  });
});
