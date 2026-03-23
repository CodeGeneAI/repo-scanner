import { ALL_DIAGRAM_KINDS, type DiagramKind } from "./output/topology/types";
import type { CliOptions } from "./types";

export const SCAN_SECTIONS = [
  "architecture",
  "inventory",
  "external-services",
  "build-and-test",
] as const;

export type ScanSection = (typeof SCAN_SECTIONS)[number];

const DEFAULT_CORE_SECTIONS: readonly ScanSection[] = SCAN_SECTIONS;

const SECTION_DETECTOR_IDS: Record<ScanSection, readonly string[]> = {
  architecture: ["monorepo", "cross-package-deps"],
  inventory: [
    "language",
    "framework",
    "datastore",
    "dependency-manager",
    "containerization",
    "iac",
    "testing",
    "build",
    "linting",
    "code-quality",
    "deployment-platform",
    "repo-tools",
  ],
  "external-services": ["external-services"],
  "build-and-test": ["build", "ci"],
};

const TOPOLOGY_DETECTOR_IDS: Record<DiagramKind, readonly string[]> = {
  architecture: ["monorepo", "cross-package-deps"],
  dependency: ["monorepo", "cross-package-deps"],
  dataflow: ["monorepo", "external-services"],
  "api-topology": ["monorepo", "api-surface"],
  erd: ["db-schema"],
  "call-graph": ["call-graph"],
};

export interface ResolvedScanProfile {
  readonly allDetectors: boolean;
  readonly selectedSections: readonly ScanSection[];
  readonly enabledDetectorIds?: readonly string[];
}

const resolveRequestedTopologyKinds = (
  options: Pick<CliOptions, "topology" | "topologyDiagrams">,
): readonly DiagramKind[] => {
  if (!options.topology) {
    return [];
  }
  return options.topologyDiagrams ?? ALL_DIAGRAM_KINDS;
};

const hasExplicitSectionFlags = (
  options: Pick<
    CliOptions,
    | "scanArchitecture"
    | "scanInventory"
    | "scanExternalServices"
    | "scanBuildAndTest"
  >,
): boolean =>
  options.scanArchitecture ||
  options.scanInventory ||
  options.scanExternalServices ||
  options.scanBuildAndTest;

const resolveExplicitDetectorIds = (
  options: Pick<
    CliOptions,
    | "env"
    | "vcs"
    | "solid"
    | "callGraph"
    | "diffEnvCheck"
    | "dbSchema"
    | "topology"
    | "topologyDiagrams"
    | "namingConvention"
    | "runtime"
    | "largeFile"
    | "todo"
    | "deadExport"
    | "codeDuplication"
    | "complexityHotspots"
    | "languageDetector"
    | "frameworkDetector"
    | "monorepoDetector"
    | "dependencyManagerDetector"
    | "ciDetector"
    | "containerizationDetector"
    | "iacDetector"
    | "testingDetector"
    | "datastoreDetector"
    | "lintingDetector"
    | "buildDetector"
    | "repoToolsDetector"
    | "crossPackageDepsDetector"
    | "codeQualityDetector"
    | "deploymentPlatformDetector"
    | "externalServicesDetector"
    | "apiSurfaceDetector"
  >,
): string[] => {
  const explicitDetectorIds = new Set<string>();
  if (options.env) explicitDetectorIds.add("env");
  if (options.vcs) explicitDetectorIds.add("vcs");
  if (options.solid) explicitDetectorIds.add("solid-health");
  if (options.callGraph) explicitDetectorIds.add("call-graph");
  if (options.diffEnvCheck) explicitDetectorIds.add("env");
  if (options.namingConvention) explicitDetectorIds.add("naming-convention");
  if (options.runtime) explicitDetectorIds.add("runtime");
  if (options.largeFile) explicitDetectorIds.add("large-file");
  if (options.todo) explicitDetectorIds.add("todo");
  if (options.deadExport) explicitDetectorIds.add("dead-export");
  if (options.codeDuplication) explicitDetectorIds.add("code-duplication");
  if (options.complexityHotspots)
    explicitDetectorIds.add("complexity-hotspots");
  if (options.languageDetector) explicitDetectorIds.add("language");
  if (options.frameworkDetector) explicitDetectorIds.add("framework");
  if (options.monorepoDetector) explicitDetectorIds.add("monorepo");
  if (options.dependencyManagerDetector)
    explicitDetectorIds.add("dependency-manager");
  if (options.ciDetector) explicitDetectorIds.add("ci");
  if (options.containerizationDetector)
    explicitDetectorIds.add("containerization");
  if (options.iacDetector) explicitDetectorIds.add("iac");
  if (options.testingDetector) explicitDetectorIds.add("testing");
  if (options.datastoreDetector) explicitDetectorIds.add("datastore");
  if (options.lintingDetector) explicitDetectorIds.add("linting");
  if (options.buildDetector) explicitDetectorIds.add("build");
  if (options.repoToolsDetector) explicitDetectorIds.add("repo-tools");
  if (options.crossPackageDepsDetector)
    explicitDetectorIds.add("cross-package-deps");
  if (options.codeQualityDetector) explicitDetectorIds.add("code-quality");
  if (options.deploymentPlatformDetector)
    explicitDetectorIds.add("deployment-platform");
  if (options.externalServicesDetector)
    explicitDetectorIds.add("external-services");
  if (options.apiSurfaceDetector) explicitDetectorIds.add("api-surface");

  // Enable db-schema detector when explicitly requested or when ERD topology diagram is requested.
  const erdRequested =
    options.topology &&
    (!options.topologyDiagrams || options.topologyDiagrams.includes("erd"));
  if (options.dbSchema || erdRequested) {
    explicitDetectorIds.add("db-schema");
  }

  if (
    options.topology &&
    (!options.topologyDiagrams ||
      options.topologyDiagrams.includes("call-graph"))
  ) {
    explicitDetectorIds.add("call-graph");
  }

  return [...explicitDetectorIds];
};

const resolveSelectedSections = (
  options: Pick<
    CliOptions,
    | "scanArchitecture"
    | "scanInventory"
    | "scanExternalServices"
    | "scanBuildAndTest"
  >,
): readonly ScanSection[] => {
  if (!hasExplicitSectionFlags(options)) {
    return DEFAULT_CORE_SECTIONS;
  }

  const sections: ScanSection[] = [];
  if (options.scanArchitecture) sections.push("architecture");
  if (options.scanInventory) sections.push("inventory");
  if (options.scanExternalServices) sections.push("external-services");
  if (options.scanBuildAndTest) sections.push("build-and-test");
  return sections;
};

export const resolveScanProfile = (
  options: CliOptions,
): ResolvedScanProfile => {
  const explicitDetectorIds = resolveExplicitDetectorIds(options);

  if (options.allDetectors) {
    return {
      allDetectors: true,
      selectedSections: [],
    };
  }

  // Explicit detector-only mode: skip all section detectors and run only
  // explicitly requested detector flags when no section flags are provided.
  if (explicitDetectorIds.length > 0 && !hasExplicitSectionFlags(options)) {
    return {
      allDetectors: false,
      selectedSections: [],
      enabledDetectorIds: explicitDetectorIds,
    };
  }

  const selectedSections = resolveSelectedSections(options);
  const enabledDetectorIds = new Set<string>();
  for (const section of selectedSections) {
    for (const detectorId of SECTION_DETECTOR_IDS[section]) {
      enabledDetectorIds.add(detectorId);
    }
  }

  // VCS detection is always enabled — it provides fundamental repo metadata.
  enabledDetectorIds.add("vcs");

  // Preserve explicit opt-in behavior for optional detectors.
  for (const detectorId of explicitDetectorIds) {
    enabledDetectorIds.add(detectorId);
  }

  // Ensure requested topology diagrams have required detector data even when
  // section flags narrow report output.
  for (const kind of resolveRequestedTopologyKinds(options)) {
    const required = TOPOLOGY_DETECTOR_IDS[kind] ?? [];
    for (const detectorId of required) {
      enabledDetectorIds.add(detectorId);
    }
  }

  return {
    allDetectors: false,
    selectedSections,
    enabledDetectorIds: [...enabledDetectorIds],
  };
};
