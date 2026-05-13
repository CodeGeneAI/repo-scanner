import { DETECTOR_IDS, type DetectorId } from "./detectors/catalog";
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
  architecture: ["monorepo"],
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

const SELECTOR_DETECTOR_REQUIREMENTS: Record<
  DetectorId,
  readonly ExecutionDetectorId[]
> = {
  build: ["build"],
  "build-commands": ["build"],
  ci: ["ci"],
  "codebase-size": ["language"],
  "code-quality": ["code-quality"],
  "complexity-hotspots": ["complexity-hotspots"],
  containerization: ["containerization"],
  datastore: ["datastore"],
  "dependency-manager": ["dependency-manager"],
  "deployment-platform": ["deployment-platform"],
  "external-services": ["external-services"],
  framework: ["framework"],
  iac: ["iac"],
  language: ["language"],
  "language-stats": ["language"],
  "large-file": ["large-file"],
  "lint-commands": ["build"],
  linting: ["linting"],
  monorepo: ["monorepo"],
  "repo-tools": ["repo-tools"],
  runtime: ["runtime"],
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
    | "vcs"
    | "runtime"
    | "largeFile"
    | "todo"
    | "complexityHotspots"
    | "languageDetector"
    | "languageStatsDetector"
    | "codebaseSizeDetector"
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
    | "buildCommandsDetector"
    | "testCommandsDetector"
    | "lintCommandsDetector"
    | "repoToolsDetector"
    | "codeQualityDetector"
    | "deploymentPlatformDetector"
    | "externalServicesDetector"
  >,
): DetectorId[] => {
  const ids = new Set<DetectorId>();

  if (options.vcs) ids.add("vcs");
  if (options.runtime) ids.add("runtime");
  if (options.largeFile) ids.add("large-file");
  if (options.todo) ids.add("todo");
  if (options.complexityHotspots) ids.add("complexity-hotspots");
  if (options.languageDetector) ids.add("language");
  if (options.languageStatsDetector) ids.add("language-stats");
  if (options.codebaseSizeDetector) ids.add("codebase-size");
  if (options.frameworkDetector) ids.add("framework");
  if (options.monorepoDetector) ids.add("monorepo");
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
  if (options.codeQualityDetector) ids.add("code-quality");
  if (options.deploymentPlatformDetector) ids.add("deployment-platform");
  if (options.externalServicesDetector) ids.add("external-services");

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
    return {
      allDetectors: false,
      selectedSections: [],
      enabledDetectorIds: [...explicitExecutionDetectors],
      explicitDetectorOutputIds,
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

  return {
    allDetectors: false,
    selectedSections,
    enabledDetectorIds: [...enabledDetectorIds],
    explicitDetectorOutputIds,
  };
};
