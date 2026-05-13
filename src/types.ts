import type { DetectorId } from "./detectors/catalog";

export type ComponentKind =
  | "app"
  | "service"
  | "package"
  | "infra"
  | "script"
  | "library";

export interface Component {
  readonly path: string;
  readonly name: string;
  readonly kind: ComponentKind;
  readonly secondaryKinds?: readonly ComponentKind[];
  readonly description?: string;
}

export interface Inventory {
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly packageManagers: readonly string[];
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

export interface CliOptions {
  readonly path: string;
  readonly format: "table" | "json";
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
}
