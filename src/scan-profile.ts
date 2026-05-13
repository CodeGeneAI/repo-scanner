import { DETECTOR_IDS, type DetectorId } from "./detectors/catalog";
import { ALL_DIAGRAM_KINDS, type DiagramKind } from "./output/topology/types";
import type { CliOptions } from "./types";

export const SCAN_SECTIONS = [
  "architecture",
  "inventory",
  "external-services",
  "build-and-test",
] as const;

export type ScanSection = (typeof SCAN_SECTIONS)[number];

type ExecutionDetectorId = string;

const SECTION_DETECTOR_IDS: Record<
  ScanSection,
  readonly ExecutionDetectorId[]
> = {
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

const TOPOLOGY_DETECTOR_IDS: Record<
  DiagramKind,
  readonly ExecutionDetectorId[]
> = {
  architecture: ["monorepo", "cross-package-deps"],
  dependency: ["monorepo", "cross-package-deps"],
  dataflow: ["monorepo", "external-services"],
  "api-topology": ["monorepo", "api-surface"],
  erd: ["db-schema"],
  "call-graph": ["call-graph"],
};

const SELECTOR_DETECTOR_REQUIREMENTS: Record<
  DetectorId,
  readonly ExecutionDetectorId[]
> = {
  "api-surface": ["api-surface"],
  build: ["build"],
  "build-commands": ["build"],
  "call-graph": ["call-graph"],
  ci: ["ci"],
  "codebase-size": ["language"],
  "code-duplication": ["code-duplication"],
  "code-quality": ["code-quality"],
  "complexity-hotspots": ["complexity-hotspots"],
  components: ["monorepo"],
  containerization: ["containerization"],
  "circular-deps": ["monorepo", "cross-package-deps"],
  "cross-package-deps": ["cross-package-deps"],
  datastore: ["datastore"],
  "db-schema": ["db-schema"],
  "dead-export": ["dead-export"],
  "dependency-manager": ["dependency-manager"],
  "deployment-platform": ["deployment-platform"],
  env: ["env"],
  "external-services": ["external-services"],
  framework: ["framework"],
  "high-impact-components": ["monorepo", "cross-package-deps"],
  iac: ["iac"],
  language: ["language"],
  "language-stats": ["language"],
  "large-file": ["large-file"],
  "layer-violations": ["monorepo", "cross-package-deps"],
  "lint-commands": ["build"],
  linting: ["linting"],
  monorepo: ["monorepo"],
  "naming-convention": ["naming-convention"],
  "repo-tools": ["repo-tools"],
  runtime: ["runtime"],
  "solid-health": ["solid-health"],
  "test-commands": ["build"],
  testing: ["testing"],
  todo: ["todo"],
  vcs: ["vcs"],
};

export interface ResolvedScanProfile {
  readonly allDetectors: boolean;
  readonly selectedSections: readonly ScanSection[];
  readonly enabledDetectorIds?: readonly ExecutionDetectorId[];
  readonly explicitDetectorOutputIds: readonly DetectorId[];
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

const resolveExplicitDetectorOutputIds = (
  options: Pick<
    CliOptions,
    | "env"
    | "vcs"
    | "solid"
    | "callGraph"
    | "dbSchema"
    | "namingConvention"
    | "runtime"
    | "largeFile"
    | "todo"
    | "deadExport"
    | "codeDuplication"
    | "complexityHotspots"
    | "languageDetector"
    | "languageStatsDetector"
    | "codebaseSizeDetector"
    | "frameworkDetector"
    | "monorepoDetector"
    | "componentsDetector"
    | "dependencyManagerDetector"
    | "ciDetector"
    | "containerizationDetector"
    | "iacDetector"
    | "testingDetector"
    | "datastoreDetector"
    | "lintingDetector"
    | "buildDetector"
    | "buildCommandsDetector"
    | "testCommandsDetector"
    | "lintCommandsDetector"
    | "repoToolsDetector"
    | "crossPackageDepsDetector"
    | "circularDepsDetector"
    | "layerViolationsDetector"
    | "highImpactComponentsDetector"
    | "codeQualityDetector"
    | "deploymentPlatformDetector"
    | "externalServicesDetector"
    | "apiSurfaceDetector"
  >,
): DetectorId[] => {
  const ids = new Set<DetectorId>();

  if (options.env) ids.add("env");
  if (options.vcs) ids.add("vcs");
  if (options.solid) ids.add("solid-health");
  if (options.callGraph) ids.add("call-graph");
  if (options.dbSchema) ids.add("db-schema");
  if (options.namingConvention) ids.add("naming-convention");
  if (options.runtime) ids.add("runtime");
  if (options.largeFile) ids.add("large-file");
  if (options.todo) ids.add("todo");
  if (options.deadExport) ids.add("dead-export");
  if (options.codeDuplication) ids.add("code-duplication");
  if (options.complexityHotspots) ids.add("complexity-hotspots");
  if (options.languageDetector) ids.add("language");
  if (options.languageStatsDetector) ids.add("language-stats");
  if (options.codebaseSizeDetector) ids.add("codebase-size");
  if (options.frameworkDetector) ids.add("framework");
  if (options.monorepoDetector) ids.add("monorepo");
  if (options.componentsDetector) ids.add("components");
  if (options.dependencyManagerDetector) ids.add("dependency-manager");
  if (options.ciDetector) ids.add("ci");
  if (options.containerizationDetector) ids.add("containerization");
  if (options.iacDetector) ids.add("iac");
  if (options.testingDetector) ids.add("testing");
  if (options.datastoreDetector) ids.add("datastore");
  if (options.lintingDetector) ids.add("linting");
  if (options.buildDetector) ids.add("build");
  if (options.buildCommandsDetector) ids.add("build-commands");
  if (options.testCommandsDetector) ids.add("test-commands");
  if (options.lintCommandsDetector) ids.add("lint-commands");
  if (options.repoToolsDetector) ids.add("repo-tools");
  if (options.crossPackageDepsDetector) ids.add("cross-package-deps");
  if (options.circularDepsDetector) ids.add("circular-deps");
  if (options.layerViolationsDetector) ids.add("layer-violations");
  if (options.highImpactComponentsDetector) ids.add("high-impact-components");
  if (options.codeQualityDetector) ids.add("code-quality");
  if (options.deploymentPlatformDetector) ids.add("deployment-platform");
  if (options.externalServicesDetector) ids.add("external-services");
  if (options.apiSurfaceDetector) ids.add("api-surface");

  return [...ids];
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
    return [];
  }

  const sections: ScanSection[] = [];
  if (options.scanArchitecture) sections.push("architecture");
  if (options.scanInventory) sections.push("inventory");
  if (options.scanExternalServices) sections.push("external-services");
  if (options.scanBuildAndTest) sections.push("build-and-test");
  return sections;
};

const resolveRequiredExecutionDetectors = (
  selectorIds: readonly DetectorId[],
): Set<ExecutionDetectorId> => {
  const executionDetectorIds = new Set<ExecutionDetectorId>();
  for (const selectorId of selectorIds) {
    const required = SELECTOR_DETECTOR_REQUIREMENTS[selectorId] ?? [];
    for (const detectorId of required) {
      executionDetectorIds.add(detectorId);
    }
  }
  return executionDetectorIds;
};

const validateSelectorMappings = (): void => {
  for (const id of DETECTOR_IDS) {
    if (!SELECTOR_DETECTOR_REQUIREMENTS[id]) {
      throw new Error(`Missing selector mapping for detector id "${id}"`);
    }
  }
};

validateSelectorMappings();

export const resolveScanProfile = (
  options: CliOptions,
): ResolvedScanProfile => {
  const explicitDetectorOutputIds = resolveExplicitDetectorOutputIds(options);
  const topologyKinds = resolveRequestedTopologyKinds(options);
  const topologyOnlyOutputMode =
    options.topology &&
    !hasExplicitSectionFlags(options) &&
    explicitDetectorOutputIds.length === 0;

  if (options.allDetectors) {
    return {
      allDetectors: true,
      selectedSections: [],
      explicitDetectorOutputIds: [],
    };
  }

  const explicitExecutionDetectors = resolveRequiredExecutionDetectors(
    explicitDetectorOutputIds,
  );

  // Explicit detector-only mode: skip all section detectors and run only
  // explicitly requested detector selectors when no section flags are provided.
  if (
    explicitDetectorOutputIds.length > 0 &&
    !hasExplicitSectionFlags(options)
  ) {
    for (const kind of topologyKinds) {
      const required = TOPOLOGY_DETECTOR_IDS[kind] ?? [];
      for (const detectorId of required) {
        explicitExecutionDetectors.add(detectorId);
      }
    }

    if (options.diffEnvCheck) {
      explicitExecutionDetectors.add("env");
    }

    return {
      allDetectors: false,
      selectedSections: [],
      enabledDetectorIds: [...explicitExecutionDetectors],
      explicitDetectorOutputIds,
    };
  }

  if (topologyOnlyOutputMode) {
    const topologyExecutionDetectors = new Set<ExecutionDetectorId>();
    for (const kind of topologyKinds) {
      const required = TOPOLOGY_DETECTOR_IDS[kind] ?? [];
      for (const detectorId of required) {
        topologyExecutionDetectors.add(detectorId);
      }
    }

    if (options.diffEnvCheck) {
      topologyExecutionDetectors.add("env");
    }

    return {
      allDetectors: false,
      selectedSections: [],
      enabledDetectorIds: [...topologyExecutionDetectors],
      explicitDetectorOutputIds: [],
    };
  }

  const selectedSections = resolveSelectedSections(options);
  const enabledDetectorIds = new Set<ExecutionDetectorId>();
  for (const section of selectedSections) {
    for (const detectorId of SECTION_DETECTOR_IDS[section]) {
      enabledDetectorIds.add(detectorId);
    }
  }

  // VCS detection is enabled for section report modes.
  if (selectedSections.length > 0) {
    enabledDetectorIds.add("vcs");
  }

  for (const detectorId of explicitExecutionDetectors) {
    enabledDetectorIds.add(detectorId);
  }

  if (options.diffEnvCheck) {
    enabledDetectorIds.add("env");
  }

  // Ensure requested topology diagrams have required detector data even when
  // section flags narrow report output.
  for (const kind of topologyKinds) {
    const required = TOPOLOGY_DETECTOR_IDS[kind] ?? [];
    for (const detectorId of required) {
      enabledDetectorIds.add(detectorId);
    }
  }

  return {
    allDetectors: false,
    selectedSections,
    enabledDetectorIds: [...enabledDetectorIds],
    explicitDetectorOutputIds,
  };
};
