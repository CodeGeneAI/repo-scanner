import path from "path";
import { readText } from "./fs";

export interface IgnoreRule {
  /** The glob pattern (after stripping negation prefix and trailing slash). */
  readonly pattern: string;
  /** True if the rule starts with `!` (un-ignore). */
  readonly negated: boolean;
  /** True if the original pattern ended with `/` (directory-only match). */
  readonly dirOnly: boolean;
  /** True if the pattern is anchored (contains `/` other than trailing). */
  readonly anchored: boolean;
}

export interface IgnoreMatcher {
  /**
   * Returns true if the relative path should be ignored.
   * @param relativePath - path relative to the scan root
   * @param isDirectory  - whether the path is a directory
   */
  ignores(relativePath: string, isDirectory: boolean): boolean;
  /** Create a child matcher that inherits parent rules and adds new ones scoped to a subdirectory. */
  child(childDir: string, rules: readonly IgnoreRule[]): IgnoreMatcher;
}

const SCANIGNORE_FILE = ".scanignore";

/**
 * Parse a `.scanignore` file into rules.
 *
 * Supports gitignore-style global rules only: glob patterns, `!` negation,
 * trailing `/` for directory-only, leading `/` for anchored, comments (`#`),
 * and blank lines.
 */
export const parseIgnoreFile = (content: string): IgnoreRule[] => {
  const rules: IgnoreRule[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (line === "" || line.startsWith("#")) continue;

    const rule = parseSingleRule(line);
    if (!rule) continue;

    rules.push(rule);
  }

  return rules;
};

/** Parse a single pattern line into a rule. */
const parseSingleRule = (input: string): IgnoreRule | undefined => {
  let pattern = input.trim();
  if (pattern === "") return undefined;

  let negated = false;

  // Negation
  if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1);
  }

  // Trailing slash means directory-only
  const dirOnly = pattern.endsWith("/");
  if (dirOnly) {
    pattern = pattern.slice(0, -1);
  }

  // Leading slash means anchored (remove it, we track via flag)
  const hasLeadingSlash = pattern.startsWith("/");
  if (hasLeadingSlash) {
    pattern = pattern.slice(1);
  }

  // Anchored if it contains a slash (after removing leading/trailing)
  const anchored = hasLeadingSlash || pattern.includes("/");

  if (pattern === "") return undefined;

  return { pattern, negated, dirOnly, anchored };
};

/**
 * Test whether a single rule matches a relative path.
 * Uses gitignore-style matching semantics.
 */
const ruleMatches = (
  rule: IgnoreRule,
  relativePath: string,
  isDirectory: boolean,
): boolean => {
  // dirOnly rules only match directories when checking a directory entry.
  // When checking a file, a dirOnly rule still matches if the file lives
  // inside the matched directory (gitignore semantics: "e2e/" ignores
  // everything under e2e/).
  if (rule.dirOnly && !isDirectory) {
    const dirPrefix = `${rule.pattern}/`;
    // Check if the file is inside the directory
    if (rule.anchored) {
      return relativePath.startsWith(dirPrefix);
    }
    // Unanchored: match against any path segment prefix
    if (relativePath.startsWith(dirPrefix)) return true;
    return relativePath.includes(`/${dirPrefix}`);
  }

  const { pattern, anchored } = rule;

  if (anchored) {
    // Anchored patterns match from the beginning of the relative path
    return globMatch(pattern, relativePath);
  }

  // Unanchored patterns match against any trailing path segment(s)
  // e.g., "bench" matches "foo/bench" and "bench"
  if (globMatch(pattern, relativePath)) return true;

  // Also try matching against each suffix starting after a /
  const segments = relativePath.split("/");
  for (let i = 1; i < segments.length; i++) {
    const suffix = segments.slice(i).join("/");
    if (globMatch(pattern, suffix)) return true;
  }

  return false;
};

/** Cache for compiled glob regexes to avoid recompilation per match. */
const globRegexCache = new Map<string, RegExp | null>();

/** Compile a glob pattern to a RegExp (cached). Returns null on invalid patterns. */
const compileGlob = (pattern: string): RegExp | null => {
  const cached = globRegexCache.get(pattern);
  if (cached !== undefined) return cached;

  let regex = "^";
  let i = 0;

  while (i < pattern.length) {
    const c = pattern[i]!;

    if (c === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          regex += "(?:.+/)?";
          i += 3;
        } else {
          regex += ".*";
          i += 2;
        }
      } else {
        regex += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      regex += "[^/]";
      i++;
    } else if (
      c === "." ||
      c === "(" ||
      c === ")" ||
      c === "+" ||
      c === "^" ||
      c === "$" ||
      c === "{" ||
      c === "}" ||
      c === "|" ||
      c === "[" ||
      c === "]" ||
      c === "\\"
    ) {
      regex += `\\${c}`;
      i++;
    } else {
      regex += c;
      i++;
    }
  }

  regex += "$";

  try {
    const compiled = new RegExp(regex);
    globRegexCache.set(pattern, compiled);
    return compiled;
  } catch {
    globRegexCache.set(pattern, null);
    return null;
  }
};

/**
 * Simple glob matcher supporting:
 * - `*` matches anything except `/`
 * - `**` matches anything including `/`
 * - `?` matches any single character except `/`
 */
const globMatch = (pattern: string, text: string): boolean => {
  const re = compileGlob(pattern);
  return re ? re.test(text) : false;
};

/** Build an IgnoreMatcher from a set of rules. */
export const buildIgnoreMatcher = (
  rules: readonly IgnoreRule[],
): IgnoreMatcher => {
  return createMatcher(rules);
};

const createMatcher = (rules: readonly IgnoreRule[]): IgnoreMatcher => {
  return {
    ignores(relativePath: string, isDirectory: boolean): boolean {
      let ignored = false;

      for (const rule of rules) {
        if (ruleMatches(rule, relativePath, isDirectory)) {
          ignored = !rule.negated;
        }
      }

      return ignored;
    },

    child(childDir: string, childRules: readonly IgnoreRule[]): IgnoreMatcher {
      const childPrefix = childDir.endsWith("/") ? childDir : `${childDir}/`;
      // Combine parent rules with child rules anchored to the child directory
      const combined = [
        ...rules,
        ...childRules.map((r) => ({
          ...r,
          // Prefix anchored child patterns with the child directory path
          pattern: r.anchored ? `${childPrefix}${r.pattern}` : r.pattern,
        })),
      ];
      return createMatcher(combined);
    },
  };
};

/**
 * Try to read a `.scanignore` file from a directory.
 * Returns parsed rules, or empty array if file doesn't exist.
 */
export const readScanignore = async (
  dirPath: string,
): Promise<IgnoreRule[]> => {
  const content = await readText(path.join(dirPath, SCANIGNORE_FILE));
  if (!content) return [];
  return parseIgnoreFile(content);
};
