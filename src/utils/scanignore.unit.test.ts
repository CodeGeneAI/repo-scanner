import { describe, expect, it, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { walkFiles } from "./fs";
import { buildIgnoreMatcher, parseIgnoreFile } from "./scanignore";

describe("parseIgnoreFile", () => {
  it("parses basic patterns", () => {
    const rules = parseIgnoreFile("node_modules\ndist\n");
    expect(rules).toHaveLength(2);
    expect(rules[0]!.pattern).toBe("node_modules");
    expect(rules[1]!.pattern).toBe("dist");
  });

  it("skips empty lines and comments", () => {
    const rules = parseIgnoreFile("# comment\n\nfoo\n  \n# another\nbar");
    expect(rules).toHaveLength(2);
    expect(rules[0]!.pattern).toBe("foo");
    expect(rules[1]!.pattern).toBe("bar");
  });

  it("handles negation prefix", () => {
    const rules = parseIgnoreFile("!important");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.negated).toBe(true);
    expect(rules[0]!.pattern).toBe("important");
  });

  it("handles trailing slash for dir-only", () => {
    const rules = parseIgnoreFile("build/");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.dirOnly).toBe(true);
    expect(rules[0]!.pattern).toBe("build");
  });

  it("handles leading slash for anchored", () => {
    const rules = parseIgnoreFile("/src");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.anchored).toBe(true);
    expect(rules[0]!.pattern).toBe("src");
  });

  it("detects anchored patterns with internal slash", () => {
    const rules = parseIgnoreFile("packages/foo");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.anchored).toBe(true);
    expect(rules[0]!.pattern).toBe("packages/foo");
  });
});

describe("buildIgnoreMatcher", () => {
  it("ignores matching directories", () => {
    const rules = parseIgnoreFile("bench/");
    const matcher = buildIgnoreMatcher(rules);
    expect(matcher.ignores("bench", true)).toBe(true);
    expect(matcher.ignores("bench", false)).toBe(false); // dirOnly
    expect(matcher.ignores("packages/bench", true)).toBe(true); // unanchored
  });

  it("ignores matching files", () => {
    const rules = parseIgnoreFile("*.log");
    const matcher = buildIgnoreMatcher(rules);
    expect(matcher.ignores("debug.log", false)).toBe(true);
    expect(matcher.ignores("src/debug.log", false)).toBe(true);
  });

  it("handles anchored patterns", () => {
    const rules = parseIgnoreFile("/scripts");
    const matcher = buildIgnoreMatcher(rules);
    expect(matcher.ignores("scripts", true)).toBe(true);
    expect(matcher.ignores("packages/scripts", true)).toBe(false); // anchored to root
  });

  it("handles anchored path patterns", () => {
    const rules = parseIgnoreFile("packages/foo/");
    const matcher = buildIgnoreMatcher(rules);
    expect(matcher.ignores("packages/foo", true)).toBe(true);
    expect(matcher.ignores("other/packages/foo", true)).toBe(false); // anchored
  });

  it("handles ** glob patterns", () => {
    const rules = parseIgnoreFile("**/bench/");
    const matcher = buildIgnoreMatcher(rules);
    expect(matcher.ignores("bench", true)).toBe(true);
    expect(matcher.ignores("packages/sdk/bench", true)).toBe(true);
    expect(matcher.ignores("deep/nested/bench", true)).toBe(true);
  });

  it("handles negation (un-ignore)", () => {
    const rules = parseIgnoreFile("*.log\n!important.log");
    const matcher = buildIgnoreMatcher(rules);
    expect(matcher.ignores("debug.log", false)).toBe(true);
    expect(matcher.ignores("important.log", false)).toBe(false);
  });

  it("does not ignore unmatched paths", () => {
    const rules = parseIgnoreFile("dist/");
    const matcher = buildIgnoreMatcher(rules);
    expect(matcher.ignores("src", true)).toBe(false);
    expect(matcher.ignores("src/index.ts", false)).toBe(false);
  });

  it("handles child matcher (additive nesting)", () => {
    const rootRules = parseIgnoreFile("*.log");
    const rootMatcher = buildIgnoreMatcher(rootRules);

    const childRules = parseIgnoreFile("temp/");
    const childMatcher = rootMatcher.child("packages/sdk", childRules);

    // Parent rules still apply
    expect(childMatcher.ignores("debug.log", false)).toBe(true);
    // Child rules apply within child scope
    expect(childMatcher.ignores("packages/sdk/temp", true)).toBe(true);
  });

  it("returns false for empty rules", () => {
    const matcher = buildIgnoreMatcher([]);
    expect(matcher.ignores("anything", false)).toBe(false);
    expect(matcher.ignores("anything", true)).toBe(false);
  });

  it("handles wildcard in directory names", () => {
    const rules = parseIgnoreFile("test-*");
    const matcher = buildIgnoreMatcher(rules);
    expect(matcher.ignores("test-utils", true)).toBe(true);
    expect(matcher.ignores("test-data", false)).toBe(true);
    expect(matcher.ignores("testing", false)).toBe(false);
  });
});

test("walker re-includes child of an ignored directory via negation", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rs-neg-"));
  await mkdir(path.join(dir, "tools/critical-tool"), { recursive: true });
  await mkdir(path.join(dir, "tools/other"), { recursive: true });
  await mkdir(path.join(dir, "src"), { recursive: true });
  await writeFile(path.join(dir, "src/a.js"), "1\n");
  await writeFile(path.join(dir, "tools/critical-tool/c.js"), "1\n");
  await writeFile(path.join(dir, "tools/other/d.js"), "1\n");
  await writeFile(
    path.join(dir, ".scanignore"),
    "tools/\n!tools/critical-tool/\n",
  );
  const files: string[] = [];
  for await (const f of walkFiles(dir, { rootForRelative: dir })) {
    files.push(path.relative(dir, f));
  }
  files.sort();
  expect(files).toEqual([
    ".scanignore",
    "src/a.js",
    "tools/critical-tool/c.js",
  ]);
});
