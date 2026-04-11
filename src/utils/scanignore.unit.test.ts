import { describe, expect, it } from "bun:test";
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

describe("scoped rules", () => {
  describe("parseIgnoreFile — section headers", () => {
    it("parses section headers and assigns scope", () => {
      const rules = parseIgnoreFile("global\n[env]\ne2e/\n**/*.test.ts");
      expect(rules).toHaveLength(3);
      expect(rules[0]!.scope).toBeUndefined();
      expect(rules[0]!.pattern).toBe("global");
      expect(rules[1]!.scope).toBe("env");
      expect(rules[1]!.pattern).toBe("e2e");
      expect(rules[2]!.scope).toBe("env");
      expect(rules[2]!.pattern).toBe("**/*.test.ts");
    });

    it("resets to global with empty []", () => {
      const rules = parseIgnoreFile("[env]\ne2e/\n[]\nglobal-again");
      expect(rules).toHaveLength(2);
      expect(rules[0]!.scope).toBe("env");
      expect(rules[1]!.scope).toBeUndefined();
    });

    it("supports multiple sections", () => {
      const rules = parseIgnoreFile("[env]\ne2e/\n[api]\n**/*.test.ts");
      expect(rules).toHaveLength(2);
      expect(rules[0]!.scope).toBe("env");
      expect(rules[1]!.scope).toBe("api");
    });
  });

  describe("parseIgnoreFile — inline prefix", () => {
    it("parses inline scope prefix", () => {
      const rules = parseIgnoreFile("env:e2e/");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.scope).toBe("env");
      expect(rules[0]!.pattern).toBe("e2e");
      expect(rules[0]!.dirOnly).toBe(true);
    });

    it("parses inline scope with glob pattern", () => {
      const rules = parseIgnoreFile("api:**/*.test.ts");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.scope).toBe("api");
      expect(rules[0]!.pattern).toBe("**/*.test.ts");
    });

    it("parses negated inline scope prefix", () => {
      const rules = parseIgnoreFile("!env:important.log");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.scope).toBe("env");
      expect(rules[0]!.negated).toBe(true);
      expect(rules[0]!.pattern).toBe("important.log");
    });

    it("does not treat single-char prefix as scope (e.g. c: drive)", () => {
      const rules = parseIgnoreFile("c:users");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.scope).toBeUndefined();
      expect(rules[0]!.pattern).toBe("c:users");
    });
  });

  describe("buildIgnoreMatcher — scoped filtering", () => {
    it("global rules apply without scope", () => {
      const rules = parseIgnoreFile("**/bench/\n[env]\ne2e/");
      const matcher = buildIgnoreMatcher(rules);

      // Global rule applies without scope
      expect(matcher.ignores("packages/bench", true)).toBe(true);
      // Scoped rule does NOT apply without scope
      expect(matcher.ignores("e2e", true)).toBe(false);
    });

    it("scoped rules apply when queried with matching scope", () => {
      const rules = parseIgnoreFile("[env]\ne2e/\n**/*.test.ts");
      const matcher = buildIgnoreMatcher(rules);

      // Applies with matching scope
      expect(matcher.ignores("e2e", true, "env")).toBe(true);
      expect(matcher.ignores("src/foo.test.ts", false, "env")).toBe(true);

      // Does NOT apply with different scope
      expect(matcher.ignores("e2e", true, "api")).toBe(false);
      expect(matcher.ignores("src/foo.test.ts", false, "api")).toBe(false);

      // Does NOT apply without scope (file walk)
      expect(matcher.ignores("e2e", true)).toBe(false);
    });

    it("global + scoped rules combine when scope is provided", () => {
      const rules = parseIgnoreFile("**/bench/\n[env]\ne2e/");
      const matcher = buildIgnoreMatcher(rules);

      // Global rule applies even when scope is provided
      expect(matcher.ignores("packages/bench", true, "env")).toBe(true);
      // Scoped rule also applies
      expect(matcher.ignores("e2e", true, "env")).toBe(true);
    });

    it("inline prefix scoping works", () => {
      const rules = parseIgnoreFile("env:e2e/\napi:**/*.test.ts");
      const matcher = buildIgnoreMatcher(rules);

      expect(matcher.ignores("e2e", true, "env")).toBe(true);
      expect(matcher.ignores("e2e", true, "api")).toBe(false);
      expect(matcher.ignores("src/foo.test.ts", false, "api")).toBe(true);
      expect(matcher.ignores("src/foo.test.ts", false, "env")).toBe(false);
    });

    it("scoped rules are inherited through child matchers", () => {
      const rootRules = parseIgnoreFile("[env]\n**/*.test.ts");
      const rootMatcher = buildIgnoreMatcher(rootRules);

      const childRules = parseIgnoreFile("[env]\nfixtures/");
      const childMatcher = rootMatcher.child("packages/sdk", childRules);

      // Parent scoped rule still applies
      expect(childMatcher.ignores("src/foo.test.ts", false, "env")).toBe(true);
      // Child scoped rule applies within child scope
      expect(childMatcher.ignores("packages/sdk/fixtures", true, "env")).toBe(
        true,
      );
      // Neither applies without scope
      expect(childMatcher.ignores("src/foo.test.ts", false)).toBe(false);
      expect(childMatcher.ignores("packages/sdk/fixtures", true)).toBe(false);
    });

    it("negation works within scoped section headers", () => {
      const rules = parseIgnoreFile("[env]\n**/*.test.ts\n!critical.test.ts");
      const matcher = buildIgnoreMatcher(rules);

      expect(matcher.ignores("src/foo.test.ts", false, "env")).toBe(true);
      expect(matcher.ignores("critical.test.ts", false, "env")).toBe(false);
    });
  });

  describe("dirOnly rules match files inside directory", () => {
    it("anchored dirOnly rule matches files inside the directory", () => {
      const rules = parseIgnoreFile("[env]\n/e2e/");
      const matcher = buildIgnoreMatcher(rules);

      // Directory itself still matches
      expect(matcher.ignores("e2e", true, "env")).toBe(true);
      // Files inside should also match
      expect(matcher.ignores("e2e/setup/global.setup.ts", false, "env")).toBe(
        true,
      );
      expect(matcher.ignores("e2e/helpers/utils.ts", false, "env")).toBe(true);
      // Files outside should not match
      expect(matcher.ignores("src/e2e-utils.ts", false, "env")).toBe(false);
      expect(matcher.ignores("src/index.ts", false, "env")).toBe(false);
    });

    it("unanchored dirOnly rule matches files inside matching directories", () => {
      const rules = parseIgnoreFile("[env]\nbench/");
      const matcher = buildIgnoreMatcher(rules);

      // Top-level
      expect(matcher.ignores("bench/run.ts", false, "env")).toBe(true);
      // Nested
      expect(matcher.ignores("packages/foo/bench/perf.ts", false, "env")).toBe(
        true,
      );
      // Non-matching
      expect(matcher.ignores("benchmark.ts", false, "env")).toBe(false);
    });

    it("dirOnly rule does not apply without matching scope", () => {
      const rules = parseIgnoreFile("[env]\n/e2e/");
      const matcher = buildIgnoreMatcher(rules);

      expect(matcher.ignores("e2e/setup/global.setup.ts", false)).toBe(false);
    });
  });
});
