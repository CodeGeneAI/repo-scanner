export type Ecosystem =
  | "npm"
  | "pypi"
  | "go"
  | "cargo"
  | "rubygems"
  | "maven"
  | "nuget"
  | "packagist"
  | "cocoapods"
  | "pub"
  | "conan";

export type VulnerabilitySeverity =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL"
  | "UNKNOWN";

export interface Dependency {
  readonly name: string;
  readonly currentVersion: string;
  readonly resolvedVersion?: string;
  readonly ecosystem: Ecosystem;
  readonly manifestPath: string;
  readonly isDev: boolean;
  readonly isOptional: boolean;
}

export type UpdateType = "up-to-date" | "patch" | "minor" | "major" | "unknown";

export interface VersionInfo {
  readonly latestVersion: string;
  readonly updateType: UpdateType;
}

export interface Vulnerability {
  readonly id: string;
  readonly summary: string;
  readonly severity: VulnerabilitySeverity;
  readonly affectedVersions: string;
  readonly fixedVersion?: string;
}

export interface UsageLocation {
  readonly filePath: string;
  readonly line: number;
  readonly importStatement: string;
}

export interface DependencyReport {
  readonly dependency: Dependency;
  readonly version?: VersionInfo;
  readonly vulnerabilities: readonly Vulnerability[];
  readonly usages: readonly UsageLocation[];
}

export interface ScanResult {
  readonly ecosystem: Ecosystem;
  readonly reports: readonly DependencyReport[];
  readonly manifestPaths: readonly string[];
  readonly scanDurationMs: number;
}

export interface DepScannerResult {
  readonly scans: readonly ScanResult[];
  readonly totalDependencies: number;
  readonly totalVulnerabilities: number;
  readonly summary: DependencySummary;
  readonly debug?: DependencyDebugSummary;
  readonly scanPath: string;
  readonly timestamp: string;
  readonly durationMs: number;
}

export interface DependencyDebugSummary {
  readonly vulnerabilityKeyStats: {
    readonly totalDependencies: number;
    readonly uniqueKeys: number;
    readonly duplicateKeys: number;
  };
}

export type OutdatedThreshold = "patch" | "minor" | "major";

export interface OutdatedDependencySummaryItem {
  readonly name: string;
  readonly ecosystem: Ecosystem;
  readonly updateType: Exclude<UpdateType, "up-to-date" | "unknown">;
  readonly currentVersion: string;
  readonly latestVersion?: string;
  readonly manifestPath: string;
}

export interface VulnerableDependencySummaryItem {
  readonly name: string;
  readonly ecosystem: Ecosystem;
  readonly vulnerabilityCount: number;
  readonly highestSeverity: VulnerabilitySeverity;
  readonly manifestPath: string;
}

export interface DependencyComponentSummary {
  readonly component: string;
  readonly totalDependencies: number;
  readonly outdatedDependencies: number;
  readonly vulnerabilityCount: number;
}

export type DependencyComponentGroupingMode =
  | "default"
  | "apps-only"
  | "services-only"
  | "workspace-package";

export interface DependencySummary {
  readonly ecosystems: readonly Ecosystem[];
  readonly outdatedDependencies: number;
  readonly topOutdated: readonly OutdatedDependencySummaryItem[];
  readonly topVulnerable: readonly VulnerableDependencySummaryItem[];
  readonly byComponent: readonly DependencyComponentSummary[];
}

export interface IndexedUsageFile {
  readonly path: string;
  readonly ext: string;
}

export interface DependencyScanOptions {
  readonly path: string;
  readonly ecosystems?: readonly Ecosystem[];
  readonly skipUsage: boolean;
  readonly skipSecurity: boolean;
  readonly skipVersionLookup?: boolean;
  readonly concurrency: number;
  readonly indexedUsageFiles?: readonly IndexedUsageFile[];
  readonly indexedFileContent?: ReadonlyMap<string, string>;
  readonly componentGrouping?: DependencyComponentGroupingMode;
  readonly debugVulnerabilityKeys?: boolean;
}
