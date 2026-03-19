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
  if (options.allDetectors) {
    return {
      allDetectors: true,
      selectedSections: [],
    };
  }

  const selectedSections = resolveSelectedSections(options);
  const enabledDetectorIds = new Set<string>();
  for (const section of selectedSections) {
    for (const detectorId of SECTION_DETECTOR_IDS[section]) {
      enabledDetectorIds.add(detectorId);
    }
  }

  // Preserve explicit opt-in behavior for these optional detectors.
  if (options.solid) enabledDetectorIds.add("solid-health");

  // Preserve explicit opt-in for db-schema even when topology is not requested.
  if (options.dbSchema) {
    enabledDetectorIds.add("db-schema");
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
