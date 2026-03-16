import type {
  DependencyComponentGroupingMode,
  DepScannerResult,
  Ecosystem,
  OutdatedThreshold,
  VulnerabilitySeverity,
} from "./dependency/types";

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
  readonly dependencies?: DepScannerResult;
  readonly inventory: {
    readonly languages: readonly string[];
    readonly languageStats: readonly LanguageStats[];
    readonly totalFiles: number;
    readonly totalLinesOfCode: number;
    readonly frameworks: readonly string[];
    readonly datastores: readonly string[];
    readonly dependencyManagers: readonly string[];
    readonly repoTools: readonly string[];
    readonly envVars: readonly EnvVarInfo[];
    readonly runtimes: readonly RuntimeInfo[];
    readonly apiSurface?: ApiSurface;
    readonly namingConventions?: readonly {
      readonly category: string;
      readonly dominantStyle: string;
      readonly percentage: number;
      readonly sampleSize: number;
    }[];
    readonly largeFiles?: readonly LargeFileInfo[];
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
  };
  readonly scanPath: string;
  readonly timestamp: string;
  readonly durationMs: number;
}

/** A single usage of an environment variable in source code or config. */
export interface EnvVarUsage {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
  readonly accessType: "read" | "write" | "definition";
}

/** Inferred value type for an environment variable. */
export type EnvValueType =
  | "string"
  | "number"
  | "boolean"
  | "url"
  | "path"
  | "json"
  | "unknown";

/** A deduplicated environment variable with all metadata. */
export interface EnvVarInfo {
  readonly name: string;
  readonly usages: readonly EnvVarUsage[];
  readonly inferredType: EnvValueType;
  readonly defaultValue?: string;
  readonly required: boolean;
  readonly definedInConfig: boolean;
  readonly frameworkPrefix?: string;
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

export interface ApiEndpoint {
  readonly method: string;
  readonly path: string;
  readonly file: string;
  readonly line: number;
  readonly framework: string;
}

export interface ApiSurface {
  readonly endpoints: readonly ApiEndpoint[];
  readonly protocols: readonly string[];
  readonly frameworksUsed: readonly string[];
}

export interface CliOptions {
  readonly path: string;
  readonly format: "table" | "json";
  readonly showHelp: boolean;
  readonly deps: boolean;
  readonly depsDebug: boolean;
  readonly ecosystems?: readonly Ecosystem[];
  readonly skipUsage: boolean;
  readonly skipSecurity: boolean;
  readonly skipVersionLookup: boolean;
  readonly concurrency: number;
  readonly componentGrouping: DependencyComponentGroupingMode;
  readonly failOnVulns: boolean;
  readonly failOnVulnsCount?: number;
  readonly severityThreshold: VulnerabilitySeverity;
  readonly failOnOutdated: boolean;
  readonly failOnOutdatedCount?: number;
  readonly outdatedThreshold: OutdatedThreshold;
  readonly largeFileThreshold: number;
}
export interface DependencyScanConfig {
  readonly enabled: boolean;
  readonly ecosystems?: readonly Ecosystem[];
  readonly skipUsage?: boolean;
  readonly skipSecurity?: boolean;
  readonly skipVersionLookup?: boolean;
  readonly concurrency?: number;
  readonly componentGrouping?: DependencyComponentGroupingMode;
  readonly debugVulnerabilityKeys?: boolean;
}

export interface ScanRepoOptions {
  readonly dependencies?: DependencyScanConfig;
}
