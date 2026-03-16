import { describe, expect, it } from "vitest";
import { computeCompositeScore, computeScore } from "./scorer";
import type { PrincipleResult, Violation } from "./types";

/** Create a violation with a given severity. */
const makeViolation = (severity: "error" | "warning" | "info"): Violation => ({
  principle: "SRP",
  file: "test.ts",
  line: 1,
  entity: "TestClass",
  severity,
  message: `Test ${severity}`,
});

/** Create a minimal PrincipleResult with a given score. */
const makePrinciple = (score: number): PrincipleResult => ({
  score,
  confidence: 0.9,
  violations: [],
  summary: "",
});

describe("computeScore", () => {
  it("returns 100 for empty violations", () => {
    expect(computeScore([])).toBe(100);
  });

  it("applies 15 point penalty for error", () => {
    const violations = [makeViolation("error")];
    expect(computeScore(violations)).toBe(85);
  });

  it("applies 8 point penalty for warning", () => {
    const violations = [makeViolation("warning")];
    expect(computeScore(violations)).toBe(92);
  });

  it("applies 3 point penalty for info", () => {
    const violations = [makeViolation("info")];
    expect(computeScore(violations)).toBe(97);
  });

  it("accumulates penalties from multiple violations", () => {
    const violations = [
      makeViolation("error"), // -15
      makeViolation("warning"), // -8
      makeViolation("info"), // -3
    ];
    // 100 - 15 - 8 - 3 = 74
    expect(computeScore(violations)).toBe(74);
  });

  it("floors at 0 for excessive violations", () => {
    // 10 errors = -150, should floor at 0
    const violations = Array.from({ length: 10 }, () => makeViolation("error"));
    expect(computeScore(violations)).toBe(0);
  });

  it("never returns negative values", () => {
    const violations = Array.from({ length: 20 }, () => makeViolation("error"));
    expect(computeScore(violations)).toBeGreaterThanOrEqual(0);
  });
});

describe("computeCompositeScore", () => {
  it("returns 100 when all principles score 100", () => {
    const principles = {
      srp: makePrinciple(100),
      ocp: makePrinciple(100),
      lsp: makePrinciple(100),
      isp: makePrinciple(100),
      dip: makePrinciple(100),
    };
    expect(computeCompositeScore(principles)).toBe(100);
  });

  it("returns 0 when all principles score 0", () => {
    const principles = {
      srp: makePrinciple(0),
      ocp: makePrinciple(0),
      lsp: makePrinciple(0),
      isp: makePrinciple(0),
      dip: makePrinciple(0),
    };
    expect(computeCompositeScore(principles)).toBe(0);
  });

  it("uses correct weights: srp=0.3, ocp=0.2, lsp=0.1, isp=0.15, dip=0.25", () => {
    // Set each principle to a unique score to verify weights
    const principles = {
      srp: makePrinciple(100), // 100 * 0.3 = 30
      ocp: makePrinciple(50), // 50 * 0.2 = 10
      lsp: makePrinciple(0), // 0 * 0.1 = 0
      isp: makePrinciple(80), // 80 * 0.15 = 12
      dip: makePrinciple(60), // 60 * 0.25 = 15
    };
    // Total = 30 + 10 + 0 + 12 + 15 = 67
    expect(computeCompositeScore(principles)).toBe(67);
  });

  it("rounds the composite score to nearest integer", () => {
    const principles = {
      srp: makePrinciple(33), // 33 * 0.3 = 9.9
      ocp: makePrinciple(33), // 33 * 0.2 = 6.6
      lsp: makePrinciple(33), // 33 * 0.1 = 3.3
      isp: makePrinciple(33), // 33 * 0.15 = 4.95
      dip: makePrinciple(33), // 33 * 0.25 = 8.25
    };
    // Total = 9.9 + 6.6 + 3.3 + 4.95 + 8.25 = 33.0
    const result = computeCompositeScore(principles);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(33);
  });

  it("weights sum to 1.0", () => {
    // If all scores are the same, the composite should equal that score
    const score = 73;
    const principles = {
      srp: makePrinciple(score),
      ocp: makePrinciple(score),
      lsp: makePrinciple(score),
      isp: makePrinciple(score),
      dip: makePrinciple(score),
    };
    expect(computeCompositeScore(principles)).toBe(score);
  });
});
