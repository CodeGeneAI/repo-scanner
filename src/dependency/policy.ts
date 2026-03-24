import type {
  DepScannerResult,
  OutdatedThreshold,
  VulnerabilitySeverity,
} from "./types";

export interface DependencyPolicyOptions {
  readonly failOnVulns: boolean;
  readonly failOnVulnsCount?: number;
  readonly severityThreshold: VulnerabilitySeverity;
  readonly failOnOutdated: boolean;
  readonly failOnOutdatedCount?: number;
  readonly outdatedThreshold: OutdatedThreshold;
  readonly failOnDeadDeps?: boolean;
  readonly failOnDeadDepsCount?: number;
}

interface DependencyPolicyDimensionEvaluation {
  readonly threshold: VulnerabilitySeverity | OutdatedThreshold;
  readonly thresholdMatches: number;
  readonly failOnAnyEnabled: boolean;
  readonly failOnCount?: number;
  readonly failed: boolean;
  readonly triggeredBy:
    | "none"
    | "fail-on-vulns"
    | "fail-on-outdated"
    | "fail-on-vulns-count"
    | "fail-on-outdated-count"
    | "both";
}

export interface DeadDepsPolicyDimensionEvaluation {
  readonly count: number;
  readonly failOnAnyEnabled: boolean;
  readonly failOnCount?: number;
  readonly failed: boolean;
  readonly triggeredBy:
    | "none"
    | "fail-on-dead-deps"
    | "fail-on-dead-deps-count"
    | "both";
}

export interface DependencyPolicyEvaluation {
  readonly failed: boolean;
  readonly vulnerabilities: DependencyPolicyDimensionEvaluation;
  readonly outdated: DependencyPolicyDimensionEvaluation;
  readonly deadDeps: DeadDepsPolicyDimensionEvaluation;
}

const severityRank: Record<VulnerabilitySeverity, number> = {
  UNKNOWN: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const updateRank: Record<OutdatedThreshold, number> = {
  patch: 1,
  minor: 2,
  major: 3,
};

const updateTypeRank = {
  "up-to-date": 0,
  unknown: 0,
  patch: 1,
  minor: 2,
  major: 3,
} as const;

const buildPackageKey = (ecosystem: string, name: string): string =>
  `${ecosystem}:${name}`;

export const countVulnerabilitiesAtOrAboveThreshold = (
  result: DepScannerResult,
  threshold: VulnerabilitySeverity,
): number => {
  const thresholdValue = severityRank[threshold];
  const vulnerabilitySeverities = new Map<string, number>();

  for (const scan of result.scans) {
    for (const report of scan.reports) {
      const packageKey = buildPackageKey(
        scan.ecosystem,
        report.dependency.name,
      );
      for (const vulnerability of report.vulnerabilities) {
        const key = `${packageKey}:${vulnerability.id}`;
        const rank = severityRank[vulnerability.severity];
        const priorRank = vulnerabilitySeverities.get(key);
        if (priorRank === undefined || rank > priorRank) {
          vulnerabilitySeverities.set(key, rank);
        }
      }
    }
  }

  return [...vulnerabilitySeverities.values()].filter(
    (rank) => rank >= thresholdValue,
  ).length;
};

export const countOutdatedAtOrAboveThreshold = (
  result: DepScannerResult,
  threshold: OutdatedThreshold,
): number => {
  const thresholdValue = updateRank[threshold];
  const outdatedRankByPackage = new Map<string, number>();

  for (const scan of result.scans) {
    for (const report of scan.reports) {
      const packageKey = buildPackageKey(
        scan.ecosystem,
        report.dependency.name,
      );
      const updateType = report.version?.updateType ?? "unknown";
      const rank = updateTypeRank[updateType];
      const priorRank = outdatedRankByPackage.get(packageKey) ?? 0;
      if (rank > priorRank) {
        outdatedRankByPackage.set(packageKey, rank);
      }
    }
  }

  return [...outdatedRankByPackage.values()].filter(
    (rank) => rank >= thresholdValue,
  ).length;
};

export const evaluateDependencyPolicy = (
  result: DepScannerResult,
  options: DependencyPolicyOptions,
): DependencyPolicyEvaluation => {
  const vulnerabilityMatches = countVulnerabilitiesAtOrAboveThreshold(
    result,
    options.severityThreshold,
  );
  const outdatedMatches = countOutdatedAtOrAboveThreshold(
    result,
    options.outdatedThreshold,
  );

  const deadDepsCount = result.summary.deadDependencies;

  const vulnThresholdTriggered =
    options.failOnVulns && vulnerabilityMatches > 0;
  const vulnCountTriggered =
    options.failOnVulnsCount !== undefined &&
    vulnerabilityMatches >= options.failOnVulnsCount;

  const outdatedThresholdTriggered =
    options.failOnOutdated && outdatedMatches > 0;
  const outdatedCountTriggered =
    options.failOnOutdatedCount !== undefined &&
    outdatedMatches >= options.failOnOutdatedCount;

  const deadDepsThresholdTriggered =
    (options.failOnDeadDeps ?? false) && deadDepsCount > 0;
  const deadDepsCountTriggered =
    options.failOnDeadDepsCount !== undefined &&
    deadDepsCount >= options.failOnDeadDepsCount;

  return {
    failed:
      vulnThresholdTriggered ||
      vulnCountTriggered ||
      outdatedThresholdTriggered ||
      outdatedCountTriggered ||
      deadDepsThresholdTriggered ||
      deadDepsCountTriggered,
    vulnerabilities: {
      threshold: options.severityThreshold,
      thresholdMatches: vulnerabilityMatches,
      failOnAnyEnabled: options.failOnVulns,
      failOnCount: options.failOnVulnsCount,
      failed: vulnThresholdTriggered || vulnCountTriggered,
      triggeredBy:
        vulnThresholdTriggered && vulnCountTriggered
          ? "both"
          : vulnThresholdTriggered
            ? "fail-on-vulns"
            : vulnCountTriggered
              ? "fail-on-vulns-count"
              : "none",
    },
    outdated: {
      threshold: options.outdatedThreshold,
      thresholdMatches: outdatedMatches,
      failOnAnyEnabled: options.failOnOutdated,
      failOnCount: options.failOnOutdatedCount,
      failed: outdatedThresholdTriggered || outdatedCountTriggered,
      triggeredBy:
        outdatedThresholdTriggered && outdatedCountTriggered
          ? "both"
          : outdatedThresholdTriggered
            ? "fail-on-outdated"
            : outdatedCountTriggered
              ? "fail-on-outdated-count"
              : "none",
    },
    deadDeps: {
      count: deadDepsCount,
      failOnAnyEnabled: options.failOnDeadDeps ?? false,
      failOnCount: options.failOnDeadDepsCount,
      failed: deadDepsThresholdTriggered || deadDepsCountTriggered,
      triggeredBy:
        deadDepsThresholdTriggered && deadDepsCountTriggered
          ? "both"
          : deadDepsThresholdTriggered
            ? "fail-on-dead-deps"
            : deadDepsCountTriggered
              ? "fail-on-dead-deps-count"
              : "none",
    },
  };
};
