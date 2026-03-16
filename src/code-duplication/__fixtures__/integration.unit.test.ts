import { describe, expect, it } from "bun:test";
import path from "path";
import { FileIndex } from "../../utils/file-index";
import { readText } from "../../utils/fs";
import { detectClones } from "../detector/detector";
import { scanForDuplicates } from "../scanner";
import { tokenize } from "../tokenizer/tokenizer";

const FIXTURES = path.resolve(__dirname);

/** Helper: tokenize a fixture file. */
const tokenizeFixture = async (relativePath: string) => {
  const fullPath = path.join(FIXTURES, relativePath);
  const source = await readText(fullPath);
  if (!source) throw new Error(`Could not read fixture: ${fullPath}`);
  return { file: relativePath, tokens: tokenize(source, fullPath) };
};

/** Helper: scan a fixture directory using FileIndex. */
const scanFixtureDir = async (
  dirName: string,
  options?: { minTokens?: number; minLines?: number; extensions?: string[] },
) => {
  const dirPath = path.join(FIXTURES, dirName);
  const index = await FileIndex.build(dirPath);
  return scanForDuplicates(dirPath, index, {
    minTokens: options?.minTokens,
    minLines: options?.minLines,
    extensions: options?.extensions ? new Set(options.extensions) : undefined,
  });
};

// ─── Type-1: Exact Duplicates ────────────────────────────────────────

describe("Type-1: Exact duplicates", () => {
  it("detects exact TS duplicates across files", async () => {
    const a = await tokenizeFixture("type1-exact/handler-a.ts");
    const b = await tokenizeFixture("type1-exact/handler-b.ts");
    const groups = detectClones([a, b], 20, 3);

    expect(groups.length).toBeGreaterThan(0);
    const allFiles = new Set(
      groups.flatMap((g) => g.instances.map((i) => i.file)),
    );
    expect(allFiles.has("type1-exact/handler-a.ts")).toBe(true);
    expect(allFiles.has("type1-exact/handler-b.ts")).toBe(true);
    const largest = groups[0]!;
    expect(largest.lineCount).toBeGreaterThanOrEqual(15);
  });

  it("detects exact Python duplicates across files", async () => {
    const a = await tokenizeFixture("type1-exact/utils-a.py");
    const b = await tokenizeFixture("type1-exact/utils-b.py");
    const groups = detectClones([a, b], 20, 3);

    expect(groups.length).toBeGreaterThan(0);
    const allFiles = new Set(
      groups.flatMap((g) => g.instances.map((i) => i.file)),
    );
    expect(allFiles.has("type1-exact/utils-a.py")).toBe(true);
    expect(allFiles.has("type1-exact/utils-b.py")).toBe(true);
  });

  it("detects exact Go duplicates across files", async () => {
    const a = await tokenizeFixture("type1-exact/service-a.go");
    const b = await tokenizeFixture("type1-exact/service-b.go");
    const groups = detectClones([a, b], 20, 3);

    expect(groups.length).toBeGreaterThan(0);
    const allFiles = new Set(
      groups.flatMap((g) => g.instances.map((i) => i.file)),
    );
    expect(allFiles.has("type1-exact/service-a.go")).toBe(true);
    expect(allFiles.has("type1-exact/service-b.go")).toBe(true);
  });

  it("detects clones via full scan of type1-exact directory", async () => {
    const result = await scanFixtureDir("type1-exact", {
      minTokens: 20,
      minLines: 3,
    });

    expect(result.groups.length).toBeGreaterThanOrEqual(3);
    expect(result.stats.filesScanned).toBe(6);
    expect(result.stats.duplicationPercentage).toBeGreaterThan(30);
  });
});

// ─── Type-2: Renamed Identifiers ────────────────────────────────────

describe("Type-2: Renamed identifiers", () => {
  it("detects TS services with renamed vars/types", async () => {
    const a = await tokenizeFixture("type2-renamed/user-service.ts");
    const b = await tokenizeFixture("type2-renamed/product-service.ts");
    const groups = detectClones([a, b], 15, 3);

    expect(groups.length).toBeGreaterThan(0);
    const largest = groups[0]!;
    expect(largest.lineCount).toBeGreaterThanOrEqual(10);
    const files = new Set(largest.instances.map((i) => i.file));
    expect(files.size).toBe(2);
  });

  it("detects Python parsers with renamed vars", async () => {
    const a = await tokenizeFixture("type2-renamed/parser-a.py");
    const b = await tokenizeFixture("type2-renamed/parser-b.py");
    const groups = detectClones([a, b], 15, 3);

    expect(groups.length).toBeGreaterThan(0);
    const largest = groups[0]!;
    expect(largest.lineCount).toBeGreaterThanOrEqual(10);
  });

  it("detects Rust caches with renamed structs/fields", async () => {
    const a = await tokenizeFixture("type2-renamed/cache-a.rs");
    const b = await tokenizeFixture("type2-renamed/cache-b.rs");
    const groups = detectClones([a, b], 15, 3);

    expect(groups.length).toBeGreaterThan(0);
    const largest = groups[0]!;
    expect(largest.lineCount).toBeGreaterThanOrEqual(10);
  });

  it("detects clones via full scan of type2-renamed directory", async () => {
    const result = await scanFixtureDir("type2-renamed", {
      minTokens: 15,
      minLines: 3,
    });

    expect(result.groups.length).toBeGreaterThanOrEqual(3);
    expect(result.stats.filesScanned).toBe(6);
    expect(result.stats.duplicationPercentage).toBeGreaterThan(20);
  });
});

// ─── Cross-language Clones ──────────────────────────────────────────

describe("Cross-language: structural clones", () => {
  it("detects TS/JS cross-language clone (same syntax family)", async () => {
    const ts = await tokenizeFixture("cross-language/validate.ts");
    const js = await tokenizeFixture("cross-language/validate.js");
    const groups = detectClones([ts, js], 10, 3);

    expect(groups.length).toBeGreaterThan(0);
    const files = new Set(groups[0]!.instances.map((i) => i.file));
    expect(files.has("cross-language/validate.ts")).toBe(true);
    expect(files.has("cross-language/validate.js")).toBe(true);
  });

  it("detects via full scan", async () => {
    const result = await scanFixtureDir("cross-language", {
      minTokens: 10,
      minLines: 3,
    });
    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.stats.filesScanned).toBe(2);
  });
});

// ─── Three-way Duplication ──────────────────────────────────────────

describe("Three-way duplication", () => {
  it("detects same code in 3 files", async () => {
    const result = await scanFixtureDir("three-way", {
      minTokens: 20,
      minLines: 5,
    });

    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.stats.filesScanned).toBe(3);

    const hasThreeWay = result.groups.some((g) => {
      const uniqueFiles = new Set(g.instances.map((i) => i.file));
      return uniqueFiles.size >= 3;
    });
    expect(hasThreeWay).toBe(true);
  });
});

// ─── Intra-file Duplication ─────────────────────────────────────────

describe("Intra-file duplication", () => {
  it("detects copy-pasted handlers within same file", async () => {
    const result = await scanFixtureDir("intra-file", {
      minTokens: 20,
      minLines: 5,
    });

    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.stats.filesScanned).toBe(1);

    for (const group of result.groups) {
      for (const inst of group.instances) {
        expect(inst.file).toBe("repeated-handlers.ts");
      }
    }

    const largest = result.groups[0]!;
    expect(largest.instances.length).toBeGreaterThanOrEqual(2);
    expect(largest.lineCount).toBeGreaterThanOrEqual(10);
  });
});

// ─── False Positives ────────────────────────────────────────────────

describe("False positives", () => {
  it("does not report structurally different functions as clones", async () => {
    const result = await scanFixtureDir("false-positives", {
      minTokens: 50,
      minLines: 6,
    });
    expect(result.groups).toHaveLength(0);
  });

  it("does not report cross-file false positives between different logic", async () => {
    const a = await tokenizeFixture("false-positives/array-ops.ts");
    const b = await tokenizeFixture("false-positives/different-logic.ts");

    const groups = detectClones([a, b], 15, 3);
    const crossFileGroups = groups.filter((g) => {
      const files = new Set(g.instances.map((i) => i.file));
      return files.size > 1;
    });
    expect(crossFileGroups).toHaveLength(0);
  });

  it("correctly detects intra-file structural clones in array-ops (true positive)", async () => {
    const a = await tokenizeFixture("false-positives/array-ops.ts");
    const groups = detectClones([a], 15, 3);
    expect(groups.length).toBeGreaterThan(0);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("handles empty file without crashing", async () => {
    const result = await scanFixtureDir("edge-cases", {
      minTokens: 50,
      minLines: 6,
      extensions: [".ts"],
    });
    expect(result.stats.filesScanned).toBeGreaterThanOrEqual(1);
  });

  it("handles comment-only file (produces zero tokens)", async () => {
    const fixture = await tokenizeFixture("edge-cases/comments-only.ts");
    expect(fixture.tokens).toHaveLength(0);
  });

  it("handles unterminated block comment gracefully", async () => {
    const fixture = await tokenizeFixture("edge-cases/unterminated-comment.ts");
    const identifiers = fixture.tokens.filter((t) => t.original === "before");
    expect(identifiers.length).toBe(1);
    const hidden = fixture.tokens.filter(
      (t) => t.original === "inside" || t.original === "hidden",
    );
    expect(hidden).toHaveLength(0);
  });

  it("handles unterminated string literal gracefully", async () => {
    const fixture = await tokenizeFixture("edge-cases/unterminated-string.ts");
    expect(fixture.tokens.length).toBeGreaterThan(0);
  });

  it("does not treat string contents as comments", async () => {
    const fixture = await tokenizeFixture(
      "edge-cases/strings-with-comments.ts",
    );
    const stringTokens = fixture.tokens.filter((t) => t.normalized === "$STR");
    expect(stringTokens.length).toBe(5);
  });

  it("handles CRLF line endings", async () => {
    const fixture = await tokenizeFixture("edge-cases/crlf-line-endings.ts");
    expect(fixture.tokens.length).toBeGreaterThan(0);
    const returnToken = fixture.tokens.find((t) => t.normalized === "return");
    expect(returnToken).toBeDefined();
    expect(returnToken!.line).toBeGreaterThan(1);
  });

  it("handles UTF-8 multibyte characters in strings", async () => {
    const fixture = await tokenizeFixture("edge-cases/unicode-identifiers.ts");
    expect(fixture.tokens.length).toBeGreaterThan(0);
    const stringTokens = fixture.tokens.filter((t) => t.normalized === "$STR");
    expect(stringTokens.length).toBe(4);
  });

  it("handles very long lines without crashing", async () => {
    const fixture = await tokenizeFixture("edge-cases/very-long-line.ts");
    expect(fixture.tokens.length).toBeGreaterThan(100);
  });

  it("handles --min-tokens larger than any file", async () => {
    const result = await scanFixtureDir("edge-cases", {
      minTokens: 100000,
      minLines: 6,
    });
    expect(result.groups).toHaveLength(0);
  });
});

// ─── Stats Correctness ──────────────────────────────────────────────

describe("Stats correctness", () => {
  it("duplicationPercentage is 0-100 range", async () => {
    const result = await scanFixtureDir("type1-exact", {
      minTokens: 20,
      minLines: 3,
    });
    expect(result.stats.duplicationPercentage).toBeGreaterThanOrEqual(0);
    expect(result.stats.duplicationPercentage).toBeLessThanOrEqual(100);
  });

  it("duplicatedLines counts each line once per file", async () => {
    const result = await scanFixtureDir("type1-exact", {
      minTokens: 20,
      minLines: 3,
    });
    expect(result.stats.duplicatedLines).toBeLessThanOrEqual(
      result.stats.totalTokens,
    );
    expect(result.stats.duplicatedLines).toBeGreaterThan(0);
  });

  it("reports correct filesScanned count", async () => {
    const result = await scanFixtureDir("type1-exact", {
      minTokens: 20,
      minLines: 3,
    });
    expect(result.stats.filesScanned).toBe(6);
  });

  it("totalTokens is positive for non-empty scans", async () => {
    const result = await scanFixtureDir("type1-exact", {
      minTokens: 20,
      minLines: 3,
    });
    expect(result.stats.totalTokens).toBeGreaterThan(0);
  });

  it("durationMs is non-negative", async () => {
    const result = await scanFixtureDir("type1-exact", {
      minTokens: 20,
      minLines: 3,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── Threshold Behavior ─────────────────────────────────────────────

describe("Threshold behavior", () => {
  it("increasing minTokens reduces reported clones", async () => {
    const lowThreshold = await scanFixtureDir("type1-exact", {
      minTokens: 10,
      minLines: 1,
    });
    const highThreshold = await scanFixtureDir("type1-exact", {
      minTokens: 40,
      minLines: 1,
    });
    expect(lowThreshold.groups.length).toBeGreaterThanOrEqual(
      highThreshold.groups.length,
    );
  });

  it("increasing minLines filters out small clones", async () => {
    const lowLines = await scanFixtureDir("type1-exact", {
      minTokens: 10,
      minLines: 1,
    });
    const highLines = await scanFixtureDir("type1-exact", {
      minTokens: 10,
      minLines: 20,
    });
    expect(lowLines.groups.length).toBeGreaterThanOrEqual(
      highLines.groups.length,
    );
    for (const group of highLines.groups) {
      expect(group.lineCount).toBeGreaterThanOrEqual(20);
    }
  });

  it("extensions filter limits scanned files", async () => {
    const allLangs = await scanFixtureDir("type1-exact", {
      minTokens: 20,
      minLines: 3,
    });
    const tsOnly = await scanFixtureDir("type1-exact", {
      minTokens: 20,
      minLines: 3,
      extensions: [".ts"],
    });
    expect(allLangs.stats.filesScanned).toBeGreaterThan(
      tsOnly.stats.filesScanned,
    );
    expect(tsOnly.stats.filesScanned).toBe(2);
  });
});

// ─── Output Format ──────────────────────────────────────────────────

describe("Output format", () => {
  it("groups are sorted by lineCount descending", async () => {
    const result = await scanFixtureDir("type1-exact", {
      minTokens: 10,
      minLines: 1,
    });
    for (let i = 1; i < result.groups.length; i++) {
      expect(result.groups[i - 1]!.lineCount).toBeGreaterThanOrEqual(
        result.groups[i]!.lineCount,
      );
    }
  });

  it("group IDs are sequential starting from 1", async () => {
    const result = await scanFixtureDir("type1-exact", {
      minTokens: 20,
      minLines: 3,
    });
    for (let i = 0; i < result.groups.length; i++) {
      expect(result.groups[i]!.id).toBe(i + 1);
    }
  });

  it("all groups have at least 2 instances", async () => {
    const result = await scanFixtureDir("type1-exact", {
      minTokens: 10,
      minLines: 1,
    });
    for (const group of result.groups) {
      expect(group.instances.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("file paths are relative to scan root", async () => {
    const result = await scanFixtureDir("type1-exact", {
      minTokens: 20,
      minLines: 3,
    });
    for (const group of result.groups) {
      for (const inst of group.instances) {
        expect(inst.file).not.toContain(FIXTURES);
        expect(inst.file.startsWith("/")).toBe(false);
      }
    }
  });
});
