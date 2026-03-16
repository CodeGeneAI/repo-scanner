import { describe, expect, it } from "vitest";
import type { FileAnalysis } from "../queries/types";
import { analyzeSrp } from "./srp";

/** Create a minimal FileAnalysis with overrides. */
const makeAnalysis = (overrides: Partial<FileAnalysis> = {}): FileAnalysis => ({
  classes: [],
  imports: [],
  interfaces: [],
  instantiations: [],
  typeChecks: [],
  ...overrides,
});

describe("analyzeSrp", () => {
  it("returns score 100 for empty file map", () => {
    const result = analyzeSrp(new Map());

    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
    expect(result.summary).toBe("No SRP violations detected");
  });

  it("flags class with >20 methods as warning", () => {
    const methods = Array.from({ length: 21 }, (_, i) => ({
      name: `method${i}`,
      line: i + 1,
      complexity: 1,
      isOverride: false,
      isEmpty: false,
      throwsNotImplemented: false,
    }));

    const fileMap = new Map([
      [
        "src/big-class.ts",
        makeAnalysis({
          classes: [
            { name: "BigClass", line: 1, methods, fieldCount: 0, loc: 50 },
          ],
        }),
      ],
    ]);

    const result = analyzeSrp(fileMap);

    const methodViolation = result.violations.find(
      (v) => v.metric?.name === "methodCount",
    );
    expect(methodViolation).toBeDefined();
    expect(methodViolation!.severity).toBe("warning");
    expect(methodViolation!.entity).toBe("BigClass");
    expect(methodViolation!.metric!.value).toBe(21);
    expect(methodViolation!.metric!.threshold).toBe(20);
  });

  it("does not flag class with exactly 20 methods", () => {
    const methods = Array.from({ length: 20 }, (_, i) => ({
      name: `method${i}`,
      line: i + 1,
      complexity: 1,
      isOverride: false,
      isEmpty: false,
      throwsNotImplemented: false,
    }));

    const fileMap = new Map([
      [
        "src/ok-class.ts",
        makeAnalysis({
          classes: [
            { name: "OkClass", line: 1, methods, fieldCount: 0, loc: 50 },
          ],
        }),
      ],
    ]);

    const result = analyzeSrp(fileMap);
    const methodViolation = result.violations.find(
      (v) => v.metric?.name === "methodCount",
    );
    expect(methodViolation).toBeUndefined();
  });

  it("flags class with WMC >50 as error", () => {
    // 10 methods each with complexity 6 = WMC 60
    const methods = Array.from({ length: 10 }, (_, i) => ({
      name: `method${i}`,
      line: i + 1,
      complexity: 6,
      isOverride: false,
      isEmpty: false,
      throwsNotImplemented: false,
    }));

    const fileMap = new Map([
      [
        "src/complex.ts",
        makeAnalysis({
          classes: [
            {
              name: "ComplexClass",
              line: 1,
              methods,
              fieldCount: 0,
              loc: 100,
            },
          ],
        }),
      ],
    ]);

    const result = analyzeSrp(fileMap);

    const wmcViolation = result.violations.find(
      (v) => v.metric?.name === "WMC",
    );
    expect(wmcViolation).toBeDefined();
    expect(wmcViolation!.severity).toBe("error");
    expect(wmcViolation!.metric!.value).toBe(60);
    expect(wmcViolation!.metric!.threshold).toBe(50);
  });

  it("flags class with WMC >30 as warning", () => {
    // 7 methods each with complexity 5 = WMC 35
    const methods = Array.from({ length: 7 }, (_, i) => ({
      name: `method${i}`,
      line: i + 1,
      complexity: 5,
      isOverride: false,
      isEmpty: false,
      throwsNotImplemented: false,
    }));

    const fileMap = new Map([
      [
        "src/moderate.ts",
        makeAnalysis({
          classes: [
            {
              name: "ModerateClass",
              line: 1,
              methods,
              fieldCount: 0,
              loc: 80,
            },
          ],
        }),
      ],
    ]);

    const result = analyzeSrp(fileMap);

    const wmcViolation = result.violations.find(
      (v) => v.metric?.name === "WMC",
    );
    expect(wmcViolation).toBeDefined();
    expect(wmcViolation!.severity).toBe("warning");
    expect(wmcViolation!.metric!.threshold).toBe(30);
  });

  it("does not flag class with WMC exactly 30", () => {
    // 6 methods each with complexity 5 = WMC 30
    const methods = Array.from({ length: 6 }, (_, i) => ({
      name: `method${i}`,
      line: i + 1,
      complexity: 5,
      isOverride: false,
      isEmpty: false,
      throwsNotImplemented: false,
    }));

    const fileMap = new Map([
      [
        "src/ok.ts",
        makeAnalysis({
          classes: [
            { name: "OkClass", line: 1, methods, fieldCount: 0, loc: 50 },
          ],
        }),
      ],
    ]);

    const result = analyzeSrp(fileMap);
    const wmcViolation = result.violations.find(
      (v) => v.metric?.name === "WMC",
    );
    expect(wmcViolation).toBeUndefined();
  });

  it("flags file with >15 import sources as warning", () => {
    const imports = Array.from({ length: 16 }, (_, i) => ({
      source: `@scope/package-${i}`,
      names: ["default"],
      isTypeOnly: false,
      line: i + 1,
    }));

    const fileMap = new Map([
      ["src/kitchen-sink.ts", makeAnalysis({ imports })],
    ]);

    const result = analyzeSrp(fileMap);

    const importViolation = result.violations.find(
      (v) => v.metric?.name === "importFanOut",
    );
    expect(importViolation).toBeDefined();
    expect(importViolation!.severity).toBe("warning");
    expect(importViolation!.metric!.value).toBe(16);
    expect(importViolation!.metric!.threshold).toBe(15);
  });

  it("does not flag file with exactly 15 unique import sources", () => {
    const imports = Array.from({ length: 15 }, (_, i) => ({
      source: `@scope/package-${i}`,
      names: ["default"],
      isTypeOnly: false,
      line: i + 1,
    }));

    const fileMap = new Map([["src/ok.ts", makeAnalysis({ imports })]]);

    const result = analyzeSrp(fileMap);
    const importViolation = result.violations.find(
      (v) => v.metric?.name === "importFanOut",
    );
    expect(importViolation).toBeUndefined();
  });

  it("deduplicates import sources when counting fan-out", () => {
    const imports = Array.from({ length: 20 }, (_, i) => ({
      source: `package-${i % 5}`,
      names: ["default"],
      isTypeOnly: false,
      line: i + 1,
    }));

    const fileMap = new Map([["src/ok.ts", makeAnalysis({ imports })]]);

    const result = analyzeSrp(fileMap);
    const importViolation = result.violations.find(
      (v) => v.metric?.name === "importFanOut",
    );
    expect(importViolation).toBeUndefined();
  });

  it("score decreases with violations", () => {
    // 10 methods * complexity 6 = WMC 60 (triggers error at >50)
    const methods = Array.from({ length: 10 }, (_, i) => ({
      name: `method${i}`,
      line: i + 1,
      complexity: 6,
      isOverride: false,
      isEmpty: false,
      throwsNotImplemented: false,
    }));

    const fileMap = new Map([
      [
        "src/complex.ts",
        makeAnalysis({
          classes: [
            {
              name: "ComplexClass",
              line: 1,
              methods,
              fieldCount: 0,
              loc: 100,
            },
          ],
        }),
      ],
    ]);

    const result = analyzeSrp(fileMap);
    expect(result.score).toBeLessThan(100);
  });
});
