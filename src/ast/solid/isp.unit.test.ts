import { describe, expect, it } from "vitest";
import type { FileAnalysis } from "../queries/types";
import { analyzeIsp } from "./isp";

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
  });

  it("flags interface with 12+ methods as warning", () => {
    const methods = Array.from({ length: 13 }, (_, i) => `method${i}`);
    const fileMap = new Map([
      [
        "src/fat.ts",
        makeAnalysis({
          interfaces: [
            { name: "FatInterface", line: 1, methodCount: 13, methods },
          ],
        }),
      ],
    ]);

    const result = analyzeIsp(fileMap);
    const violation = result.violations.find(
      (v) => v.metric?.name === "interfaceMethods",
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("warning");
    expect(violation!.metric!.threshold).toBe(12);
  });

  it("flags interface with 20+ methods as error", () => {
    const methods = Array.from({ length: 21 }, (_, i) => `method${i}`);
    const fileMap = new Map([
      [
        "src/huge.ts",
        makeAnalysis({
          interfaces: [
            { name: "HugeInterface", line: 1, methodCount: 21, methods },
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
    expect(violation!.metric!.threshold).toBe(20);
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
              methodCount: 5,
              methods: ["a", "b", "c", "d", "e"],
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
