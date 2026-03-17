import { readdir } from "fs/promises";
import path from "path";
import { IGNORE_DIRS, MAX_WALK_DEPTH } from "../../utils/fs";
import type { IgnoreMatcher } from "../../utils/scanignore";
import { buildIgnoreMatcher, readScanignore } from "../../utils/scanignore";

export interface DepWalkOptions {
  extensions?: ReadonlySet<string>;
  ignoreMatcher?: IgnoreMatcher;
  rootForRelative?: string;
}

/**
 * Recursively walk a directory, yielding file paths.
 * Skips common non-source directories for performance.
 */
export async function* walkFiles(
  rootPath: string,
  extensionsOrOptions?: ReadonlySet<string> | DepWalkOptions,
  depth = 0,
): AsyncGenerator<string> {
  if (depth > MAX_WALK_DEPTH) return;

  // Support both legacy (extensions Set) and new (options object) signatures
  const options: DepWalkOptions | undefined =
    extensionsOrOptions instanceof Set
      ? { extensions: extensionsOrOptions }
      : (extensionsOrOptions as DepWalkOptions | undefined);

  const relativeRoot = options?.rootForRelative ?? rootPath;
  let matcher = options?.ignoreMatcher;

  // Check for nested .scanignore
  if (depth > 0) {
    const childRules = await readScanignore(rootPath);
    if (childRules.length > 0) {
      const dirRel = path.relative(relativeRoot, rootPath);
      if (matcher) {
        matcher = matcher.child(dirRel, childRules);
      } else {
        matcher = buildIgnoreMatcher(
          childRules.map((r) =>
            r.anchored ? { ...r, pattern: `${dirRel}/${r.pattern}` } : r,
          ),
        );
      }
    }
  }

  // Keep readdir from fs/promises — Bun has no Dirent-returning equivalent
  const entries = await readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(rootPath, entry.name);
      const relativePath = path.relative(relativeRoot, fullPath);

      if (matcher?.ignores(relativePath, true)) continue;

      yield* walkFiles(
        fullPath,
        {
          ...options,
          ignoreMatcher: matcher,
          rootForRelative: relativeRoot,
        } as DepWalkOptions,
        depth + 1,
      );
    } else if (entry.isFile()) {
      if (options?.extensions) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!options.extensions.has(ext)) continue;
      }
      const fullPath = path.join(rootPath, entry.name);
      const relativePath = path.relative(relativeRoot, fullPath);

      if (matcher?.ignores(relativePath, false)) continue;

      yield fullPath;
    }
  }
}

/**
 * Find files matching specific glob-like filename patterns (not full glob, just name matching).
 */
export async function findFiles(
  rootPath: string,
  fileNames: readonly string[],
): Promise<string[]> {
  const results: string[] = [];
  const extensionSet = new Set(
    fileNames.filter((f) => f.startsWith("*.")).map((f) => f.slice(1)),
  );
  const exactNameSet = new Set(fileNames.filter((f) => !f.startsWith("*")));

  for await (const filePath of walkFiles(rootPath)) {
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
 * Read a file as UTF-8 text, returning undefined if it doesn't exist or is binary.
 * Uses Bun's native file I/O for performance.
 */
export const readTextFile = async (
  filePath: string,
): Promise<string | undefined> => {
  try {
    const content = await Bun.file(filePath).text();
    // Quick binary check: if there's a null byte in the first 8KB, skip it
    if (content.slice(0, 8192).includes("\0")) return undefined;
    return content;
  } catch {
    return undefined;
  }
};

/**
 * Read a file as UTF-8 text, returning undefined on any error.
 * Unlike readTextFile, this does not perform a binary check.
 * Uses Bun's native file I/O for performance.
 */
export const readText = async (
  filePath: string,
): Promise<string | undefined> => {
  try {
    return await Bun.file(filePath).text();
  } catch {
    return undefined;
  }
};

/**
 * Strip trailing commas from JSON-like content (JSONC support for bun.lock etc).
 */
const stripTrailingCommas = (text: string): string =>
  text.replace(/,(\s*[}\]])/g, "$1");

/**
 * Read and parse a JSON file, returning undefined on any error.
 * Supports JSONC (trailing commas) for compatibility with bun.lock.
 * Uses Bun's native file I/O for performance.
 */
export const readJson = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    const content = await Bun.file(filePath).text();
    try {
      return JSON.parse(content) as T;
    } catch {
      // Retry with trailing comma stripping (JSONC)
      return JSON.parse(stripTrailingCommas(content)) as T;
    }
  } catch {
    return undefined;
  }
};
