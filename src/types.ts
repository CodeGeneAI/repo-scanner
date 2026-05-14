import type { DetectorId } from "./detectors/catalog";

export interface RuntimeInfo {
  readonly language: string;
  readonly version: string;
  readonly source: string;
}

export type ComponentKind =
  | "app"
  | "service"
  | "package"
  | "infra"
  | "script"
  | "library";

export interface ComponentScope {
  readonly frameworks?: readonly string[];
  readonly languageStats?: LanguageStats;
}

export interface Component {
  readonly path: string;
  readonly name: string;
  readonly kind: ComponentKind;
  readonly secondaryKinds?: readonly ComponentKind[];
  readonly description?: string;
  readonly scoped?: ComponentScope;
}

export interface Inventory {
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly packageManagers: readonly string[];
  readonly ciProviders: readonly string[];
  readonly buildSystems: readonly string[];
  readonly containerization: readonly string[];
  readonly runtimes: readonly RuntimeInfo[];
}

export interface Architecture {
  readonly monorepo: boolean;
  readonly toolName?: string;
  readonly components: readonly Component[];
}

export interface LanguageStats {
  readonly totalFiles: number;
  readonly totalLines: number;
  readonly perLanguage: ReadonlyArray<{
    readonly language: string;
    readonly files: number;
    readonly lines: number;
    readonly percentage: number;
  }>;
}

export interface RepoScanResult {
  readonly scannedAt: string;
  readonly rootPath: string;
  readonly inventory: Inventory;
  readonly architecture: Architecture;
  readonly languageStats: LanguageStats;
}

export interface ScanRepoOptions {
  readonly detectors?: readonly DetectorId[];
}

export interface PartialInventory {
  readonly languages?: readonly string[];
  readonly frameworks?: readonly string[];
  readonly packageManagers?: readonly string[];
  readonly ciProviders?: readonly string[];
  readonly buildSystems?: readonly string[];
  readonly containerization?: readonly string[];
  readonly runtimes?: readonly RuntimeInfo[];
}

export interface PartialRepoScanResult {
  readonly scannedAt: string;
  readonly rootPath: string;
  readonly inventory?: PartialInventory;
  readonly architecture?: Architecture;
  readonly languageStats?: LanguageStats;
}

export interface CliOptions {
  readonly path: string;
  readonly json: boolean;
  readonly noColor: boolean;
  readonly showHelp: boolean;
  readonly showVersion: boolean;
  readonly showDetectors: boolean;
  readonly completionShell?: "bash" | "zsh" | "fish";
  readonly completionInstall: boolean;
  readonly completionUninstall: boolean;
  readonly detectorSelectionWarnings: readonly string[];
  readonly languageDetector: boolean;
  readonly frameworkDetector: boolean;
  readonly monorepoDetector: boolean;
  readonly packageManagerDetector: boolean;
  readonly ciProviderDetector: boolean;
  readonly buildSystemDetector: boolean;
  readonly containerizationDetector: boolean;
  readonly runtimeDetector: boolean;
}
