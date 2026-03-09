import type { FileIndex } from "../../utils/file-index";
import { classifyCase } from "./case-classifier";
import type { CaseStyle, NamingPattern } from "./types";

/** File names that are too generic to classify meaningfully. */
const SKIP_FILE_NAMES = new Set([
  "index",
  "main",
  "mod",
  "lib",
  "init",
  "setup",
  "config",
  "app",
  "server",
  "client",
  "types",
  "utils",
  "helpers",
  "constants",
  "globals",
]);

/** Directory names to ignore when analyzing naming patterns. */
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "target",
  ".git",
  ".github",
  ".vscode",
  ".idea",
  "__pycache__",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  "vendor",
  "bin",
  "obj",
  "src",
  "lib",
  "out",
]);

const buildPattern = (
  category: "file" | "directory",
  counts: Map<CaseStyle, number>,
  total: number,
): NamingPattern | undefined => {
  if (total === 0) return undefined;

  let dominant: CaseStyle = "mixed";
  let maxCount = 0;
  const breakdown: Record<CaseStyle, number> = {
    camelCase: 0,
    PascalCase: 0,
    snake_case: 0,
    "kebab-case": 0,
    SCREAMING_SNAKE_CASE: 0,
    flatcase: 0,
    mixed: 0,
  };

  for (const [style, count] of counts) {
    breakdown[style] = count;
    if (count > maxCount) {
      maxCount = count;
      dominant = style;
    }
  }

  return {
    category,
    dominantStyle: dominant,
    percentage: Math.round((maxCount / total) * 1000) / 10,
    sampleSize: total,
    breakdown,
  };
};

/** Analyze file and directory naming patterns from the file index. Zero I/O. */
export const analyzeFileNaming = (index: FileIndex): NamingPattern[] => {
  const fileCounts = new Map<CaseStyle, number>();
  let fileTotal = 0;
  const dirCounts = new Map<CaseStyle, number>();
  const seenDirs = new Set<string>();
  let dirTotal = 0;

  for (const file of index.all()) {
    // Classify file names — strip primary extension, then normalize dots
    // e.g. "auth.config.ts" → "auth.config" → "auth-config" (classified as kebab-case)
    let baseName = file.ext ? file.name.slice(0, -file.ext.length) : file.name;

    // Skip dotfiles, non-alphabetic, single-char, and generic names
    if (baseName.startsWith(".")) continue;
    if (!/[a-zA-Z]/.test(baseName)) continue;

    // Treat remaining dots as separators so multi-part names
    // (auth.config, app.module) classify by their delimiter pattern
    if (baseName.includes(".")) {
      baseName = baseName.replaceAll(".", "-");
    }

    if (SKIP_FILE_NAMES.has(baseName.toLowerCase())) continue;

    const style = classifyCase(baseName);
    if (style) {
      fileCounts.set(style, (fileCounts.get(style) ?? 0) + 1);
      fileTotal++;
    }

    // Extract directory names from relative path
    const segments = file.relativePath.split("/");
    for (let i = 0; i < segments.length - 1; i++) {
      const dir = segments[i]!;
      if (seenDirs.has(dir)) continue;
      seenDirs.add(dir);

      if (dir.startsWith(".")) continue;
      if (SKIP_DIR_NAMES.has(dir)) continue;
      if (!/[a-zA-Z]/.test(dir)) continue;

      const dirStyle = classifyCase(dir);
      if (dirStyle) {
        dirCounts.set(dirStyle, (dirCounts.get(dirStyle) ?? 0) + 1);
        dirTotal++;
      }
    }
  }

  const patterns: NamingPattern[] = [];
  const filePattern = buildPattern("file", fileCounts, fileTotal);
  if (filePattern) patterns.push(filePattern);
  const dirPattern = buildPattern("directory", dirCounts, dirTotal);
  if (dirPattern) patterns.push(dirPattern);

  return patterns;
};
