import { describe, expect, it } from "vitest";
import type { FileAnalysis } from "../queries/types";
import { analyzeOcp } from "./ocp";

/** Create a minimal FileAnalysis with overrides. */
const makeAnalysis = (overrides: Partial<FileAnalysis> = {}): FileAnalysis => ({
  classes: [],
  imports: [],
  interfaces: [],
  instantiations: [],
  typeChecks: [],
  ...overrides,
});

describe("analyzeOcp", () => {
  it("returns score 100 for empty file map", () => {
    const result = analyzeOcp(new Map());

    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
    expect(result.summary).toBe("No OCP violations detected");
  });

  it("flags function with 3+ type checks as warning", () => {
    const typeChecks = Array.from({ length: 3 }, (_, i) => ({
      checkedType: `Type${i}`,
      line: i + 1,
      inFunction: "handleEvent",
    }));

    const fileMap = new Map([["src/handler.ts", makeAnalysis({ typeChecks })]]);

    const result = analyzeOcp(fileMap);

    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    const violation = result.violations.find(
      (v) => v.metric?.name === "typeChecks",
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("warning");
    expect(violation!.entity).toBe("handleEvent");
    expect(violation!.metric!.value).toBe(3);
    expect(violation!.metric!.threshold).toBe(3);
  });

  it("flags function with 5+ type checks as error", () => {
    const typeChecks = Array.from({ length: 5 }, (_, i) => ({
      checkedType: `Type${i}`,
      line: i + 1,
      inFunction: "processInput",
    }));

    const fileMap = new Map([
      ["src/processor.ts", makeAnalysis({ typeChecks })],
    ]);

    const result = analyzeOcp(fileMap);

    const violation = result.violations.find(
      (v) => v.metric?.name === "typeChecks",
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("error");
    expect(violation!.entity).toBe("processInput");
    expect(violation!.metric!.value).toBe(5);
    expect(violation!.metric!.threshold).toBe(5);
  });

  it("groups by function name correctly", () => {
    const typeChecks = [
      // 3 checks in funcA → warning
      { checkedType: "A1", line: 1, inFunction: "funcA" },
      { checkedType: "A2", line: 2, inFunction: "funcA" },
      { checkedType: "A3", line: 3, inFunction: "funcA" },
      // 2 checks in funcB → no violation
      { checkedType: "B1", line: 10, inFunction: "funcB" },
      { checkedType: "B2", line: 11, inFunction: "funcB" },
    ];

    const fileMap = new Map([["src/mixed.ts", makeAnalysis({ typeChecks })]]);

    const result = analyzeOcp(fileMap);

    // funcA should trigger a violation
    const funcAViolation = result.violations.find((v) => v.entity === "funcA");
    expect(funcAViolation).toBeDefined();
    expect(funcAViolation!.severity).toBe("warning");

    // funcB should not trigger a violation
    const funcBViolation = result.violations.find((v) => v.entity === "funcB");
    expect(funcBViolation).toBeUndefined();
  });
});
