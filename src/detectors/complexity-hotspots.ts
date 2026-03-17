import path from "path";
import type { ComplexityHotspot } from "../types";
import { isTestFile } from "../utils/file-filters";
import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult } from "./types";

// ─── Language Extensions ─────────────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".swift": "Swift",
  ".dart": "Dart",
  ".scala": "Scala",
  ".c": "C",
  ".cpp": "C++",
  ".cc": "C++",
};

const SOURCE_EXTENSIONS = new Set(Object.keys(EXT_TO_LANGUAGE));

// ─── Complexity Counting ─────────────────────────────────────────────

/** Regex patterns that indicate control flow complexity. */
const COMPLEXITY_PATTERNS: readonly RegExp[] = [
  /\bif\s*\(/g,
  /\belse\s*\{/g,
  /\bswitch\s*\(/g,
  /\bcase\s+/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bdo\s*\{/g,
  /\btry\s*\{/g,
  /\bcatch\s*\(/g,
  /[^?.]\?\s*[^:?.]/g, // ternary (excludes ?., ??, ?:)
  /&&/g,
  /\|\|/g,
  /\)\s*=>\s*\{/g, // arrow callback
];

const computeComplexity = (content: string): number => {
  let score = 0;
  for (const pattern of COMPLEXITY_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) score += matches.length;
  }
  return score;
};

// ─── Git Churn ───────────────────────────────────────────────────────

const getGitChurn = async (
  rootPath: string,
): Promise<Map<string, number> | undefined> => {
  try {
    const proc = Bun.spawn(
      [
        "git",
        "log",
        "--format=",
        "--name-only",
        "--since=1 year ago",
        "--diff-filter=ACDMR",
      ],
      { cwd: rootPath, stdout: "pipe", stderr: "ignore" },
    );

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return undefined;

    const churnMap = new Map<string, number>();
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      churnMap.set(trimmed, (churnMap.get(trimmed) ?? 0) + 1);
    }

    return churnMap;
  } catch {
    return undefined;
  }
};

// ─── Detector ────────────────────────────────────────────────────────

const MAX_HOTSPOTS = 20;

registerDetector({
  id: "complexity-hotspots",
  async detect(rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const churnMap = await getGitChurn(rootPath);
    const hasChurn = churnMap !== undefined && churnMap.size > 0;

    // Compute complexity for all source files
    const entries: {
      file: string;
      complexity: number;
      churn: number;
      language: string;
    }[] = [];

    for (const file of index.all()) {
      if (!SOURCE_EXTENSIONS.has(file.ext)) continue;
      if (isTestFile(file.name, file.relativePath)) continue;

      const content = await readText(file.path);
      if (!content) continue;

      const complexity = computeComplexity(content);
      if (complexity === 0) continue;

      const churn = hasChurn ? (churnMap.get(file.relativePath) ?? 0) : 0;

      const language =
        EXT_TO_LANGUAGE[file.ext] ?? path.extname(file.name).slice(1);

      entries.push({ file: file.relativePath, complexity, churn, language });
    }

    if (entries.length === 0) {
      return { detectorId: "complexity-hotspots", findings: [] };
    }

    // Normalize and score
    const maxComplexity = Math.max(...entries.map((e) => e.complexity));
    const maxChurn = hasChurn ? Math.max(...entries.map((e) => e.churn), 1) : 1;

    const scored = entries.map((e) => {
      const normC = e.complexity / maxComplexity;
      const normCh = hasChurn ? e.churn / maxChurn : 1;
      const score = Math.round(normC * normCh * 100);
      return { ...e, score };
    });

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score || b.complexity - a.complexity);
    const hotspots: ComplexityHotspot[] = scored
      .slice(0, MAX_HOTSPOTS)
      .map((e) => ({
        file: e.file,
        complexity: e.complexity,
        churn: e.churn,
        score: e.score,
        language: e.language,
      }));

    return {
      detectorId: "complexity-hotspots",
      findings: hotspots.map((h) => ({
        value: h.file,
        confidence: h.score / 100,
        evidence: [
          `complexity=${h.complexity}`,
          `churn=${h.churn}`,
          `score=${h.score}`,
        ],
      })),
      metadata: { complexityHotspots: hotspots },
    };
  },
});
