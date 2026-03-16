import { describe, expect, it } from "bun:test";
import type { Token } from "../tokenizer/tokens";
import { TokenType } from "../tokenizer/tokens";
import { computeRollingHashes } from "./hasher";

const makeToken = (normalized: string, line: number): Token => ({
  type: TokenType.Identifier,
  normalized,
  original: normalized,
  line,
});

describe("computeRollingHashes", () => {
  it("returns empty map when tokens < windowSize", () => {
    const tokens = [makeToken("a", 1), makeToken("b", 1)];
    const result = computeRollingHashes(tokens, "test.ts", 5);
    expect(result.size).toBe(0);
  });

  it("produces entries for each sliding window position", () => {
    const tokens = Array.from({ length: 10 }, (_, i) =>
      makeToken(`t${i}`, i + 1),
    );
    const result = computeRollingHashes(tokens, "test.ts", 5);
    // Should have 10 - 5 + 1 = 6 windows total
    let totalEntries = 0;
    for (const entries of result.values()) {
      totalEntries += entries.length;
    }
    expect(totalEntries).toBe(6);
  });

  it("produces same hash for identical token sequences", () => {
    const seq = ["if", "(", "$ID", ")", "{"];
    const tokens1 = seq.map((s, i) => makeToken(s, i + 1));
    const tokens2 = seq.map((s, i) => makeToken(s, i + 1));

    const h1 = computeRollingHashes(tokens1, "a.ts", 5);
    const h2 = computeRollingHashes(tokens2, "b.ts", 5);

    const hash1 = [...h1.keys()][0]!;
    const hash2 = [...h2.keys()][0]!;
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different sequences", () => {
    const tokens1 = ["if", "(", "$ID", ")", "{"].map((s, i) =>
      makeToken(s, i + 1),
    );
    const tokens2 = ["for", "(", "$ID", ")", "{"].map((s, i) =>
      makeToken(s, i + 1),
    );

    const h1 = computeRollingHashes(tokens1, "a.ts", 5);
    const h2 = computeRollingHashes(tokens2, "b.ts", 5);

    const hash1 = [...h1.keys()][0]!;
    const hash2 = [...h2.keys()][0]!;
    expect(hash1).not.toBe(hash2);
  });

  it("records correct start/end lines", () => {
    const tokens = [makeToken("a", 1), makeToken("b", 2), makeToken("c", 3)];
    const result = computeRollingHashes(tokens, "test.ts", 3);
    const entries = [...result.values()].flat();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.startLine).toBe(1);
    expect(entries[0]!.endLine).toBe(3);
  });

  it("handles window size of 1", () => {
    const tokens = [makeToken("a", 1), makeToken("b", 2), makeToken("c", 3)];
    const result = computeRollingHashes(tokens, "test.ts", 1);
    let totalEntries = 0;
    for (const entries of result.values()) {
      totalEntries += entries.length;
    }
    expect(totalEntries).toBe(3);
  });

  it("handles window equal to token count", () => {
    const tokens = [makeToken("x", 1), makeToken("y", 2)];
    const result = computeRollingHashes(tokens, "test.ts", 2);
    const entries = [...result.values()].flat();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.startLine).toBe(1);
    expect(entries[0]!.endLine).toBe(2);
  });
});
