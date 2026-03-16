import { mapWithConcurrency } from "../../utils/concurrency";
import type { FileIndex } from "../../utils/file-index";
import { readText } from "../../utils/fs";
import { parseFile, SUPPORTED_EXTENSIONS } from "../parser";
import { extractAll } from "../queries";
import type { FileAnalysis } from "../queries/types";
import { analyzeDip } from "./dip";
import { analyzeIsp } from "./isp";
import { analyzeLsp } from "./lsp";
import { analyzeOcp } from "./ocp";
import { buildResult } from "./scorer";
import { analyzeSrp } from "./srp";
import type { SolidHealthResult } from "./types";

const PARSE_CONCURRENCY = 32;
const MAX_FILES_PER_LANGUAGE = 500;

/** Simple deterministic hash for file sampling. */
const simpleHash = (s: string): number => {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

type FileEntry = { path: string; ext: string; relativePath: string };

/** Sample files: up to MAX_FILES_PER_LANGUAGE per language group. */
const sampleFiles = (files: readonly FileEntry[]): FileEntry[] => {
  const byExt = new Map<string, FileEntry[]>();
  for (const f of files) {
    const existing = byExt.get(f.ext);
    if (existing) existing.push(f);
    else byExt.set(f.ext, [f]);
  }

  const sampled: FileEntry[] = [];
  for (const [_ext, group] of byExt) {
    if (group.length <= MAX_FILES_PER_LANGUAGE) {
      sampled.push(...group);
    } else {
      const sorted = [...group].sort(
        (a, b) => simpleHash(a.relativePath) - simpleHash(b.relativePath),
      );
      sampled.push(...sorted.slice(0, MAX_FILES_PER_LANGUAGE));
    }
  }

  return sampled;
};

/** Extension to language name mapping for FileScore. */
const EXT_TO_LANG_NAME: ReadonlyMap<string, string> = new Map([
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".py", "Python"],
  [".go", "Go"],
  [".rs", "Rust"],
  [".cs", "C#"],
  [".java", "Java"],
  [".kt", "Kotlin"],
]);

/**
 * Run full SOLID health analysis on a codebase.
 */
export const analyzeSolid = async (
  rootPath: string,
  index: FileIndex,
): Promise<SolidHealthResult> => {
  // Filter to supported source files
  const allCodeFiles = index
    .all()
    .filter((f) => SUPPORTED_EXTENSIONS.has(f.ext));

  const filesToAnalyze = sampleFiles(allCodeFiles);

  // Parse and extract in parallel
  const fileResults = new Map<string, FileAnalysis>();
  const fileLanguages = new Map<string, string>();

  const results = await mapWithConcurrency(
    filesToAnalyze,
    PARSE_CONCURRENCY,
    async (file) => {
      const source = await readText(file.path);
      if (!source) return null;

      const parsed = await parseFile(source, file.ext);
      if (!parsed) return null;

      const analysis = extractAll(parsed.tree, parsed.lang, file.ext);
      if (!analysis) return null;

      return { relativePath: file.relativePath, ext: file.ext, analysis };
    },
  );

  for (const r of results) {
    if (!r) continue;
    fileResults.set(r.relativePath, r.analysis);
    fileLanguages.set(r.relativePath, EXT_TO_LANG_NAME.get(r.ext) ?? "unknown");
  }

  // Count total classes analyzed
  let analyzedClasses = 0;
  for (const analysis of fileResults.values()) {
    analyzedClasses += analysis.classes.length;
  }

  // Run each principle analyzer
  const srp = analyzeSrp(fileResults);
  const ocp = analyzeOcp(fileResults);
  const lsp = analyzeLsp(fileResults);
  const isp = analyzeIsp(fileResults);
  const dip = analyzeDip(fileResults);

  return buildResult(
    { srp, ocp, lsp, isp, dip },
    fileLanguages,
    fileResults.size,
    analyzedClasses,
  );
};
