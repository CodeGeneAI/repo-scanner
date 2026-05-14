import type { DetectorId } from "../detectors/catalog";
import type { DetectorResult } from "../detectors/types";
import type {
  Component,
  ComponentScope,
  LanguageStats,
  PartialInventory,
  PartialRepoScanResult,
  RepoScanResult,
} from "../types";
import type { FileIndex } from "../utils/file-index";
import { classifyComponent } from "./component-classifier";
import { detectSecondaryKinds } from "./content-signals";

const EMPTY_LANGUAGE_STATS: LanguageStats = {
  totalFiles: 0,
  totalLines: 0,
  perLanguage: [],
};

export interface AggregateOptions {
  readonly selectedDetectors?: ReadonlySet<DetectorId>;
}

/** Merge all detector results into a single RepoScanResult. */
export async function aggregate(
  rootPath: string,
  results: readonly DetectorResult[],
  index?: FileIndex,
  options?: { selectedDetectors?: undefined },
): Promise<RepoScanResult>;
/** Merge all detector results into a sliced PartialRepoScanResult based on selectedDetectors. */
export async function aggregate(
  rootPath: string,
  results: readonly DetectorResult[],
  index: FileIndex | undefined,
  options: { selectedDetectors: ReadonlySet<DetectorId> },
): Promise<PartialRepoScanResult>;
/** Implementation signature. */
export async function aggregate(
  rootPath: string,
  results: readonly DetectorResult[],
  index?: FileIndex,
  options?: AggregateOptions,
): Promise<RepoScanResult | PartialRepoScanResult> {
  const frameworks = new Set<string>();
  const packageManagers = new Set<string>();
  const ciProviders = new Set<string>();
  const buildSystems = new Set<string>();
  const containerization = new Set<string>();
  const languageNames = new Set<string>();

  const componentMap = new Map<string, Component>();
  let languageStats: LanguageStats = EMPTY_LANGUAGE_STATS;
  let isMonorepo = false;
  let monorepoToolName: string | undefined;

  const categoryMap: Record<string, Set<string>> = {
    framework: frameworks,
    packageManager: packageManagers,
    ciProvider: ciProviders,
    buildSystem: buildSystems,
    containerization: containerization,
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

  // === Phase B: per-component attribution ===

  const componentPaths = [...componentMap.keys()].sort(
    (a, b) => b.length - a.length, // longest-prefix wins
  );

  // Normalize separators so component matching works on Windows. The file
  // index can produce backslash-separated relativePaths via path.relative,
  // while component paths are always slash-delimited.
  const toForwardSlash = (p: string): string => p.replace(/\\/g, "/");

  const findComponentForFile = (filePath: string): string | undefined => {
    const normalized = toForwardSlash(filePath);
    for (const compPath of componentPaths) {
      if (normalized === compPath || normalized.startsWith(`${compPath}/`)) {
        return compPath;
      }
    }
    return undefined;
  };

  // --- Framework attribution ---
  const componentFrameworks = new Map<string, Set<string>>();
  for (const compPath of componentPaths) {
    componentFrameworks.set(compPath, new Set());
  }

  const frameworkRan = results.some((r) => r.detectorId === "framework");

  for (const result of results) {
    if (result.detectorId !== "framework") continue;
    for (const finding of result.findings) {
      if (!finding.filePath) continue;
      const compPath = findComponentForFile(finding.filePath);
      if (!compPath) continue;
      componentFrameworks.get(compPath)!.add(finding.value);
    }
  }

  // --- Language attribution ---
  const languageDetectorResult = results.find(
    (r) => r.detectorId === "language",
  );
  const perFile = (languageDetectorResult?.metadata?.perFile ?? []) as Array<{
    relativePath: string;
    language: string;
    lines: number;
  }>;

  const componentLangStats = new Map<
    string,
    {
      files: number;
      lines: number;
      perLang: Map<string, { files: number; lines: number }>;
    }
  >();
  for (const compPath of componentPaths) {
    componentLangStats.set(compPath, {
      files: 0,
      lines: 0,
      perLang: new Map(),
    });
  }

  for (const entry of perFile) {
    const compPath = findComponentForFile(entry.relativePath);
    if (!compPath) continue;
    const bucket = componentLangStats.get(compPath)!;
    bucket.files += 1;
    bucket.lines += entry.lines;
    const existing = bucket.perLang.get(entry.language) ?? {
      files: 0,
      lines: 0,
    };
    existing.files += 1;
    existing.lines += entry.lines;
    bucket.perLang.set(entry.language, existing);
  }

  const languageRan = results.some((r) => r.detectorId === "language");

  // Re-materialize each component with scoped attached.
  for (const [compPath, comp] of componentMap) {
    const scopedBuilder: {
      frameworks?: readonly string[];
      languageStats?: LanguageStats;
    } = {};

    if (frameworkRan) {
      const fwSet = componentFrameworks.get(compPath);
      scopedBuilder.frameworks = fwSet ? [...fwSet].sort() : [];
    }

    if (languageRan) {
      const bucket = componentLangStats.get(compPath);
      const totalFiles = bucket?.files ?? 0;
      const totalLines = bucket?.lines ?? 0;
      const perLanguage =
        totalFiles > 0
          ? [...(bucket?.perLang.entries() ?? [])]
              .map(([language, { files, lines }]) => ({
                language,
                files,
                lines,
                percentage: Math.round((files / totalFiles) * 1000) / 10,
              }))
              .sort((a, b) => b.percentage - a.percentage)
          : [];
      scopedBuilder.languageStats = { totalFiles, totalLines, perLanguage };
    }

    if (Object.keys(scopedBuilder).length > 0) {
      const scoped: ComponentScope = scopedBuilder;
      componentMap.set(compPath, { ...comp, scoped });
    }
  }

  const components = [...componentMap.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );

  const selected = options?.selectedDetectors;
  const include = (id: DetectorId): boolean => !selected || selected.has(id);

  const base = {
    scannedAt: new Date().toISOString(),
    rootPath,
  };

  // Unfiltered fast path: return canonical full shape (preserves existing type).
  if (!selected) {
    return {
      ...base,
      inventory: {
        languages: sorted(languageNames),
        frameworks: sorted(frameworks),
        packageManagers: sorted(packageManagers),
        ciProviders: sorted(ciProviders),
        buildSystems: sorted(buildSystems),
        containerization: sorted(containerization),
      },
      architecture: {
        monorepo: isMonorepo,
        ...(monorepoToolName ? { toolName: monorepoToolName } : {}),
        components,
      },
      languageStats,
    };
  }

  // Filtered path: build sliced result.
  const partialInventory: Record<string, readonly string[]> = {};
  if (include("language")) partialInventory.languages = sorted(languageNames);
  if (include("framework")) partialInventory.frameworks = sorted(frameworks);
  if (include("packageManager"))
    partialInventory.packageManagers = sorted(packageManagers);
  if (include("ciProvider")) partialInventory.ciProviders = sorted(ciProviders);
  if (include("buildSystem"))
    partialInventory.buildSystems = sorted(buildSystems);
  if (include("containerization"))
    partialInventory.containerization = sorted(containerization);
  const hasInventory = Object.keys(partialInventory).length > 0;

  const partial: PartialRepoScanResult = {
    ...base,
    ...(hasInventory
      ? { inventory: partialInventory as PartialInventory }
      : {}),
    ...(include("monorepo")
      ? {
          architecture: {
            monorepo: isMonorepo,
            ...(monorepoToolName ? { toolName: monorepoToolName } : {}),
            components,
          },
        }
      : {}),
    ...(include("language") ? { languageStats } : {}),
  };
  return partial;
}

const sorted = (set: Set<string>): string[] => [...set].sort();
