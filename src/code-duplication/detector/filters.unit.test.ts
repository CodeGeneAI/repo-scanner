import { describe, expect, it } from "bun:test";
import type { Token } from "../tokenizer/tokens";
import { TokenType } from "../tokenizer/tokens";
import {
  computeMetrics,
  FILTER_DEFAULTS,
  resolveFilterOptions,
  shouldFilter,
  shouldFilterBarrel,
} from "./filters";

/** Helper to create a token. */
const tok = (
  type: TokenType,
  normalized: string,
  original?: string,
): Token => ({
  type,
  normalized,
  original: original ?? normalized,
  line: 1,
});

describe("computeMetrics", () => {
  it("returns zeros for empty range", () => {
    const m = computeMetrics([], 0, -1);
    expect(m.uniqueRatio).toBe(0);
    expect(m.literalRatio).toBe(0);
    expect(m.controlFlowDensity).toBe(0);
    expect(m.exportDensity).toBe(0);
  });

  it("computes unique ratio correctly", () => {
    // 3 distinct normalized tokens out of 5 total → 0.6
    const tokens: Token[] = [
      tok(TokenType.Keyword, "if"),
      tok(TokenType.Identifier, "$ID", "x"),
      tok(TokenType.Operator, ">"),
      tok(TokenType.Identifier, "$ID", "y"),
      tok(TokenType.Keyword, "if"),
    ];
    const m = computeMetrics(tokens, 0, 4);
    expect(m.uniqueRatio).toBeCloseTo(3 / 5);
  });

  it("computes literal ratio correctly", () => {
    const tokens: Token[] = [
      tok(TokenType.Keyword, "const"),
      tok(TokenType.Identifier, "$ID", "x"),
      tok(TokenType.Operator, "="),
      tok(TokenType.StringLiteral, "$STR", '"hello"'),
      tok(TokenType.Punctuation, ";"),
      tok(TokenType.Keyword, "const"),
      tok(TokenType.Identifier, "$ID", "y"),
      tok(TokenType.Operator, "="),
      tok(TokenType.NumericLiteral, "$NUM", "42"),
      tok(TokenType.Punctuation, ";"),
    ];
    const m = computeMetrics(tokens, 0, 9);
    // 2 literals out of 10 tokens
    expect(m.literalRatio).toBeCloseTo(0.2);
  });

  it("computes control flow density", () => {
    const tokens: Token[] = [
      tok(TokenType.Keyword, "if"),
      tok(TokenType.Punctuation, "("),
      tok(TokenType.Identifier, "$ID"),
      tok(TokenType.Punctuation, ")"),
      tok(TokenType.Keyword, "return"),
      tok(TokenType.Identifier, "$ID"),
      tok(TokenType.Punctuation, ";"),
      tok(TokenType.Keyword, "for"),
      tok(TokenType.Punctuation, "("),
      tok(TokenType.Identifier, "$ID"),
    ];
    const m = computeMetrics(tokens, 0, 9);
    // 3 control flow keywords (if, return, for) out of 10 tokens
    expect(m.controlFlowDensity).toBeCloseTo(0.3);
  });

  it("computes export density", () => {
    const tokens: Token[] = [
      tok(TokenType.Keyword, "export"),
      tok(TokenType.Punctuation, "{"),
      tok(TokenType.Identifier, "$ID"),
      tok(TokenType.Punctuation, "}"),
      tok(TokenType.Keyword, "from"),
      tok(TokenType.StringLiteral, "$STR"),
      tok(TokenType.Punctuation, ";"),
      tok(TokenType.Keyword, "export"),
      tok(TokenType.Punctuation, "{"),
      tok(TokenType.Identifier, "$ID"),
      tok(TokenType.Punctuation, "}"),
      tok(TokenType.Keyword, "from"),
      tok(TokenType.StringLiteral, "$STR"),
      tok(TokenType.Punctuation, ";"),
    ];
    const m = computeMetrics(tokens, 0, 13);
    // 4 keywords total (export, from, export, from), 2 are "export" → 0.5
    expect(m.exportDensity).toBeCloseTo(0.5);
  });

  it("respects start/end token range", () => {
    const tokens: Token[] = [
      tok(TokenType.Keyword, "const"),
      tok(TokenType.StringLiteral, "$STR"),
      tok(TokenType.StringLiteral, "$STR"),
      tok(TokenType.StringLiteral, "$STR"),
      tok(TokenType.Keyword, "const"),
    ];
    // Only look at tokens 1-3 (three $STR)
    const m = computeMetrics(tokens, 1, 3);
    expect(m.literalRatio).toBeCloseTo(1.0);
    expect(m.uniqueRatio).toBeCloseTo(1 / 3);
  });
});

describe("shouldFilter", () => {
  const defaults = resolveFilterOptions();

  it("filters low unique ratio without control flow", () => {
    const metrics = {
      uniqueRatio: 0.05,
      literalRatio: 0.1,
      controlFlowDensity: 0,
      exportDensity: 0,
    };
    expect(shouldFilter(metrics, defaults)).toBe(true);
  });

  it("rescues low unique ratio when control flow density >= 0.01", () => {
    const metrics = {
      uniqueRatio: 0.05,
      literalRatio: 0.1,
      controlFlowDensity: 0.02, // above rescue threshold
      exportDensity: 0,
    };
    expect(shouldFilter(metrics, defaults)).toBe(false);
  });

  it("does not rescue when control flow density is too low", () => {
    const metrics = {
      uniqueRatio: 0.05,
      literalRatio: 0.1,
      controlFlowDensity: 0.005, // below 0.01 rescue threshold
      exportDensity: 0,
    };
    expect(shouldFilter(metrics, defaults)).toBe(true);
  });

  it("keeps groups above unique ratio threshold", () => {
    const metrics = {
      uniqueRatio: 0.2,
      literalRatio: 0.1,
      controlFlowDensity: 0,
      exportDensity: 0,
    };
    expect(shouldFilter(metrics, defaults)).toBe(false);
  });

  it("filters high literal ratio", () => {
    const metrics = {
      uniqueRatio: 0.3,
      literalRatio: 0.6,
      controlFlowDensity: 0.1,
      exportDensity: 0,
    };
    expect(shouldFilter(metrics, defaults)).toBe(true);
  });

  it("keeps groups below literal ratio threshold", () => {
    const metrics = {
      uniqueRatio: 0.3,
      literalRatio: 0.4,
      controlFlowDensity: 0,
      exportDensity: 0,
    };
    expect(shouldFilter(metrics, defaults)).toBe(false);
  });

  it("respects disabled unique ratio (0)", () => {
    const opts = resolveFilterOptions({ minUniqueRatio: 0 });
    const metrics = {
      uniqueRatio: 0.01,
      literalRatio: 0.1,
      controlFlowDensity: 0,
      exportDensity: 0,
    };
    expect(shouldFilter(metrics, opts)).toBe(false);
  });

  it("respects disabled literal ratio (1)", () => {
    const opts = resolveFilterOptions({ maxLiteralRatio: 1 });
    const metrics = {
      uniqueRatio: 0.3,
      literalRatio: 0.9,
      controlFlowDensity: 0,
      exportDensity: 0,
    };
    expect(shouldFilter(metrics, opts)).toBe(false);
  });
});

describe("shouldFilterBarrel", () => {
  const defaults = resolveFilterOptions();

  it("filters high export density with low unique ratio", () => {
    const metrics = {
      uniqueRatio: 0.05,
      literalRatio: 0.1,
      controlFlowDensity: 0,
      exportDensity: 0.5,
    };
    expect(shouldFilterBarrel(metrics, defaults)).toBe(true);
  });

  it("keeps high export density when unique ratio is acceptable", () => {
    const metrics = {
      uniqueRatio: 0.2,
      literalRatio: 0.1,
      controlFlowDensity: 0,
      exportDensity: 0.5,
    };
    expect(shouldFilterBarrel(metrics, defaults)).toBe(false);
  });

  it("keeps low export density regardless of unique ratio", () => {
    const metrics = {
      uniqueRatio: 0.05,
      literalRatio: 0.1,
      controlFlowDensity: 0,
      exportDensity: 0.3,
    };
    expect(shouldFilterBarrel(metrics, defaults)).toBe(false);
  });

  it("respects disabled barrel filter", () => {
    const opts = resolveFilterOptions({ ignoreBarrelExports: false });
    const metrics = {
      uniqueRatio: 0.05,
      literalRatio: 0.1,
      controlFlowDensity: 0,
      exportDensity: 0.8,
    };
    expect(shouldFilterBarrel(metrics, opts)).toBe(false);
  });
});

describe("resolveFilterOptions", () => {
  it("uses defaults when no options provided", () => {
    const opts = resolveFilterOptions();
    expect(opts).toEqual(FILTER_DEFAULTS);
  });

  it("overrides individual values", () => {
    const opts = resolveFilterOptions({ minUniqueRatio: 0.2 });
    expect(opts.minUniqueRatio).toBe(0.2);
    expect(opts.maxLiteralRatio).toBe(FILTER_DEFAULTS.maxLiteralRatio);
    expect(opts.ignoreBarrelExports).toBe(FILTER_DEFAULTS.ignoreBarrelExports);
  });
});
