import type { DetectorResult } from "../detectors/types";
import type { Component, LanguageStats, RepoScanResult } from "../types";
import type { FileIndex } from "../utils/file-index";
import { classifyComponent } from "./component-classifier";
import { detectSecondaryKinds } from "./content-signals";

/** Merge all detector results into a single RepoScanResult. */
export const aggregate = async (
  scanPath: string,
  durationMs: number,
  results: readonly DetectorResult[],
  index?: FileIndex,
): Promise<RepoScanResult> => {
  const languages = new Set<string>();
  const frameworks = new Set<string>();

  const componentMap = new Map<string, Component>();
  let languageStats: readonly LanguageStats[] = [];
  let totalFiles = 0;
  let totalLinesOfCode = 0;
  let isMonorepo = false;

  const categoryMap: Record<string, Set<string>> = {
    language: languages,
    framework: frameworks,
  };

  /** Minimum confidence threshold for language findings. */
  const LANGUAGE_CONFIDENCE_THRESHOLD = 0.7;

  for (const result of results) {
    const targetSet = categoryMap[result.detectorId];

    for (const finding of result.findings) {
      if (targetSet) {
        // Filter out low-confidence languages (single-file detections)
        if (
          result.detectorId === "language" &&
          finding.confidence < LANGUAGE_CONFIDENCE_THRESHOLD
        ) {
          continue;
        }
        targetSet.add(finding.value);
      }
    }

    // Component hints
    if (result.componentHints) {
      for (const hint of result.componentHints) {
        if (!componentMap.has(hint.path)) {
          const kind = classifyComponent(hint);
          const secondary = index
            ? detectSecondaryKinds(hint.path, kind, index)
            : [];
          componentMap.set(hint.path, {
            name: hint.name ?? hint.path.split("/").pop() ?? hint.path,
            path: hint.path,
            kind,
            ...(secondary.length > 0 ? { secondaryKinds: secondary } : {}),
            description: hint.description ?? "",
            confidence: 0.8,
            evidence: [],
          });
        }
      }
    }

    // Extract language stats from language detector metadata
    if (result.detectorId === "language" && result.metadata) {
      if (Array.isArray(result.metadata.languageStats)) {
        languageStats = result.metadata.languageStats as LanguageStats[];
      }
      if (typeof result.metadata.totalFiles === "number") {
        totalFiles = result.metadata.totalFiles;
      }
      if (typeof result.metadata.totalLinesOfCode === "number") {
        totalLinesOfCode = result.metadata.totalLinesOfCode;
      }
    }

    // Special: monorepo detection
    if (result.detectorId === "monorepo") {
      isMonorepo = result.findings.length > 0;
    }
  }

  const components = [...componentMap.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );

  return {
    inventory: {
      languages: sorted(languages),
      languageStats,
      totalFiles,
      totalLinesOfCode,
      frameworks: sorted(frameworks),
    },
    architecture: {
      monorepo: isMonorepo,
      components,
    },
    scanPath,
    timestamp: new Date().toISOString(),
    durationMs,
  };
};

const sorted = (set: Set<string>): string[] => [...set].sort();
