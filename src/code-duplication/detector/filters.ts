import type { Token } from "../tokenizer/tokens";
import { TokenType } from "../tokenizer/tokens";
import type { FilterOptions } from "../types";

/** Computed metrics for a clone group used to decide filtering. */
export interface FilterMetrics {
  /** Ratio of distinct normalized tokens to total tokens in the window. */
  readonly uniqueRatio: number;
  /** Ratio of literal tokens (string + numeric) to total tokens. */
  readonly literalRatio: number;
  /** Ratio of control-flow keywords to total tokens. */
  readonly controlFlowDensity: number;
  /** Ratio of `export` keywords to total keyword tokens. */
  readonly exportDensity: number;
}

const CONTROL_FLOW_KEYWORDS = new Set([
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "return",
  "try",
  "catch",
  "throw",
  "match",
  "when",
  "break",
  "continue",
  "yield",
]);

/** Default filter option values. */
export const FILTER_DEFAULTS: Required<FilterOptions> = {
  minUniqueRatio: 0.1,
  maxLiteralRatio: 0.5,
  ignoreBarrelExports: true,
};

/** Resolve user-provided filter options with defaults. */
export const resolveFilterOptions = (
  opts?: FilterOptions,
): Required<FilterOptions> => ({
  minUniqueRatio: opts?.minUniqueRatio ?? FILTER_DEFAULTS.minUniqueRatio,
  maxLiteralRatio: opts?.maxLiteralRatio ?? FILTER_DEFAULTS.maxLiteralRatio,
  ignoreBarrelExports:
    opts?.ignoreBarrelExports ?? FILTER_DEFAULTS.ignoreBarrelExports,
});

/**
 * Compute filter metrics for a token slice.
 * O(n) in the number of tokens in the window.
 */
export const computeMetrics = (
  tokens: readonly Token[],
  startToken: number,
  endToken: number,
): FilterMetrics => {
  const slice = tokens.slice(startToken, endToken + 1);
  const total = slice.length;

  if (total === 0) {
    return {
      uniqueRatio: 0,
      literalRatio: 0,
      controlFlowDensity: 0,
      exportDensity: 0,
    };
  }

  const distinct = new Set<string>();
  let literalCount = 0;
  let controlFlowCount = 0;
  let keywordCount = 0;
  let exportCount = 0;

  for (const token of slice) {
    distinct.add(token.normalized);

    if (
      token.type === TokenType.StringLiteral ||
      token.type === TokenType.NumericLiteral
    ) {
      literalCount++;
    }

    if (token.type === TokenType.Keyword) {
      keywordCount++;
      if (token.normalized === "export") {
        exportCount++;
      }
      if (CONTROL_FLOW_KEYWORDS.has(token.normalized)) {
        controlFlowCount++;
      }
    }
  }

  return {
    uniqueRatio: distinct.size / total,
    literalRatio: literalCount / total,
    controlFlowDensity: controlFlowCount / total,
    exportDensity: keywordCount > 0 ? exportCount / keywordCount : 0,
  };
};

/**
 * Determine whether a clone group should be filtered (rejected) based on its metrics.
 * Returns true if the group should be REMOVED (is a likely false positive).
 */
export const shouldFilter = (
  metrics: FilterMetrics,
  options: Required<FilterOptions>,
): boolean => {
  // Filter 1: Unique token ratio — reject low-diversity matches
  // Rescue: if control flow keywords are present, the code has real logic
  if (
    options.minUniqueRatio > 0 &&
    metrics.uniqueRatio < options.minUniqueRatio
  ) {
    const rescued = metrics.controlFlowDensity >= 0.01;
    if (!rescued) return true;
  }

  // Filter 2: Literal ratio — reject data-heavy matches
  if (
    options.maxLiteralRatio < 1 &&
    metrics.literalRatio > options.maxLiteralRatio
  ) {
    return true;
  }

  return false;
};

/**
 * Post-merge filter: check if a merged group is a barrel-file re-export pattern.
 * Returns true if the group should be REMOVED.
 */
export const shouldFilterBarrel = (
  metrics: FilterMetrics,
  options: Required<FilterOptions>,
): boolean => {
  if (!options.ignoreBarrelExports) return false;

  // Reject if high export density AND low unique ratio
  return metrics.exportDensity > 0.4 && metrics.uniqueRatio < 0.15;
};
