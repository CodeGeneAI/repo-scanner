import type { Token } from "../tokenizer/tokens";

const BASE = 31n;
const MOD = 1_000_000_007n;

/** A hash entry recording a window of tokens in a specific file. */
export interface HashEntry {
  readonly file: string;
  readonly startToken: number;
  readonly endToken: number;
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * Compute rolling hashes over a token sequence using Rabin-Karp.
 * Uses BigInt arithmetic to avoid integer overflow.
 * Returns a map of hash → entries for this file.
 */
export const computeRollingHashes = (
  tokens: Token[],
  file: string,
  windowSize: number,
): Map<number, HashEntry[]> => {
  if (tokens.length < windowSize) return new Map();

  const hashes = new Map<number, HashEntry[]>();

  // Precompute token hashes as BigInts
  const tokenHashes: bigint[] = new Array(tokens.length);
  for (let i = 0; i < tokens.length; i++) {
    tokenHashes[i] = charHash(tokens[i]!.normalized);
  }

  // Precompute BASE^(windowSize-1) mod MOD
  let basePow = 1n;
  for (let i = 0; i < windowSize - 1; i++) {
    basePow = (basePow * BASE) % MOD;
  }

  // Compute hash of first window
  let hash = 0n;
  for (let i = 0; i < windowSize; i++) {
    hash = (hash * BASE + tokenHashes[i]!) % MOD;
  }

  addEntry(hashes, Number(hash), {
    file,
    startToken: 0,
    endToken: windowSize - 1,
    startLine: tokens[0]!.line,
    endLine: tokens[windowSize - 1]!.line,
  });

  // Slide window
  for (let i = 1; i <= tokens.length - windowSize; i++) {
    const outChar = tokenHashes[i - 1]!;
    const inChar = tokenHashes[i + windowSize - 1]!;

    // Remove leading token, add trailing
    hash =
      (((hash - ((outChar * basePow) % MOD) + MOD) % MOD) * BASE + inChar) %
      MOD;

    addEntry(hashes, Number(hash), {
      file,
      startToken: i,
      endToken: i + windowSize - 1,
      startLine: tokens[i]!.line,
      endLine: tokens[i + windowSize - 1]!.line,
    });
  }

  return hashes;
};

/** Simple string hash for a normalized token value. */
const charHash = (s: string): bigint => {
  let h = 0n;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31n + BigInt(s.charCodeAt(i))) % MOD;
  }
  return h;
};

const addEntry = (
  map: Map<number, HashEntry[]>,
  hash: number,
  entry: HashEntry,
): void => {
  const existing = map.get(hash);
  if (existing) {
    existing.push(entry);
  } else {
    map.set(hash, [entry]);
  }
};
