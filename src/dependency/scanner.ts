import path from "path";
import { getFilteredParsers } from "./parsers/registry";
import { getRegistryClient } from "./registry/index";
import {
  getVulnerabilityLookupKey,
  queryVulnerabilities,
} from "./security/osv";
import type {
  DeadDependencySummaryItem,
  DependencyComponentGroupingMode,
  DependencyComponentSummary,
  DependencyReport,
  DependencyScanOptions,
  DependencySummary,
  DepScannerResult,
  OutdatedDependencySummaryItem,
  ScanResult,
  UpdateType,
  UsageLocation,
  Vulnerability,
  VulnerabilitySeverity,
  VulnerableDependencySummaryItem,
} from "./types";
import { classifyExclusion } from "./usage/exclusions";
import { scanUsages } from "./usage/scanner";
import { extractBaseVersion, getUpdateType } from "./utils/semver";

const TOP_LIST_LIMIT = 5;

const severityRank: Record<VulnerabilitySeverity, number> = {
  UNKNOWN: 1,
  LOW: 2,
  MODERATE: 3,
  HIGH: 4,
  CRITICAL: 5,
};

const updateRank: Record<UpdateType, number> = {
  unknown: 0,
  "up-to-date": 1,
  patch: 2,
  minor: 3,
  major: 4,
};

const compareUsage = (left: UsageLocation, right: UsageLocation): number => {
  if (left.filePath !== right.filePath) {
    return left.filePath.localeCompare(right.filePath);
  }
  return left.line - right.line;
};

const compareVulnerability = (
  left: Vulnerability,
  right: Vulnerability,
): number => {
  if (left.severity !== right.severity) {
    return severityRank[right.severity] - severityRank[left.severity];
  }
  return left.id.localeCompare(right.id);
};

const compareReport = (
  left: DependencyReport,
  right: DependencyReport,
): number => {
  if (left.dependency.name !== right.dependency.name) {
    return left.dependency.name.localeCompare(right.dependency.name);
  }
  return left.dependency.manifestPath.localeCompare(
    right.dependency.manifestPath,
  );
};

const normalizePath = (scanPath: string, filePath: string): string => {
  if (!path.isAbsolute(filePath)) return filePath;
  const relativePath = path.relative(scanPath, filePath);
  return relativePath.startsWith("..") ? filePath : relativePath;
};

const classifyComponent = (
  manifestPath: string,
  componentGrouping: DependencyComponentGroupingMode,
): string => {
  const segments = manifestPath.split(/[\\/]/).filter(Boolean);
  if (segments.length < 2) return "root";

  if (componentGrouping === "apps-only") {
    return segments[0] === "apps" ? `apps/${segments[1]}` : "other";
  }

  if (componentGrouping === "services-only") {
    return segments[0] === "services" ? `services/${segments[1]}` : "other";
  }

  if (componentGrouping === "workspace-package") {
    return segments[0] === "packages" ? `packages/${segments[1]}` : "other";
  }

  if (
    segments[0] === "apps" ||
    segments[0] === "services" ||
    segments[0] === "packages"
  ) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0] ?? "root";
};

const buildPackageKey = (ecosystem: string, name: string): string =>
  `${ecosystem}:${name}`;

const normalizeScanResult = (
  scanPath: string,
  scan: ScanResult,
): ScanResult => {
  const sortedManifestPaths = [...scan.manifestPaths]
    .map((manifestPath) => normalizePath(scanPath, manifestPath))
    .sort((left, right) => left.localeCompare(right));

  const sortedReports: DependencyReport[] = scan.reports
    .map((report) => ({
      ...report,
      dependency: {
        ...report.dependency,
        manifestPath: normalizePath(scanPath, report.dependency.manifestPath),
      },
      vulnerabilities: [...report.vulnerabilities].sort(compareVulnerability),
      usages: [...report.usages]
        .map((usage) => ({
          ...usage,
          filePath: normalizePath(scanPath, usage.filePath),
        }))
        .sort(compareUsage),
    }))
    .sort(compareReport);

  return {
    ...scan,
    manifestPaths: sortedManifestPaths,
    reports: sortedReports,
  };
};

const buildSummary = (
  scans: readonly ScanResult[],
  componentGrouping: DependencyComponentGroupingMode,
  includeDevDeadDeps: boolean,
  skipUsage: boolean,
): {
  readonly summary: DependencySummary;
  readonly totalDependencies: number;
  readonly totalVulnerabilities: number;
} => {
  const flattened = scans.flatMap((scan) =>
    scan.reports.map((report) => ({
      ecosystem: scan.ecosystem,
      report,
    })),
  );

  // Dead dependency detection: deps with zero import usages that aren't excluded.
  // Only compute when usage scanning was not skipped (otherwise all deps would look dead).
  // Cache exclusion results to avoid duplicate classification when aggregating package state.
  type FlatEntry = (typeof flattened)[number];
  const deadSet = new Set<FlatEntry>();
  const deadEligibleSet = new Set<FlatEntry>();

  if (!skipUsage) {
    for (const entry of flattened) {
      if (entry.report.usages.length > 0) {
        deadEligibleSet.add(entry);
        continue;
      }
      const exclusion = classifyExclusion(
        entry.report.dependency,
        entry.ecosystem,
        includeDevDeadDeps,
      );
      if (!exclusion.excluded) {
        deadEligibleSet.add(entry);
        deadSet.add(entry);
      }
    }
  }

  interface AggregatedPackage {
    readonly ecosystem: ScanResult["ecosystem"];
    readonly name: string;
    readonly manifestPath: string;
    readonly currentVersion: string;
    readonly latestVersion?: string;
    readonly updateType: UpdateType;
    readonly vulnerabilitiesById: Map<string, Vulnerability>;
    readonly componentAggregates: ReadonlyMap<
      string,
      {
        readonly updateType: UpdateType;
        readonly vulnerabilitiesById: ReadonlyMap<string, Vulnerability>;
        readonly eligibleReportCount: number;
        readonly deadReportCount: number;
      }
    >;
    readonly allDev: boolean;
    readonly eligibleReportCount: number;
    readonly deadReportCount: number;
  }

  const packageMap = new Map<string, AggregatedPackage>();

  for (const entry of flattened) {
    const manifestPath = entry.report.dependency.manifestPath;
    const component = classifyComponent(manifestPath, componentGrouping);
    const key = buildPackageKey(entry.ecosystem, entry.report.dependency.name);
    const updateType = entry.report.version?.updateType ?? "unknown";
    const isDeadReport = deadSet.has(entry);
    const isDeadEligible = deadEligibleSet.has(entry);
    const hasUsageInComponent = entry.report.usages.some(
      (usage) =>
        classifyComponent(usage.filePath, componentGrouping) === component,
    );
    let isDeadEligibleInComponent = false;
    let isDeadReportInComponent = false;
    if (!skipUsage) {
      if (hasUsageInComponent) {
        isDeadEligibleInComponent = true;
      } else {
        const exclusion = classifyExclusion(
          entry.report.dependency,
          entry.ecosystem,
          includeDevDeadDeps,
        );
        if (!exclusion.excluded) {
          isDeadEligibleInComponent = true;
          isDeadReportInComponent = true;
        }
      }
    }

    const initialComponentAggregate = new Map<
      string,
      {
        readonly updateType: UpdateType;
        readonly vulnerabilitiesById: ReadonlyMap<string, Vulnerability>;
        readonly eligibleReportCount: number;
        readonly deadReportCount: number;
      }
    >();
    const componentVulnerabilitiesById = new Map<string, Vulnerability>();
    for (const vulnerability of entry.report.vulnerabilities) {
      componentVulnerabilitiesById.set(vulnerability.id, vulnerability);
    }
    initialComponentAggregate.set(component, {
      updateType,
      vulnerabilitiesById: componentVulnerabilitiesById,
      eligibleReportCount: isDeadEligibleInComponent ? 1 : 0,
      deadReportCount: isDeadReportInComponent ? 1 : 0,
    });

    const existing = packageMap.get(key);
    if (!existing) {
      const vulnerabilitiesById = new Map<string, Vulnerability>();
      for (const vulnerability of entry.report.vulnerabilities) {
        vulnerabilitiesById.set(vulnerability.id, vulnerability);
      }

      packageMap.set(key, {
        ecosystem: entry.ecosystem,
        name: entry.report.dependency.name,
        manifestPath,
        currentVersion: entry.report.dependency.currentVersion,
        latestVersion: entry.report.version?.latestVersion,
        updateType,
        vulnerabilitiesById,
        componentAggregates: initialComponentAggregate,
        allDev: entry.report.dependency.isDev,
        eligibleReportCount: isDeadEligible ? 1 : 0,
        deadReportCount: isDeadReport ? 1 : 0,
      });
      continue;
    }

    const vulnerabilitiesById = new Map(existing.vulnerabilitiesById);
    for (const vulnerability of entry.report.vulnerabilities) {
      const prior = vulnerabilitiesById.get(vulnerability.id);
      if (
        !prior ||
        severityRank[vulnerability.severity] > severityRank[prior.severity]
      ) {
        vulnerabilitiesById.set(vulnerability.id, vulnerability);
      }
    }

    const shouldPromoteVersion =
      updateRank[updateType] > updateRank[existing.updateType] ||
      (updateRank[updateType] === updateRank[existing.updateType] &&
        manifestPath.localeCompare(existing.manifestPath) < 0);
    const promotedManifestPath = shouldPromoteVersion
      ? manifestPath
      : existing.manifestPath;

    const existingComponent = existing.componentAggregates.get(component);
    const componentVulnerabilities = new Map(
      existingComponent?.vulnerabilitiesById ??
        new Map<string, Vulnerability>(),
    );
    for (const vulnerability of entry.report.vulnerabilities) {
      const prior = componentVulnerabilities.get(vulnerability.id);
      if (
        !prior ||
        severityRank[vulnerability.severity] > severityRank[prior.severity]
      ) {
        componentVulnerabilities.set(vulnerability.id, vulnerability);
      }
    }
    const shouldPromoteComponentUpdateType =
      updateRank[updateType] >
      updateRank[existingComponent?.updateType ?? "unknown"];

    const componentAggregates = new Map(existing.componentAggregates);
    componentAggregates.set(component, {
      updateType: shouldPromoteComponentUpdateType
        ? updateType
        : (existingComponent?.updateType ?? "unknown"),
      vulnerabilitiesById: componentVulnerabilities,
      eligibleReportCount:
        (existingComponent?.eligibleReportCount ?? 0) +
        (isDeadEligibleInComponent ? 1 : 0),
      deadReportCount:
        (existingComponent?.deadReportCount ?? 0) +
        (isDeadReportInComponent ? 1 : 0),
    });

    packageMap.set(key, {
      ecosystem: existing.ecosystem,
      name: existing.name,
      manifestPath: promotedManifestPath,
      currentVersion: shouldPromoteVersion
        ? entry.report.dependency.currentVersion
        : existing.currentVersion,
      latestVersion: shouldPromoteVersion
        ? entry.report.version?.latestVersion
        : existing.latestVersion,
      updateType: shouldPromoteVersion ? updateType : existing.updateType,
      vulnerabilitiesById,
      componentAggregates,
      allDev: existing.allDev && entry.report.dependency.isDev,
      eligibleReportCount:
        existing.eligibleReportCount + (isDeadEligible ? 1 : 0),
      deadReportCount: existing.deadReportCount + (isDeadReport ? 1 : 0),
    });
  }

  interface ComponentSummaryEntry {
    readonly component: string;
    readonly updateType: UpdateType;
    readonly vulnerabilityCount: number;
    readonly isDead: boolean;
  }

  interface PackageSummaryEntry {
    readonly ecosystem: ScanResult["ecosystem"];
    readonly name: string;
    readonly manifestPath: string;
    readonly currentVersion: string;
    readonly latestVersion?: string;
    readonly updateType: UpdateType;
    readonly vulnerabilityCount: number;
    readonly highestSeverity: VulnerabilitySeverity;
    readonly componentSummaries: readonly ComponentSummaryEntry[];
    readonly isDead: boolean;
    readonly isDev: boolean;
  }

  const packages: PackageSummaryEntry[] = Array.from(packageMap.values())
    .map((pkg) => {
      const vulnerabilities = [...pkg.vulnerabilitiesById.values()];
      const highestSeverity =
        vulnerabilities.length > 0
          ? vulnerabilities
              .slice()
              .sort(
                (left, right) =>
                  severityRank[right.severity] - severityRank[left.severity],
              )[0]!.severity
          : "UNKNOWN";

      return {
        ecosystem: pkg.ecosystem,
        name: pkg.name,
        manifestPath: pkg.manifestPath,
        currentVersion: pkg.currentVersion,
        latestVersion: pkg.latestVersion,
        updateType: pkg.updateType,
        vulnerabilityCount: vulnerabilities.length,
        highestSeverity,
        componentSummaries: [...pkg.componentAggregates.entries()]
          .map(([component, aggregate]) => ({
            component,
            updateType: aggregate.updateType,
            vulnerabilityCount: aggregate.vulnerabilitiesById.size,
            isDead:
              aggregate.eligibleReportCount > 0 &&
              aggregate.deadReportCount === aggregate.eligibleReportCount,
          }))
          .sort((left, right) => left.component.localeCompare(right.component)),
        isDead:
          !skipUsage &&
          pkg.eligibleReportCount > 0 &&
          pkg.deadReportCount === pkg.eligibleReportCount,
        isDev: pkg.allDev,
      };
    })
    .sort((left, right) => {
      if (left.ecosystem !== right.ecosystem) {
        return left.ecosystem.localeCompare(right.ecosystem);
      }
      return left.name.localeCompare(right.name);
    });

  const byComponentMap = new Map<
    string,
    {
      totalDependencies: number;
      outdatedDependencies: number;
      vulnerabilityCount: number;
      deadDependencies: number;
    }
  >();

  for (const pkg of packages) {
    for (const componentSummary of pkg.componentSummaries) {
      const existing = byComponentMap.get(componentSummary.component) ?? {
        totalDependencies: 0,
        outdatedDependencies: 0,
        vulnerabilityCount: 0,
        deadDependencies: 0,
      };

      existing.totalDependencies += 1;
      if (
        componentSummary.updateType !== "unknown" &&
        componentSummary.updateType !== "up-to-date"
      ) {
        existing.outdatedDependencies += 1;
      }
      existing.vulnerabilityCount += componentSummary.vulnerabilityCount;
      if (componentSummary.isDead) {
        existing.deadDependencies += 1;
      }
      byComponentMap.set(componentSummary.component, existing);
    }
  }

  const byComponent: DependencyComponentSummary[] = Array.from(byComponentMap)
    .map(([component, stats]) => ({
      component,
      ...stats,
    }))
    .sort((left, right) => left.component.localeCompare(right.component));

  const topOutdated: OutdatedDependencySummaryItem[] = packages
    .filter(
      (pkg) => pkg.updateType !== "unknown" && pkg.updateType !== "up-to-date",
    )
    .sort((left, right) => {
      if (left.updateType !== right.updateType) {
        return updateRank[right.updateType] - updateRank[left.updateType];
      }
      if (left.ecosystem !== right.ecosystem) {
        return left.ecosystem.localeCompare(right.ecosystem);
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, TOP_LIST_LIMIT)
    .map((pkg) => ({
      name: pkg.name,
      ecosystem: pkg.ecosystem,
      updateType: pkg.updateType as OutdatedDependencySummaryItem["updateType"],
      currentVersion: pkg.currentVersion,
      latestVersion: pkg.latestVersion,
      manifestPath: pkg.manifestPath,
    }));

  const topVulnerable: VulnerableDependencySummaryItem[] = packages
    .filter((pkg) => pkg.vulnerabilityCount > 0)
    .sort((left, right) => {
      if (left.highestSeverity !== right.highestSeverity) {
        return (
          severityRank[right.highestSeverity] -
          severityRank[left.highestSeverity]
        );
      }
      if (left.vulnerabilityCount !== right.vulnerabilityCount) {
        return right.vulnerabilityCount - left.vulnerabilityCount;
      }
      if (left.ecosystem !== right.ecosystem) {
        return left.ecosystem.localeCompare(right.ecosystem);
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, TOP_LIST_LIMIT)
    .map((pkg) => ({
      name: pkg.name,
      ecosystem: pkg.ecosystem,
      vulnerabilityCount: pkg.vulnerabilityCount,
      highestSeverity: pkg.highestSeverity,
      manifestPath: pkg.manifestPath,
    }));

  const topDead: DeadDependencySummaryItem[] = packages
    .filter((pkg) => pkg.isDead)
    .sort((left, right) => {
      if (left.ecosystem !== right.ecosystem) {
        return left.ecosystem.localeCompare(right.ecosystem);
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, TOP_LIST_LIMIT)
    .map((pkg) => ({
      name: pkg.name,
      ecosystem: pkg.ecosystem,
      isDev: pkg.isDev,
      manifestPath: pkg.manifestPath,
    }));

  const ecosystems = [...new Set(packages.map((pkg) => pkg.ecosystem))].sort(
    (a, b) => a.localeCompare(b),
  );
  const outdatedDependencies = packages.filter(
    (pkg) => pkg.updateType !== "unknown" && pkg.updateType !== "up-to-date",
  ).length;
  const deadDependencies = packages.filter((pkg) => pkg.isDead).length;
  const totalDependencies = packages.length;
  const totalVulnerabilities = packages.reduce(
    (sum, pkg) => sum + pkg.vulnerabilityCount,
    0,
  );

  return {
    totalDependencies,
    totalVulnerabilities,
    summary: {
      ecosystems,
      outdatedDependencies,
      deadDependencies,
      topOutdated,
      topVulnerable,
      topDead,
      byComponent,
    },
  };
};

export const scanDependencySubsystem = async (
  options: DependencyScanOptions,
): Promise<DepScannerResult> => {
  const startTime = Date.now();
  const parsers = getFilteredParsers(options.ecosystems);

  const scans: ScanResult[] = [];
  let totalVulnerabilityLookupKeys = 0;
  const uniqueVulnerabilityLookupKeys = new Set<string>();

  for (const parser of parsers) {
    const scanStart = Date.now();
    const manifestPaths = await parser.detectFiles(options.path);
    if (manifestPaths.length === 0) continue;

    const dependencies = await parser.parseDependencies(manifestPaths);
    if (dependencies.length === 0) continue;

    const registryClient = getRegistryClient(parser.ecosystem);
    const uniqueNames = [
      ...new Set(dependencies.map((dependency) => dependency.name)),
    ];
    const latestVersions =
      registryClient && !options.skipVersionLookup
        ? await registryClient.getLatestVersions(uniqueNames)
        : new Map<string, string>();

    const seen = new Set<string>();
    const uniqueDeps = dependencies.filter((dependency) => {
      if (seen.has(dependency.name)) return false;
      seen.add(dependency.name);
      return true;
    });

    for (const dependency of dependencies) {
      totalVulnerabilityLookupKeys += 1;
      uniqueVulnerabilityLookupKeys.add(getVulnerabilityLookupKey(dependency));
    }

    const vulnerabilities: Map<string, Vulnerability[]> = options.skipSecurity
      ? new Map()
      : await queryVulnerabilities(uniqueDeps);

    const usages: Map<string, UsageLocation[]> = options.skipUsage
      ? new Map()
      : await scanUsages(
          options.path,
          parser.ecosystem,
          dependencies,
          parser.getImportPatterns(dependencies),
          options.concurrency,
          options.indexedUsageFiles,
          options.indexedFileContent,
        );

    const reports: DependencyReport[] = [];
    for (const dependency of dependencies) {
      const currentVersion =
        dependency.resolvedVersion ??
        extractBaseVersion(dependency.currentVersion);
      const latestVersion = latestVersions.get(dependency.name);

      reports.push({
        dependency,
        version: latestVersion
          ? {
              latestVersion,
              updateType: getUpdateType(currentVersion, latestVersion),
            }
          : undefined,
        vulnerabilities:
          vulnerabilities.get(getVulnerabilityLookupKey(dependency)) ?? [],
        usages: usages.get(dependency.name) ?? [],
      });
    }

    scans.push(
      normalizeScanResult(options.path, {
        ecosystem: parser.ecosystem,
        reports,
        manifestPaths,
        scanDurationMs: Date.now() - scanStart,
      }),
    );
  }

  const sortedScans = scans.sort((left, right) =>
    left.ecosystem.localeCompare(right.ecosystem),
  );
  const summaryResult = buildSummary(
    sortedScans,
    options.componentGrouping ?? "default",
    options.includeDevDeadDeps ?? false,
    options.skipUsage,
  );

  return {
    scans: sortedScans,
    totalDependencies: summaryResult.totalDependencies,
    totalVulnerabilities: summaryResult.totalVulnerabilities,
    summary: summaryResult.summary,
    debug: options.debugVulnerabilityKeys
      ? {
          vulnerabilityKeyStats: {
            totalDependencies: totalVulnerabilityLookupKeys,
            uniqueKeys: uniqueVulnerabilityLookupKeys.size,
            duplicateKeys:
              totalVulnerabilityLookupKeys - uniqueVulnerabilityLookupKeys.size,
          },
        }
      : undefined,
    scanPath: options.path,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };
};
