import type { SolidHealthResult } from "./ast/solid/types";
import type {
  DependencyComponentGroupingMode,
  DepScannerResult,
  Ecosystem,
  OutdatedThreshold,
  VulnerabilitySeverity,
} from "./dependency/types";

export type { SolidHealthResult } from "./ast/solid/types";

export type ComponentKind =
  | "app"
  | "service"
  | "package"
  | "library"
  | "infra"
  | "script"
  | "unknown";

export interface BlastRadius {
  readonly directDependents: number;
  readonly transitiveDependents: number;
  readonly score: number; // 0–100
}

export type ComponentPlatform =
  | "web"
  | "api"
  | "cli"
  | "worker"
  | "library"
  | "mobile"
  | "desktop";

export interface ComponentMetadata {
  readonly frameworks?: readonly string[];
  readonly platform?: ComponentPlatform;
  readonly entryPoint?: string;
  readonly ports?: readonly number[];
  readonly envVars?: readonly string[];
  readonly runtime?: { readonly name: string; readonly version?: string };
  readonly datastores?: readonly string[];
  readonly externalServices?: readonly {
    readonly name: string;
    readonly category: string;
  }[];
  readonly apiSurface?: {
    readonly endpointCount: number;
    readonly protocols: readonly string[];
  };
  readonly lineCount?: number;
  readonly version?: string;
  readonly private?: boolean;
  readonly hasReadme?: boolean;
  readonly hasDockerfile?: boolean;
  readonly hasTests?: boolean;
  readonly hasMigrations?: boolean;
  // Reasonable heuristics tier
  readonly observability?: readonly string[];
  readonly deployTarget?: string;
}

export interface Component {
  readonly name: string;
  readonly path: string;
  readonly kind: ComponentKind;
  readonly secondaryKinds?: readonly ComponentKind[];
  readonly description: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly blastRadius?: BlastRadius;
  readonly metadata?: ComponentMetadata;
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
    readonly containerization: readonly string[];
    readonly iac: readonly string[];
    readonly testing: readonly string[];
    readonly buildTools: readonly string[];
    readonly linting: readonly string[];
    readonly codeQuality: readonly string[];
    readonly deploymentPlatforms: readonly string[];
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
    readonly todoAnnotations?: readonly TodoAnnotation[];
    readonly deadExports?: readonly DeadExport[];
    readonly codeDuplication?: CodeDuplicationResult;
    readonly solidHealth?: SolidHealthResult;
    readonly complexityHotspots?: readonly ComplexityHotspot[];
    readonly externalServices?: readonly ExternalService[];
  };
  readonly architecture: {
    readonly monorepo: boolean;
    readonly components: readonly Component[];
    readonly crossPackageDeps?: CrossPackageDependencyGraph;
    readonly circularDeps?: readonly (readonly string[])[];
    readonly layerViolations?: readonly LayerViolation[];
    readonly highImpactComponents?: readonly HighImpactComponent[];
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

export interface PackageDependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly fromName: string;
  readonly toName: string;
  readonly ecosystem: string;
  readonly isDev: boolean;
}

export interface CrossPackageDependencyGraph {
  readonly edges: readonly PackageDependencyEdge[];
  readonly nodes: readonly string[];
  readonly orphans: readonly string[];
}

export interface DeadExport {
  readonly symbol: string;
  readonly file: string;
  readonly line: number;
  readonly language: string;
  readonly exportType:
    | "function"
    | "class"
    | "const"
    | "type"
    | "interface"
    | "enum"
    | "other";
}

export interface TodoAnnotation {
  readonly tag: "TODO" | "FIXME" | "HACK" | "BUG" | "XXX";
  readonly text: string;
  readonly file: string;
  readonly line: number;
  readonly author?: string;
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

export interface CodeDuplicationInstance {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface CodeDuplicationGroup {
  readonly id: number;
  readonly instances: readonly CodeDuplicationInstance[];
  readonly tokenCount: number;
  readonly lineCount: number;
}

export interface CodeDuplicationStats {
  readonly filesScanned: number;
  readonly totalTokens: number;
  readonly duplicateGroups: number;
  readonly duplicatedLines: number;
  readonly duplicationPercentage: number;
}

export interface CodeDuplicationResult {
  readonly groups: readonly CodeDuplicationGroup[];
  readonly stats: CodeDuplicationStats;
}

export interface LayerViolation {
  readonly from: string;
  readonly to: string;
  readonly fromKind: ComponentKind;
  readonly toKind: ComponentKind;
  readonly reason: string;
}

export interface HighImpactComponent {
  readonly name: string;
  readonly path: string;
  readonly score: number;
  readonly transitiveDependents: number;
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
  readonly dryCheck: boolean;
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
  readonly minTokens: number;
  readonly minLines: number;
  readonly extensions: readonly string[];
  readonly minUniqueRatio: number;
  readonly maxLiteralRatio: number;
  readonly ignoreBarrelExports: boolean;
  readonly solid: boolean;
  readonly solidThreshold: number;
  readonly envIncludeTests: boolean;
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
