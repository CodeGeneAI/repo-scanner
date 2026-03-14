import path from "path";
import { getFilteredParsers } from "./parsers/registry";
import { getRegistryClient } from "./registry/index";
import {
  getVulnerabilityLookupKey,
  queryVulnerabilities,
} from "./security/osv";
import type {
  DependencyComponentGroupingMode,
  DependencyComponentSummary,
  DependencyReport,
  DependencyScanOptions,
  DepScannerResult,
  OutdatedDependencySummaryItem,
  ScanResult,
  UpdateType,
  UsageLocation,
  Vulnerability,
  VulnerabilitySeverity,
  VulnerableDependencySummaryItem,
} from "./types";
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
) => {
  const flattened = scans.flatMap((scan) =>
    scan.reports.map((report) => ({
      ecosystem: scan.ecosystem,
      report,
    })),
  );

  const outdated = flattened
    .filter(
      ({ report }) =>
        report.version !== undefined &&
        report.version.updateType !== "unknown" &&
        report.version.updateType !== "up-to-date",
    )
    .sort((left, right) => {
      const leftType = left.report.version?.updateType ?? "unknown";
      const rightType = right.report.version?.updateType ?? "unknown";

      if (leftType !== rightType) {
        return updateRank[rightType] - updateRank[leftType];
      }
      if (left.ecosystem !== right.ecosystem) {
        return left.ecosystem.localeCompare(right.ecosystem);
      }
      return left.report.dependency.name.localeCompare(
        right.report.dependency.name,
      );
    });

  const vulnerable = flattened
    .filter(({ report }) => report.vulnerabilities.length > 0)
    .sort((left, right) => {
      const leftHighest = Math.max(
        ...left.report.vulnerabilities.map(
          (vuln) => severityRank[vuln.severity],
        ),
      );
      const rightHighest = Math.max(
        ...right.report.vulnerabilities.map(
          (vuln) => severityRank[vuln.severity],
        ),
      );

      if (leftHighest !== rightHighest) {
        return rightHighest - leftHighest;
      }

      if (
        left.report.vulnerabilities.length !==
        right.report.vulnerabilities.length
      ) {
        return (
          right.report.vulnerabilities.length -
          left.report.vulnerabilities.length
        );
      }

      if (left.ecosystem !== right.ecosystem) {
        return left.ecosystem.localeCompare(right.ecosystem);
      }

      return left.report.dependency.name.localeCompare(
        right.report.dependency.name,
      );
    });

  const byComponentMap = new Map<
    string,
    {
      totalDependencies: number;
      outdatedDependencies: number;
      vulnerabilityCount: number;
    }
  >();

  for (const { report } of flattened) {
    const component = classifyComponent(
      report.dependency.manifestPath,
      componentGrouping,
    );
    const existing = byComponentMap.get(component) ?? {
      totalDependencies: 0,
      outdatedDependencies: 0,
      vulnerabilityCount: 0,
    };

    existing.totalDependencies += 1;
    if (
      report.version &&
      report.version.updateType !== "unknown" &&
      report.version.updateType !== "up-to-date"
    ) {
      existing.outdatedDependencies += 1;
    }
    existing.vulnerabilityCount += report.vulnerabilities.length;

    byComponentMap.set(component, existing);
  }

  const byComponent: DependencyComponentSummary[] = Array.from(byComponentMap)
    .map(([component, stats]) => ({
      component,
      ...stats,
    }))
    .sort((left, right) => left.component.localeCompare(right.component));

  const topOutdated: OutdatedDependencySummaryItem[] = outdated
    .slice(0, TOP_LIST_LIMIT)
    .map(({ ecosystem, report }) => ({
      name: report.dependency.name,
      ecosystem,
      updateType: report.version!
        .updateType as OutdatedDependencySummaryItem["updateType"],
      currentVersion: report.dependency.currentVersion,
      latestVersion: report.version?.latestVersion,
      manifestPath: report.dependency.manifestPath,
    }));

  const topVulnerable: VulnerableDependencySummaryItem[] = vulnerable
    .slice(0, TOP_LIST_LIMIT)
    .map(({ ecosystem, report }) => {
      const highestSeverity = [...report.vulnerabilities].sort(
        (left, right) =>
          severityRank[right.severity] - severityRank[left.severity],
      )[0]!.severity;

      return {
        name: report.dependency.name,
        ecosystem,
        vulnerabilityCount: report.vulnerabilities.length,
        highestSeverity,
        manifestPath: report.dependency.manifestPath,
      };
    });

  const ecosystems = [...new Set(scans.map((scan) => scan.ecosystem))].sort(
    (a, b) => a.localeCompare(b),
  );

  return {
    ecosystems,
    outdatedDependencies: outdated.length,
    topOutdated,
    topVulnerable,
    byComponent,
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
    const latestVersions = registryClient
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

  const totalDependencies = sortedScans.reduce(
    (sum, scan) => sum + scan.reports.length,
    0,
  );
  const totalVulnerabilities = sortedScans.reduce(
    (sum, scan) =>
      sum +
      scan.reports.reduce(
        (vulnerabilityCount, report) =>
          vulnerabilityCount + report.vulnerabilities.length,
        0,
      ),
    0,
  );

  return {
    scans: sortedScans,
    totalDependencies,
    totalVulnerabilities,
    summary: buildSummary(sortedScans, options.componentGrouping ?? "default"),
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
