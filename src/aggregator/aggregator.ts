import type { DetectorResult } from "../detectors/types";
import type { Component, LanguageStats, RepoScanResult } from "../types";
import type { FileIndex } from "../utils/file-index";
import { classifyComponent } from "./component-classifier";
import { detectSecondaryKinds } from "./content-signals";

const EMPTY_LANGUAGE_STATS: LanguageStats = {
  totalFiles: 0,
  totalLines: 0,
  perLanguage: [],
};

/** Merge all detector results into a single RepoScanResult. */
export const aggregate = async (
  rootPath: string,
  results: readonly DetectorResult[],
  index?: FileIndex,
): Promise<RepoScanResult> => {
  const frameworks = new Set<string>();
  const packageManagers = new Set<string>();
  const languageNames = new Set<string>();

  const componentMap = new Map<string, Component>();
  let languageStats: LanguageStats = EMPTY_LANGUAGE_STATS;
  let isMonorepo = false;
  let monorepoToolName: string | undefined;

  const categoryMap: Record<string, Set<string>> = {
    framework: frameworks,
    packageManager: packageManagers,
    // language deliberately omitted — sourced from languageStats below
  };

  for (const result of results) {
    const targetSet = categoryMap[result.detectorId];

    for (const finding of result.findings) {
      if (targetSet) targetSet.add(finding.value);
    }

    // Component hints
    if (result.componentHints) {
      for (const hint of result.componentHints) {
        if (!componentMap.has(hint.path)) {
          const kind = classifyComponent(hint);
          if (!kind) continue;
          const secondary = index
            ? detectSecondaryKinds(hint.path, kind, index)
            : [];
          const component: Component = {
            name: hint.name ?? hint.path.split("/").pop() ?? hint.path,
            path: hint.path,
            kind,
            ...(secondary.length > 0 ? { secondaryKinds: secondary } : {}),
            ...(hint.description ? { description: hint.description } : {}),
          };
          componentMap.set(hint.path, component);
        }
      }
    }

    // Extract language stats from language detector metadata
    if (result.detectorId === "language" && result.metadata) {
      const totalFiles =
        typeof result.metadata.totalFiles === "number"
          ? result.metadata.totalFiles
          : 0;
      const totalLines =
        typeof result.metadata.totalLines === "number"
          ? result.metadata.totalLines
          : 0;
      const perLanguage = Array.isArray(result.metadata.perLanguage)
        ? (result.metadata.perLanguage as LanguageStats["perLanguage"])
        : [];
      languageStats = { totalFiles, totalLines, perLanguage };
      for (const entry of perLanguage) {
        const name = entry.language.trim();
        if (name) languageNames.add(name);
      }
    }

    // Special: monorepo detection
    if (result.detectorId === "monorepo") {
      isMonorepo = result.findings.length > 0;
      const named = result.findings.find((f) => f.value !== "monorepo");
      if (named) monorepoToolName = named.value;
    }
  }

  const components = [...componentMap.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );

  return {
    scannedAt: new Date().toISOString(),
    rootPath,
    inventory: {
      languages: sorted(languageNames),
      frameworks: sorted(frameworks),
      packageManagers: sorted(packageManagers),
    },
    architecture: {
      monorepo: isMonorepo,
      ...(monorepoToolName ? { toolName: monorepoToolName } : {}),
      components,
    },
    languageStats,
  };
};

const sorted = (set: Set<string>): string[] => [...set].sort();
