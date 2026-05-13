import type { DetectorId } from "./detectors/catalog";
import type { CliOptions } from "./types";

export const SCAN_SECTIONS = ["architecture", "inventory"] as const;

export type ScanSection = (typeof SCAN_SECTIONS)[number];

type ExecutionDetectorId = string;

const SECTION_DETECTOR_IDS: Record<
  ScanSection,
  readonly ExecutionDetectorId[]
> = {
  architecture: ["monorepo"],
  inventory: ["language", "framework"],
};

export interface ResolvedScanProfile {
  readonly allDetectors: boolean;
  readonly selectedSections: readonly ScanSection[];
  readonly enabledDetectorIds?: readonly ExecutionDetectorId[];
  readonly explicitDetectorOutputIds: readonly DetectorId[];
}

const hasExplicitSectionFlags = (
  options: Pick<CliOptions, "scanArchitecture" | "scanInventory">,
): boolean => options.scanArchitecture || options.scanInventory;

const resolveExplicitDetectorOutputIds = (
  options: Pick<
    CliOptions,
    "languageDetector" | "frameworkDetector" | "monorepoDetector"
  >,
): DetectorId[] => {
  const ids = new Set<DetectorId>();

  if (options.languageDetector) ids.add("language");
  if (options.frameworkDetector) ids.add("framework");
  if (options.monorepoDetector) ids.add("monorepo");

  return [...ids];
};

const resolveSelectedSections = (
  options: Pick<CliOptions, "scanArchitecture" | "scanInventory">,
): readonly ScanSection[] => {
  if (!hasExplicitSectionFlags(options)) {
    return [];
  }

  const sections: ScanSection[] = [];
  if (options.scanArchitecture) sections.push("architecture");
  if (options.scanInventory) sections.push("inventory");
  return sections;
};

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

  // Explicit detector-only mode: skip all section detectors and run only
  // explicitly requested detector selectors when no section flags are provided.
  if (
    explicitDetectorOutputIds.length > 0 &&
    !hasExplicitSectionFlags(options)
  ) {
    return {
      allDetectors: false,
      selectedSections: [],
      enabledDetectorIds: [...explicitDetectorOutputIds],
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

  for (const detectorId of explicitDetectorOutputIds) {
    enabledDetectorIds.add(detectorId);
  }

  return {
    allDetectors: false,
    selectedSections,
    enabledDetectorIds: [...enabledDetectorIds],
    explicitDetectorOutputIds,
  };
};
