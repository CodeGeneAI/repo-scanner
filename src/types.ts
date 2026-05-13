export type ComponentKind =
  | "app"
  | "service"
  | "package"
  | "library"
  | "infra"
  | "script"
  | "unknown";

export interface Component {
  readonly name: string;
  readonly path: string;
  readonly kind: ComponentKind;
  readonly secondaryKinds?: readonly ComponentKind[];
  readonly description: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
}

export interface LanguageStats {
  readonly name: string;
  readonly fileCount: number;
  readonly linesOfCode: number;
  readonly percentage: number; // 0–100, rounded to 1 decimal
}

export interface RepoScanResult {
  readonly inventory: {
    readonly languages: readonly string[];
    readonly languageStats: readonly LanguageStats[];
    readonly totalFiles: number;
    readonly totalLinesOfCode: number;
    readonly frameworks: readonly string[];
  };
  readonly architecture: {
    readonly monorepo: boolean;
    readonly components: readonly Component[];
  };
  readonly scanPath: string;
  readonly timestamp: string;
  readonly durationMs: number;
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
  readonly detectorsSchema: boolean;
  readonly detectorSelectionWarnings: readonly string[];
  readonly scanArchitecture: boolean;
  readonly scanInventory: boolean;
  readonly allDetectors: boolean;
  readonly languageDetector: boolean;
  readonly frameworkDetector: boolean;
  readonly monorepoDetector: boolean;
}

export interface ScanRepoOptions {
  readonly enabledDetectorIds?: readonly string[];
}
