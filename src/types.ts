import type { SolidHealthResult } from "./ast/solid/types";
import type { DryCheckStats, DuplicateGroup } from "./code-duplication/types";
import type {
  DependencyComponentGroupingMode,
  DepScannerResult,
  Ecosystem,
  OutdatedThreshold,
  VulnerabilitySeverity,
} from "./dependency/types";
import type { DatabaseSchema } from "./detectors/db-schema/types";

export type { SolidHealthResult } from "./ast/solid/types";
export type { DatabaseSchema } from "./detectors/db-schema/types";

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
  readonly namingConventions?: {
    readonly file?: {
      readonly dominantStyle: string;
      readonly percentage: number;
      readonly sampleSize: number;
    };
    readonly directory?: {
      readonly dominantStyle: string;
      readonly percentage: number;
      readonly sampleSize: number;
    };
  };
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
  readonly dependencies?: DepScannerResult;
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
    readonly databaseSchema?: DatabaseSchema;
    readonly callGraph?: CallGraph;
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

export interface CallGraphNode {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly line: number;
}

export interface CallGraphEdge {
  readonly callerId: string;
  readonly calleeId: string;
  readonly line: number;
  readonly caller: {
    readonly name: string;
    readonly file: string;
  };
  readonly callee: {
    readonly name: string;
    readonly file: string;
  };
}

export interface CallGraph {
  readonly nodes: readonly CallGraphNode[];
  readonly edges: readonly CallGraphEdge[];
  readonly truncated?: boolean;
  readonly warnings?: readonly string[];
}

export interface DiffBlastRadius {
  readonly component: string;
  readonly score: number;
  readonly dependents: readonly string[];
}

export interface DiffConventionViolation {
  readonly file: string;
  readonly violation: string;
}

export interface DiffDuplicationResult {
  readonly stats: DryCheckStats;
  readonly groups: readonly DuplicateGroup[];
}

export interface DiffScanResult {
  readonly changedFiles: readonly string[];
  readonly affectedComponents: readonly string[];
  readonly blastRadius: readonly DiffBlastRadius[];
  readonly testFilesToUpdate: readonly string[];
  readonly conventionViolations: readonly DiffConventionViolation[];
  readonly newTodos: readonly TodoAnnotation[];
  readonly newDeadExports: readonly DeadExport[];
  readonly suggestedReviewFocus: readonly string[];
  readonly warnings?: readonly string[];
  readonly newDuplication?: DiffDuplicationResult;
  readonly newEnvVars?: readonly EnvVarInfo[];
}

export interface ExternalService {
  readonly name: string;
  readonly category: string;
  readonly evidence: readonly string[];
}

export type {
  DiagramKind,
  DiagramOutput,
  TopologyResult,
} from "./output/topology/types";

import type { DiagramKind } from "./output/topology/types";

export interface CliOptions {
  readonly path: string;
  readonly format: "table" | "json";
  readonly showHelp: boolean;
  readonly showVersion: boolean;
  readonly showUpdate: boolean;
  readonly showDetectors: boolean;
  readonly completionShell?: "bash" | "zsh" | "fish";
  readonly completionInstall: boolean;
  readonly completionUninstall: boolean;
  readonly detectorsSchema: boolean;
  readonly detectorSelectionWarnings: readonly string[];
  readonly noUpdateCheck: boolean;
  readonly scanArchitecture: boolean;
  readonly scanInventory: boolean;
  readonly scanExternalServices: boolean;
  readonly scanBuildAndTest: boolean;
  readonly allDetectors: boolean;
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
  readonly topology: boolean;
  readonly topologyDiagrams?: readonly DiagramKind[];
  readonly topologyOutput?: string;
  readonly diff?: string;
  readonly diffDryCheck: boolean;
  readonly diffDryIncludeTests: boolean;
  readonly diffEnvCheck: boolean;
  readonly failOnNewDuplicationPct?: number;
  readonly failOnNewEnvVars: boolean;
  readonly callGraph: boolean;
  readonly failOnDeadDeps: boolean;
  readonly failOnDeadDepsCount?: number;
  readonly includeDevDeadDeps: boolean;
  readonly dbSchema: boolean;
  readonly env: boolean;
  readonly namingConvention: boolean;
  readonly runtime: boolean;
  readonly largeFile: boolean;
  readonly todo: boolean;
  readonly deadExport: boolean;
  readonly codeDuplication: boolean;
  readonly complexityHotspots: boolean;
  readonly languageDetector: boolean;
  readonly languageStatsDetector: boolean;
  readonly codebaseSizeDetector: boolean;
  readonly frameworkDetector: boolean;
  readonly monorepoDetector: boolean;
  readonly componentsDetector: boolean;
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
  readonly crossPackageDepsDetector: boolean;
  readonly circularDepsDetector: boolean;
  readonly layerViolationsDetector: boolean;
  readonly highImpactComponentsDetector: boolean;
  readonly codeQualityDetector: boolean;
  readonly deploymentPlatformDetector: boolean;
  readonly externalServicesDetector: boolean;
  readonly apiSurfaceDetector: boolean;
  readonly vcs: boolean;
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
  readonly includeDevDeadDeps?: boolean;
}

export interface ScanRepoOptions {
  readonly enabledDetectorIds?: readonly string[];
  readonly dependencies?: DependencyScanConfig;
}
