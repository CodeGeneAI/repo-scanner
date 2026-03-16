import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { detectClones } from "./detector/detector";
import { tokenize } from "./tokenizer/tokenizer";
import type { DryCheckResult, DryCheckStats, FilterOptions } from "./types";

const DEFAULT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".cs",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".swift",
  ".php",
  ".lua",
  ".scala",
  ".dart",
]);

export interface DuplicationScanOptions {
  readonly minTokens?: number;
  readonly minLines?: number;
  readonly extensions?: ReadonlySet<string>;
  readonly filters?: FilterOptions;
}

/**
 * Scan for code duplication using the FileIndex (no separate file walk).
 */
export const scanForDuplicates = async (
  rootPath: string,
  index: FileIndex,
  options?: DuplicationScanOptions,
): Promise<DryCheckResult> => {
  const start = performance.now();
  const minTokens = options?.minTokens ?? 50;
  const minLines = options?.minLines ?? 6;
  const extensions = options?.extensions ?? DEFAULT_EXTENSIONS;

  // Phase 1: Read files from index and tokenize
  const fileTokens: { file: string; tokens: ReturnType<typeof tokenize> }[] =
    [];
  let totalTokens = 0;
  let totalLines = 0;
  let filesScanned = 0;

  const codeFiles = index.all().filter((f) => extensions.has(f.ext));

  for (const file of codeFiles) {
    const source = await readText(file.path);
    if (!source) continue;

    const tokens = tokenize(source, file.path);

    // Count actual source lines
    let lineCount = 0;
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\n") lineCount++;
    }
    if (source.length > 0 && source[source.length - 1] !== "\n") lineCount++;
    totalLines += lineCount;

    if (tokens.length > 0) {
      fileTokens.push({ file: file.relativePath, tokens });
      totalTokens += tokens.length;
    }
    filesScanned++;
  }

  // Phase 2: Detect clones
  const groups = detectClones(
    fileTokens,
    minTokens,
    minLines,
    options?.filters,
  );

  // Phase 3: Compute stats
  const duplicatedLineSet = new Set<string>();
  for (const group of groups) {
    for (const inst of group.instances) {
      for (let line = inst.startLine; line <= inst.endLine; line++) {
        duplicatedLineSet.add(`${inst.file}:${line}`);
      }
    }
  }

  const stats: DryCheckStats = {
    filesScanned,
    totalTokens,
    duplicateGroups: groups.length,
    duplicatedLines: duplicatedLineSet.size,
    duplicationPercentage:
      totalLines > 0
        ? Math.round((duplicatedLineSet.size / totalLines) * 1000) / 10
        : 0,
  };

  return {
    scanPath: rootPath,
    durationMs: Math.round(performance.now() - start),
    groups,
    stats,
  };
};
