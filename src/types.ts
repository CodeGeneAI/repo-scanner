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

export interface VcsInfo {
  readonly type: string;
  readonly provider?: string;
  readonly originUrl?: string;
  readonly defaultBranch?: string;
  readonly currentBranch?: string;
  readonly branches?: readonly string[];
  readonly metadataSources?: Partial<
    Record<
      "originUrl" | "provider" | "currentBranch" | "defaultBranch" | "branches",
      string
    >
  >;
  readonly metadataConfidence?: Partial<
    Record<
      "originUrl" | "provider" | "currentBranch" | "defaultBranch" | "branches",
      number
    >
  >;
  readonly branchSources?: Record<string, readonly string[]>;
}

export interface RepoScanResult {
  readonly vcs?: VcsInfo;
  readonly inventory: {
    readonly languages: readonly string[];
    readonly languageStats: readonly LanguageStats[];
    readonly totalFiles: number;
    readonly totalLinesOfCode: number;
    readonly frameworks: readonly string[];
    readonly datastores: readonly string[];
    readonly dependencyManagers: readonly string[];
    readonly containerization: readonly string[];
    readonly iac: readonly string[];
    readonly testing: readonly string[];
    readonly buildTools: readonly string[];
    readonly linting: readonly string[];
    readonly codeQuality: readonly string[];
    readonly deploymentPlatforms: readonly string[];
    readonly repoTools: readonly string[];
    readonly runtimes: readonly RuntimeInfo[];
    readonly largeFiles?: readonly LargeFileInfo[];
    readonly todoAnnotations?: readonly TodoAnnotation[];
    readonly complexityHotspots?: readonly ComplexityHotspot[];
    readonly externalServices?: readonly ExternalService[];
  };
  readonly architecture: {
    readonly monorepo: boolean;
    readonly components: readonly Component[];
  };
  readonly buildAndTest: {
    readonly buildCommands: readonly string[];
    readonly testCommands: readonly string[];
    readonly lintCommands: readonly string[];
    readonly ciSystems: readonly string[];
  };
  readonly signals: {
    readonly hasReadme: boolean;
    readonly hasCi: boolean;
    readonly hasContainerization: boolean;
    readonly hasIaC: boolean;
    readonly hasTests: boolean;
    readonly hasTypedContracts: boolean;
    readonly hasQualityGates: boolean;
    readonly isPolyglot: boolean;
    readonly hasDeploymentPlatform: boolean;
  };
  readonly scanPath: string;
  readonly timestamp: string;
  readonly durationMs: number;
}

export interface RuntimeInfo {
  readonly language: string;
  readonly version: string;
  readonly source: string;
  readonly file: string;
}

export interface LargeFileInfo {
  readonly relativePath: string;
  readonly lineCount: number;
  readonly language: string;
}

export interface TodoAnnotation {
  readonly tag: "TODO" | "FIXME" | "HACK" | "BUG" | "XXX";
  readonly text: string;
  readonly file: string;
  readonly line: number;
  readonly author?: string;
}

export interface ComplexityHotspot {
  readonly file: string;
  readonly complexity: number;
  readonly churn: number;
  readonly score: number;
  readonly language: string;
}

export interface ExternalService {
  readonly name: string;
  readonly category: string;
  readonly evidence: readonly string[];
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
  readonly scanExternalServices: boolean;
  readonly scanBuildAndTest: boolean;
  readonly allDetectors: boolean;
  readonly largeFileThreshold: number;
  readonly runtime: boolean;
  readonly largeFile: boolean;
  readonly todo: boolean;
  readonly complexityHotspots: boolean;
  readonly languageDetector: boolean;
  readonly languageStatsDetector: boolean;
  readonly codebaseSizeDetector: boolean;
  readonly frameworkDetector: boolean;
  readonly monorepoDetector: boolean;
  readonly dependencyManagerDetector: boolean;
  readonly ciDetector: boolean;
  readonly containerizationDetector: boolean;
  readonly iacDetector: boolean;
  readonly testingDetector: boolean;
  readonly datastoreDetector: boolean;
  readonly lintingDetector: boolean;
  readonly buildDetector: boolean;
  readonly buildCommandsDetector: boolean;
  readonly testCommandsDetector: boolean;
  readonly lintCommandsDetector: boolean;
  readonly repoToolsDetector: boolean;
  readonly codeQualityDetector: boolean;
  readonly deploymentPlatformDetector: boolean;
  readonly externalServicesDetector: boolean;
  readonly vcs: boolean;
}

export interface ScanRepoOptions {
  readonly enabledDetectorIds?: readonly string[];
}
