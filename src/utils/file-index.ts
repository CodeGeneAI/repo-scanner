import { readdir } from "fs/promises";
import path from "path";
import { IGNORE_DIRS, INCLUDE_DOT_DIRS, walkFiles } from "./fs";
import type { IgnoreMatcher, IgnoreRule } from "./scanignore";
import { buildIgnoreMatcher, readScanignore } from "./scanignore";

/** Directory names that indicate secondary content (examples, test fixtures, playgrounds, etc.) */
const SECONDARY_DIR_NAMES = new Set([
  "examples",
  "example",
  "test",
  "tests",
  "testdata",
  "test-data",
  "__tests__",
  "__fixtures__",
  "fixtures",
  "playground",
  "playgrounds",
  "samples",
  "sample",
  "benchmarks",
  "benchmark",
  "demo",
  "demos",
  "truth",
  "__testfixtures__",
  "compiled",
]);

/** Check if a relative path contains any secondary (example/test/fixture) directory segment. */
export const isSecondaryPath = (relativePath: string): boolean => {
  const segments = relativePath.split("/");
  // Check all segments except the last (which is the filename)
  for (let i = 0; i < segments.length - 1; i++) {
    if (SECONDARY_DIR_NAMES.has(segments[i]!)) return true;
  }
  return false;
};

export interface IndexedFile {
  /** Full absolute path */
  readonly path: string;
  /** Just the filename (e.g. "package.json") */
  readonly name: string;
  /** Lowercase extension including dot (e.g. ".ts") */
  readonly ext: string;
  /** Path relative to scan root */
  readonly relativePath: string;
}

/**
 * In-memory file index built from a single filesystem walk.
 * All detectors query this index instead of touching disk.
 */
export class FileIndex {
  private readonly files: IndexedFile[] = [];
  private readonly byName = new Map<string, IndexedFile[]>();
  private readonly byExt = new Map<string, IndexedFile[]>();
  readonly rootPath: string;
  /** The ignore matcher (if a .scanignore was found). Detectors use this for scoped filtering. */
  readonly ignoreMatcher?: IgnoreMatcher;

  constructor(rootPath: string, ignoreMatcher?: IgnoreMatcher) {
    this.rootPath = rootPath;
    this.ignoreMatcher = ignoreMatcher;
  }

  /** Add a single entry to the index, updating all lookup maps. */
  private addEntry(entry: IndexedFile): void {
    this.files.push(entry);

    const byNameList = this.byName.get(entry.name);
    if (byNameList) byNameList.push(entry);
    else this.byName.set(entry.name, [entry]);

    const byExtList = this.byExt.get(entry.ext);
    if (byExtList) byExtList.push(entry);
    else this.byExt.set(entry.ext, [entry]);
  }

  /** Build the index by walking the filesystem once. */
  static async build(rootPath: string): Promise<FileIndex> {
    const rootRules = await collectScanignoreRules(rootPath);
    const ignoreMatcher =
      rootRules.length > 0 ? buildIgnoreMatcher(rootRules) : undefined;

    const index = new FileIndex(rootPath, ignoreMatcher);
    for await (const filePath of walkFiles(rootPath, {
      includeDotDirs: true,
      ignoreMatcher,
      rootForRelative: rootPath,
      loadNestedScanignore: false,
    })) {
      const name = path.basename(filePath);
      const ext = path.extname(name).toLowerCase();
      const relativePath = path.relative(rootPath, filePath);
      index.addEntry({ path: filePath, name, ext, relativePath });
    }
    return index;
  }

  /** Get all indexed files. */
  all(): readonly IndexedFile[] {
    return this.files;
  }

  /** Total number of files indexed. */
  get size(): number {
    return this.files.length;
  }

  /** Check if a file with the given name exists anywhere in the repo. */
  hasFile(name: string): boolean {
    return this.byName.has(name);
  }

  /** Get all files with the given filename. */
  getByName(name: string): readonly IndexedFile[] {
    return this.byName.get(name) ?? [];
  }

  /** Get all files with the given extension (including dot, e.g. ".ts"). */
  getByExtension(ext: string): readonly IndexedFile[] {
    return this.byExt.get(ext.toLowerCase()) ?? [];
  }

  /** Get all files under a specific relative path prefix (e.g. ".github/workflows"). */
  getUnderPath(relativePrefix: string): readonly IndexedFile[] {
    const prefix = relativePrefix.endsWith("/")
      ? relativePrefix
      : `${relativePrefix}/`;
    return this.files.filter(
      (f) =>
        f.relativePath.startsWith(prefix) || f.relativePath === relativePrefix,
    );
  }

  /** Get all files matching a glob-like pattern (simple: "*.yml", "*.tf", etc.) */
  getByPattern(pattern: string): readonly IndexedFile[] {
    if (pattern.startsWith("*.")) {
      return this.getByExtension(pattern.slice(1));
    }
    return this.getByName(pattern);
  }

  /** Get all files with the given filename, excluding secondary paths (examples, tests, fixtures). */
  getByNamePrimary(name: string): readonly IndexedFile[] {
    return (this.byName.get(name) ?? []).filter(
      (f) => !isSecondaryPath(f.relativePath),
    );
  }

  /** Check if a file with the given name exists outside secondary paths. */
  hasFilePrimary(name: string): boolean {
    return this.getByNamePrimary(name).length > 0;
  }

  /** Get files by extension, excluding secondary paths. */
  getByExtensionPrimary(ext: string): readonly IndexedFile[] {
    return (this.byExt.get(ext.toLowerCase()) ?? []).filter(
      (f) => !isSecondaryPath(f.relativePath),
    );
  }

  /** Check if any file exists matching one of the given names/patterns. */
  hasAny(patterns: readonly string[]): boolean {
    return patterns.some((p) => {
      if (p.startsWith("*."))
        return (this.byExt.get(p.slice(1))?.length ?? 0) > 0;
      return this.byName.has(p);
    });
  }
}

/**
 * Collect .scanignore rules from root and nested directories, preserving
 * directory-local scope by prefixing nested patterns.
 */
const collectScanignoreRules = async (
  rootPath: string,
): Promise<IgnoreRule[]> => {
  const rules: IgnoreRule[] = [];
  const stack: string[] = [rootPath];

  while (stack.length > 0) {
    const dirPath = stack.pop()!;
    const dirRel = path.relative(rootPath, dirPath);

    const localRules = await readScanignore(dirPath);
    for (const rule of localRules) {
      // Root rules are already relative to scan root.
      if (dirRel === "") {
        rules.push(rule);
        continue;
      }

      // Nested rules must remain constrained to their directory subtree.
      const scopedPattern = rule.anchored
        ? `${dirRel}/${rule.pattern}`
        : `${dirRel}/**/${rule.pattern}`;
      rules.push({ ...rule, anchored: true, pattern: scopedPattern });
    }

    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (!entry.isDirectory()) continue;

      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".") && !INCLUDE_DOT_DIRS.has(entry.name)) {
        continue;
      }

      stack.push(path.join(dirPath, entry.name));
    }
  }

  return rules;
};
