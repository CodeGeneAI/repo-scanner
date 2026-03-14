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

export interface DependencyPolicyEvaluation {
  readonly failed: boolean;
  readonly vulnerabilities: DependencyPolicyDimensionEvaluation;
  readonly outdated: DependencyPolicyDimensionEvaluation;
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

export const countVulnerabilitiesAtOrAboveThreshold = (
  result: DepScannerResult,
  threshold: VulnerabilitySeverity,
): number => {
  const thresholdValue = severityRank[threshold];
  let count = 0;

  for (const scan of result.scans) {
    for (const report of scan.reports) {
      count += report.vulnerabilities.filter(
        (vulnerability) =>
          severityRank[vulnerability.severity] >= thresholdValue,
      ).length;
    }
  }

  return count;
};

export const countOutdatedAtOrAboveThreshold = (
  result: DepScannerResult,
  threshold: OutdatedThreshold,
): number => {
  const thresholdValue = updateRank[threshold];
  let count = 0;

  for (const scan of result.scans) {
    for (const report of scan.reports) {
      const updateType = report.version?.updateType ?? "unknown";
      if (updateTypeRank[updateType] >= thresholdValue) {
        count += 1;
      }
    }
  }

  return count;
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

  return {
    failed:
      vulnThresholdTriggered ||
      vulnCountTriggered ||
      outdatedThresholdTriggered ||
      outdatedCountTriggered,
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
  };
};
