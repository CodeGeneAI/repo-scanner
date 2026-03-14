import { readdir, readFile } from "fs/promises";
import path from "path";

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
]);

/**
 * Recursively walk a directory, yielding file paths.
 * Skips common non-source directories for performance.
 */
export async function* walkFiles(
  rootPath: string,
  extensions?: ReadonlySet<string>,
): AsyncGenerator<string> {
  const entries = await readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      yield* walkFiles(path.join(rootPath, entry.name), extensions);
    } else if (entry.isFile()) {
      if (extensions) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!extensions.has(ext)) continue;
      }
      yield path.join(rootPath, entry.name);
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
 */
export const readTextFile = async (
  filePath: string,
): Promise<string | undefined> => {
  try {
    const content = await readFile(filePath, "utf-8");
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
 */
export const readText = async (
  filePath: string,
): Promise<string | undefined> => {
  try {
    return await readFile(filePath, "utf-8");
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
 */
export const readJson = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    // Retry with trailing comma stripping (JSONC)
    try {
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(stripTrailingCommas(content)) as T;
    } catch {
      return undefined;
    }
  }
};
