import { describe, expect, it } from "bun:test";
import { tokenize } from "../tokenizer/tokenizer";
import { detectClones } from "./detector";

describe("detectClones", () => {
  it("finds exact duplicates across two files", () => {
    // Create two "files" with identical code blocks
    const code = `
function processData(items) {
  const results = [];
  for (const item of items) {
    if (item.active) {
      const transformed = transform(item);
      results.push(transformed);
    }
  }
  return results;
}
`.trim();

    const tokens1 = tokenize(code, "a.ts");
    const tokens2 = tokenize(code, "b.ts");

    const groups = detectClones(
      [
        { file: "a.ts", tokens: tokens1 },
        { file: "b.ts", tokens: tokens2 },
      ],
      10, // small window for test
      2,
    );

    expect(groups.length).toBeGreaterThan(0);
    // Should have instances in both files
    const group = groups[0]!;
    const files = new Set(group.instances.map((i) => i.file));
    expect(files.size).toBe(2);
    expect(files.has("a.ts")).toBe(true);
    expect(files.has("b.ts")).toBe(true);
  });

  it("finds Type-2 clones (renamed identifiers)", () => {
    const code1 = `
function processItems(data) {
  const output = [];
  for (const item of data) {
    if (item.valid) {
      output.push(item.value);
    }
  }
  return output;
}
`.trim();

    const code2 = `
function handleEntries(entries) {
  const results = [];
  for (const entry of entries) {
    if (entry.valid) {
      results.push(entry.value);
    }
  }
  return results;
}
`.trim();

    const tokens1 = tokenize(code1, "a.ts");
    const tokens2 = tokenize(code2, "b.ts");

    const groups = detectClones(
      [
        { file: "a.ts", tokens: tokens1 },
        { file: "b.ts", tokens: tokens2 },
      ],
      10,
      2,
    );

    expect(groups.length).toBeGreaterThan(0);
  });

  it("returns empty when no duplicates exist", () => {
    const code1 = "const x = 1;";
    const code2 = "function foo() { return bar(); }";

    const groups = detectClones(
      [
        { file: "a.ts", tokens: tokenize(code1, "a.ts") },
        { file: "b.ts", tokens: tokenize(code2, "b.ts") },
      ],
      10,
      2,
    );

    expect(groups).toHaveLength(0);
  });

  it("respects minLines filter", () => {
    // Short duplicate that spans only 1-2 lines
    const code = "if (x) { return y; }";
    const tokens = tokenize(code, "test.ts");

    const groups = detectClones(
      [
        { file: "a.ts", tokens },
        { file: "b.ts", tokens },
      ],
      5,
      10, // require 10+ lines — this short snippet won't qualify
    );

    expect(groups).toHaveLength(0);
  });

  it("detects duplication within the same file", () => {
    const code = `
function foo(items) {
  const results = [];
  for (const item of items) {
    if (item.active) {
      const val = transform(item);
      results.push(val);
    }
  }
  return results;
}

function bar(entries) {
  const output = [];
  for (const entry of entries) {
    if (entry.active) {
      const val = transform(entry);
      output.push(val);
    }
  }
  return output;
}
`.trim();

    const tokens = tokenize(code, "same.ts");
    const groups = detectClones([{ file: "same.ts", tokens }], 10, 2);

    expect(groups.length).toBeGreaterThan(0);
    // All instances should be in the same file
    for (const group of groups) {
      for (const inst of group.instances) {
        expect(inst.file).toBe("same.ts");
      }
    }
  });

  it("merges adjacent clone regions into larger groups", () => {
    // Two identical multi-function files — should merge overlapping windows
    const code = `
function alpha(x) {
  const a = compute(x);
  const b = process(a);
  const c = validate(b);
  const d = transform(c);
  const e = finalize(d);
  return e;
}
function beta(y) {
  const a = compute(y);
  const b = process(a);
  const c = validate(b);
  const d = transform(c);
  const e = finalize(d);
  return e;
}
`.trim();

    const tokens1 = tokenize(code, "a.ts");
    const tokens2 = tokenize(code, "b.ts");

    // Use small window so we get many windows that should merge
    const groups = detectClones(
      [
        { file: "a.ts", tokens: tokens1 },
        { file: "b.ts", tokens: tokens2 },
      ],
      8,
      2,
    );

    // After merging, the largest group should span multiple lines
    expect(groups.length).toBeGreaterThan(0);
    const largest = groups[0]!;
    expect(largest.lineCount).toBeGreaterThanOrEqual(4);
  });

  it("removes nested groups (smaller groups within larger ones)", () => {
    // A large duplicated block — inner portions should not be separately reported
    const code = `
function process(data) {
  const items = prepare(data);
  for (const item of items) {
    if (item.active) {
      const result = compute(item);
      store(result);
    }
  }
  return finalize(items);
}
`.trim();

    const tokens1 = tokenize(code, "x.ts");
    const tokens2 = tokenize(code, "y.ts");

    const groups = detectClones(
      [
        { file: "x.ts", tokens: tokens1 },
        { file: "y.ts", tokens: tokens2 },
      ],
      5,
      1,
    );

    // With a small window size (5) over identical code, without nested dedup
    // we'd get many overlapping groups. After dedup, only non-nested groups remain.
    expect(groups.length).toBeGreaterThan(0);

    // The largest group should cover most of the code
    const largest = groups[0]!;
    expect(largest.lineCount).toBeGreaterThanOrEqual(5);

    // All groups should have sequential IDs
    for (let i = 0; i < groups.length; i++) {
      expect(groups[i]!.id).toBe(i + 1);
    }
  });

  it("assigns sequential group IDs starting from 1", () => {
    const code = `
function handler(req, res) {
  const data = parse(req.body);
  const result = process(data);
  validate(result);
  return respond(res, result);
}
`.trim();

    const tokens1 = tokenize(code, "a.ts");
    const tokens2 = tokenize(code, "b.ts");

    const groups = detectClones(
      [
        { file: "a.ts", tokens: tokens1 },
        { file: "b.ts", tokens: tokens2 },
      ],
      5,
      1,
    );

    for (let i = 0; i < groups.length; i++) {
      expect(groups[i]!.id).toBe(i + 1);
    }
  });
});
