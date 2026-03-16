import { readdir } from "fs/promises";
import path from "path";

/** Maximum directory recursion depth to prevent symlink loops and pathological nesting. */
const MAX_WALK_DEPTH = 50;

/** Maximum file size in bytes to read into memory (5 MB). */
const MAX_READ_SIZE = 5 * 1024 * 1024;

const IGNORE_DIRS = new Set([
  "node_modules",
  "vendor",
  ".git",
  "dist",
  "build",
  "target",
  "__pycache__",
  ".tox",
  ".venv",
  "venv",
  ".mypy_cache",
  ".gradle",
  "bin",
  "obj",
  ".dart_tool",
  ".pub-cache",
  "Pods",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  ".turbo",
  "deps",
]);

/** Dot-prefixed directories that should be included when scanning repo structure. */
const INCLUDE_DOT_DIRS = new Set([
  ".github",
  ".circleci",
  ".husky",
  ".changeset",
  ".buildkite",
  ".vscode",
  ".azure",
]);

export interface WalkOptions {
  /** File extensions to include (e.g. new Set([".ts", ".py"])). All files if undefined. */
  extensions?: ReadonlySet<string>;
  /** Include specific dot-prefixed directories (.github, .circleci, etc.) */
  includeDotDirs?: boolean;
}

/**
 * Recursively walk a directory, yielding file paths.
 * Skips common non-source directories, symlinks, and enforces a depth limit.
 */
export async function* walkFiles(
  rootPath: string,
  options?: WalkOptions,
  depth = 0,
): AsyncGenerator<string> {
  if (depth > MAX_WALK_DEPTH) return;

  // Keep readdir from fs/promises — Bun has no Dirent-returning equivalent
  const entries = await readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip symlinks entirely to prevent loops and directory escape
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".")) {
        if (!options?.includeDotDirs || !INCLUDE_DOT_DIRS.has(entry.name)) {
          continue;
        }
      }
      yield* walkFiles(path.join(rootPath, entry.name), options, depth + 1);
    } else if (entry.isFile()) {
      if (options?.extensions) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!options.extensions.has(ext)) continue;
      }
      yield path.join(rootPath, entry.name);
    }
  }
}

/**
 * Find files matching specific filename patterns.
 */
export async function findFiles(
  rootPath: string,
  fileNames: readonly string[],
  options?: { includeDotDirs?: boolean },
): Promise<string[]> {
  const results: string[] = [];
  const extensionSet = new Set(
    fileNames.filter((f) => f.startsWith("*.")).map((f) => f.slice(1)),
  );
  const exactNameSet = new Set(fileNames.filter((f) => !f.startsWith("*")));

  for await (const filePath of walkFiles(rootPath, {
    includeDotDirs: options?.includeDotDirs,
  })) {
    const baseName = path.basename(filePath);
    if (exactNameSet.has(baseName)) {
      results.push(filePath);
      continue;
    }
    const ext = path.extname(baseName);
    if (extensionSet.has(ext)) {
      results.push(filePath);
    }
  }

  return results;
}

/**
 * Read a file as UTF-8 text, returning undefined on any error.
 * Skips files larger than MAX_READ_SIZE to prevent OOM on huge files.
 * Uses Bun's native file I/O for performance.
 */
export const readText = async (
  filePath: string,
): Promise<string | undefined> => {
  try {
    const file = Bun.file(filePath);
    if (file.size > MAX_READ_SIZE) return undefined;
    return await file.text();
  } catch {
    return undefined;
  }
};

/**
 * Strip trailing commas from JSON-like content (JSONC support).
 */
const stripTrailingCommas = (text: string): string =>
  text.replace(/,(\s*[}\]])/g, "$1");

/**
 * Read and parse a JSON file, returning undefined on any error.
 * Supports JSONC (trailing commas).
 * Uses Bun's native file I/O for performance.
 */
export const readJson = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    const content = await Bun.file(filePath).text();
    try {
      return JSON.parse(content) as T;
    } catch {
      // Retry with JSONC support (strip trailing commas)
      return JSON.parse(stripTrailingCommas(content)) as T;
    }
  } catch {
    return undefined;
  }
};

/** Count newlines in a file. Returns 0 on read errors. Uses Bun's native file I/O. */
export const countLines = async (filePath: string): Promise<number> => {
  try {
    const content = await Bun.file(filePath).text();
    if (content.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10) count++;
    }
    // A non-empty file with no trailing newline still has at least 1 line
    if (content.charCodeAt(content.length - 1) !== 10) count++;
    return count;
  } catch {
    return 0;
  }
};
