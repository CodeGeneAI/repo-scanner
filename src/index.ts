import "./detectors/init";
export type { DetectorId } from "./detectors/catalog";
export { scanRepo } from "./scanner";
export type {
  Architecture,
  Component,
  ComponentKind,
  Inventory,
  LanguageStats,
  RepoScanResult,
  ScanRepoOptions,
} from "./types";
