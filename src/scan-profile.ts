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

export interface ResolvedScanProfile {
  readonly allDetectors: boolean;
  readonly selectedSections: readonly ScanSection[];
  readonly enabledDetectorIds?: readonly string[];
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

  // Enable db-schema detector when explicitly requested or when ERD diagram is requested.
  // Note: bin.ts also calls setDbSchemaOptions() for runtime config; this adds the detector ID.
  const erdRequested =
    options.topology &&
    (!options.topologyDiagrams || options.topologyDiagrams.includes("erd"));
  if (options.dbSchema || erdRequested) {
    enabledDetectorIds.add("db-schema");
  }

  return {
    allDetectors: false,
    selectedSections,
    enabledDetectorIds: [...enabledDetectorIds],
  };
};
