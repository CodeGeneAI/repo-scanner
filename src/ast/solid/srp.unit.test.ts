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

  it("flags class with >15 methods as warning", () => {
    const methods = Array.from({ length: 16 }, (_, i) => ({
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

    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    const methodViolation = result.violations.find(
      (v) => v.metric?.name === "methodCount",
    );
    expect(methodViolation).toBeDefined();
    expect(methodViolation!.severity).toBe("warning");
    expect(methodViolation!.entity).toBe("BigClass");
    expect(methodViolation!.metric!.value).toBe(16);
    expect(methodViolation!.metric!.threshold).toBe(15);
  });

  it("does not flag class with exactly 15 methods", () => {
    const methods = Array.from({ length: 15 }, (_, i) => ({
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

  it("flags class with WMC >20 as error", () => {
    // 5 methods each with complexity 5 = WMC 25
    const methods = Array.from({ length: 5 }, (_, i) => ({
      name: `method${i}`,
      line: i + 1,
      complexity: 5,
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
    expect(wmcViolation!.entity).toBe("ComplexClass");
    expect(wmcViolation!.metric!.value).toBe(25);
    expect(wmcViolation!.metric!.threshold).toBe(20);
  });

  it("does not flag class with WMC exactly 20", () => {
    // 4 methods each with complexity 5 = WMC 20
    const methods = Array.from({ length: 4 }, (_, i) => ({
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

  it("flags file with >10 import sources as warning", () => {
    const imports = Array.from({ length: 11 }, (_, i) => ({
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
    expect(importViolation!.metric!.value).toBe(11);
    expect(importViolation!.metric!.threshold).toBe(10);
  });

  it("does not flag file with exactly 10 unique import sources", () => {
    const imports = Array.from({ length: 10 }, (_, i) => ({
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
    // 11 imports but only 5 unique sources — should not trigger
    const imports = Array.from({ length: 11 }, (_, i) => ({
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

  it("assigns correct severity: error for WMC, warning for method count and imports", () => {
    // Class that triggers both WMC error and method count warning
    const methods = Array.from({ length: 21 }, (_, i) => ({
      name: `method${i}`,
      line: i + 1,
      complexity: 2,
      isOverride: false,
      isEmpty: false,
      throwsNotImplemented: false,
    }));

    const imports = Array.from({ length: 12 }, (_, i) => ({
      source: `pkg-${i}`,
      names: ["x"],
      isTypeOnly: false,
      line: i + 1,
    }));

    const fileMap = new Map([
      [
        "src/god-class.ts",
        makeAnalysis({
          classes: [
            {
              name: "GodClass",
              line: 1,
              methods,
              fieldCount: 0,
              loc: 200,
            },
          ],
          imports,
        }),
      ],
    ]);

    const result = analyzeSrp(fileMap);

    const errors = result.violations.filter((v) => v.severity === "error");
    const warnings = result.violations.filter((v) => v.severity === "warning");

    // WMC should be an error (21 methods * complexity 2 = 42 > 20)
    expect(errors.some((v) => v.metric?.name === "WMC")).toBe(true);
    // Method count and imports should be warnings
    expect(warnings.some((v) => v.metric?.name === "methodCount")).toBe(true);
    expect(warnings.some((v) => v.metric?.name === "importFanOut")).toBe(true);
  });

  it("score decreases with violations", () => {
    const methods = Array.from({ length: 5 }, (_, i) => ({
      name: `method${i}`,
      line: i + 1,
      complexity: 5,
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
