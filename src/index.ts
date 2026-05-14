import "./detectors/init";

export type { DetectorId } from "./detectors/catalog";
export { scanRepo } from "./scanner";
export type {
  Architecture,
  Component,
  ComponentKind,
  ComponentScope,
  Inventory,
  LanguageStats,
  PartialInventory,
  PartialRepoScanResult,
  RepoScanResult,
  ScanRepoOptions,
} from "./types";
