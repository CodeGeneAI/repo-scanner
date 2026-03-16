import { describe, expect, it } from "vitest";
import type { FileAnalysis } from "../queries/types";
import { analyzeIsp } from "./isp";

/** Create a minimal FileAnalysis with overrides. */
const makeAnalysis = (overrides: Partial<FileAnalysis> = {}): FileAnalysis => ({
  classes: [],
  imports: [],
  interfaces: [],
  instantiations: [],
  typeChecks: [],
  ...overrides,
});

describe("analyzeIsp", () => {
  it("returns score 100 for empty file map", () => {
    const result = analyzeIsp(new Map());

    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
    expect(result.summary).toBe("No ISP violations detected");
  });

  it("flags interface with 8+ methods as warning", () => {
    const methods = Array.from({ length: 8 }, (_, i) => `method${i}`);

    const fileMap = new Map([
      [
        "src/fat.ts",
        makeAnalysis({
          interfaces: [
            { name: "FatInterface", line: 1, methodCount: 8, methods },
          ],
        }),
      ],
    ]);

    const result = analyzeIsp(fileMap);

    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    const violation = result.violations.find(
      (v) => v.metric?.name === "interfaceMethods",
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("warning");
    expect(violation!.entity).toBe("FatInterface");
    expect(violation!.metric!.value).toBe(8);
    expect(violation!.metric!.threshold).toBe(8);
  });

  it("flags interface with 12+ methods as error", () => {
    const methods = Array.from({ length: 12 }, (_, i) => `method${i}`);

    const fileMap = new Map([
      [
        "src/huge.ts",
        makeAnalysis({
          interfaces: [
            { name: "HugeInterface", line: 1, methodCount: 12, methods },
          ],
        }),
      ],
    ]);

    const result = analyzeIsp(fileMap);

    const violation = result.violations.find(
      (v) => v.metric?.name === "interfaceMethods",
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("error");
    expect(violation!.entity).toBe("HugeInterface");
    expect(violation!.metric!.value).toBe(12);
    expect(violation!.metric!.threshold).toBe(12);
  });

  it("ignores small interfaces", () => {
    const fileMap = new Map([
      [
        "src/small.ts",
        makeAnalysis({
          interfaces: [
            {
              name: "SmallInterface",
              line: 1,
              methodCount: 3,
              methods: ["a", "b", "c"],
            },
          ],
        }),
      ],
    ]);

    const result = analyzeIsp(fileMap);

    expect(result.violations).toHaveLength(0);
    expect(result.score).toBe(100);
  });
});
