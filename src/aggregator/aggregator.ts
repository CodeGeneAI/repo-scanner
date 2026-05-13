import type { DetectorResult } from "../detectors/types";
import type {
  ComplexityHotspot,
  Component,
  CrossPackageDependencyGraph,
  ExternalService,
  LanguageStats,
  LargeFileInfo,
  RepoScanResult,
  RuntimeInfo,
  TodoAnnotation,
  VcsInfo,
} from "../types";
import type { FileIndex } from "../utils/file-index";
import {
  computeBlastRadius,
  detectCircularDeps,
  detectLayerViolations,
} from "./architecture-analysis";
import { classifyComponent } from "./component-classifier";
import { enrichComponents } from "./component-enrichment";
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
  const datastores = new Set<string>();
  const dependencyManagers = new Set<string>();
  const containerization = new Set<string>();
  const iac = new Set<string>();
  const testing = new Set<string>();
  const buildTools = new Set<string>();
  const linting = new Set<string>();
  const codeQuality = new Set<string>();
  const deploymentPlatforms = new Set<string>();
  const repoTools = new Set<string>();
  const ciSystems = new Set<string>();
  const buildCommands = new Set<string>();
  const testCommands = new Set<string>();
  const lintCommands = new Set<string>();

  const signals = {
    hasReadme: false,
    hasCi: false,
    hasContainerization: false,
    hasIaC: false,
    hasTests: false,
    hasTypedContracts: false,
    hasQualityGates: false,
    isPolyglot: false,
    hasDeploymentPlatform: false,
  };

  const componentMap = new Map<string, Component>();
  let languageStats: readonly LanguageStats[] = [];
  let totalFiles = 0;
  let totalLinesOfCode = 0;
  let isMonorepo = false;
  let runtimes: readonly RuntimeInfo[] = [];
  let largeFiles: readonly LargeFileInfo[] | undefined;
  let todoAnnotations: readonly TodoAnnotation[] | undefined;
  let crossPackageDeps: CrossPackageDependencyGraph | undefined;
  let complexityHotspots: readonly ComplexityHotspot[] | undefined;
  let externalServices: readonly ExternalService[] | undefined;
  let vcsInfo: VcsInfo | undefined;

  const categoryMap: Record<string, Set<string>> = {
    language: languages,
    framework: frameworks,
    datastore: datastores,
    "dependency-manager": dependencyManagers,
    "repo-tools": repoTools,
    ci: ciSystems,
    linting,
    containerization,
    iac,
    testing,
    build: buildTools,
    "code-quality": codeQuality,
    "deployment-platform": deploymentPlatforms,
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

    // Commands
    if (result.commands) {
      for (const cmd of result.commands.build ?? []) buildCommands.add(cmd);
      for (const cmd of result.commands.test ?? []) testCommands.add(cmd);
      for (const cmd of result.commands.lint ?? []) lintCommands.add(cmd);
    }

    // Signals (OR semantics)
    if (result.signals) {
      for (const [key, value] of Object.entries(result.signals)) {
        if (value) (signals as Record<string, boolean>)[key] = true;
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

    // Extract runtime details
    if (
      result.detectorId === "runtime" &&
      Array.isArray(result.metadata?.runtimeDetails)
    ) {
      runtimes = result.metadata.runtimeDetails as RuntimeInfo[];
    }

    // Extract large files
    if (
      result.detectorId === "large-file" &&
      Array.isArray(result.metadata?.largeFiles)
    ) {
      const files = result.metadata.largeFiles as LargeFileInfo[];
      if (files.length > 0) {
        largeFiles = files;
      }
    }

    // Extract TODO annotations
    if (
      result.detectorId === "todo" &&
      Array.isArray(result.metadata?.todoAnnotations)
    ) {
      const annotations = result.metadata.todoAnnotations as TodoAnnotation[];
      if (annotations.length > 0) {
        todoAnnotations = annotations;
      }
    }

    // Extract cross-package dependency graph
    if (
      result.detectorId === "cross-package-deps" &&
      result.metadata?.crossPackageDeps
    ) {
      const graph = result.metadata
        .crossPackageDeps as CrossPackageDependencyGraph;
      if (graph.edges.length > 0) {
        crossPackageDeps = graph;
      }
    }

    // Extract complexity hotspots
    if (
      result.detectorId === "complexity-hotspots" &&
      Array.isArray(result.metadata?.complexityHotspots)
    ) {
      const hotspots = result.metadata
        .complexityHotspots as ComplexityHotspot[];
      if (hotspots.length > 0) {
        complexityHotspots = hotspots;
      }
    }

    // Extract external services
    if (
      result.detectorId === "external-services" &&
      Array.isArray(result.metadata?.externalServices)
    ) {
      const services = result.metadata.externalServices as ExternalService[];
      if (services.length > 0) {
        externalServices = services;
      }
    }

    // Extract VCS info
    if (result.detectorId === "vcs" && result.metadata?.vcsInfo) {
      vcsInfo = result.metadata.vcsInfo as VcsInfo;
    }

    // Special: monorepo detection
    if (result.detectorId === "monorepo") {
      isMonorepo = result.findings.length > 0;
    }
  }

  // Derive signals from detector presence
  if (ciSystems.size > 0) signals.hasCi = true;
  if (languages.size > 1) signals.isPolyglot = true;

  let components = [...componentMap.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );

  // Architecture analysis (requires both graph and components)
  let circularDeps: readonly (readonly string[])[] | undefined;
  let layerViolations: ReturnType<typeof detectLayerViolations> | undefined;
  let highImpactComponents:
    | ReturnType<typeof computeBlastRadius>["highImpact"]
    | undefined;

  if (crossPackageDeps && crossPackageDeps.edges.length > 0) {
    const cycles = detectCircularDeps(crossPackageDeps);
    if (cycles.length > 0) circularDeps = cycles;

    const violations = detectLayerViolations(crossPackageDeps, components);
    if (violations.length > 0) layerViolations = violations;

    const { radiusMap, highImpact } = computeBlastRadius(
      crossPackageDeps,
      components,
    );

    // Attach blast radius to each component
    if (radiusMap.size > 0) {
      components = components.map((c) => {
        const br = radiusMap.get(c.path);
        return br ? { ...c, blastRadius: br } : c;
      });
      if (highImpact.length > 0) highImpactComponents = highImpact;
    }
  }

  // Enrich components with per-component metadata
  if (index) {
    components = await enrichComponents(components, index, results);
  }

  return {
    vcs: vcsInfo,
    inventory: {
      languages: sorted(languages),
      languageStats,
      totalFiles,
      totalLinesOfCode,
      frameworks: sorted(frameworks),
      datastores: sorted(datastores),
      dependencyManagers: sorted(dependencyManagers),
      containerization: sorted(containerization),
      iac: sorted(iac),
      testing: sorted(testing),
      buildTools: sorted(buildTools),
      linting: sorted(linting),
      codeQuality: sorted(codeQuality),
      deploymentPlatforms: sorted(deploymentPlatforms),
      repoTools: sorted(repoTools),
      runtimes,
      largeFiles,
      todoAnnotations,
      complexityHotspots,
      externalServices,
    },
    architecture: {
      monorepo: isMonorepo,
      components,
      crossPackageDeps,
      circularDeps,
      layerViolations,
      highImpactComponents,
    },
    buildAndTest: {
      buildCommands: sorted(buildCommands),
      testCommands: sorted(testCommands),
      lintCommands: sorted(lintCommands),
      ciSystems: sorted(ciSystems),
    },
    signals,
    scanPath,
    timestamp: new Date().toISOString(),
    durationMs,
  };
};

const sorted = (set: Set<string>): string[] => [...set].sort();
