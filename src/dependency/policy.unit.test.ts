import { describe, expect, it } from "bun:test";
import {
  countOutdatedAtOrAboveThreshold,
  countVulnerabilitiesAtOrAboveThreshold,
  evaluateDependencyPolicy,
} from "./policy";
import type { DepScannerResult } from "./types";

const fixtureResult: DepScannerResult = {
  scans: [
    {
      ecosystem: "npm",
      manifestPaths: ["package.json"],
      scanDurationMs: 5,
      reports: [
        {
          dependency: {
            name: "alpha",
            ecosystem: "npm",
            currentVersion: "1.0.0",
            manifestPath: "package.json",
            isDev: false,
            isOptional: false,
          },
          version: {
            latestVersion: "2.0.0",
            updateType: "major",
          },
          vulnerabilities: [
            {
              id: "OSV-1",
              summary: "critical issue",
              severity: "CRITICAL",
              affectedVersions: "<2.0.0",
            },
          ],
          usages: [],
        },
        {
          dependency: {
            name: "beta",
            ecosystem: "npm",
            currentVersion: "1.0.0",
            manifestPath: "package.json",
            isDev: false,
            isOptional: false,
          },
          version: {
            latestVersion: "1.2.0",
            updateType: "minor",
          },
          vulnerabilities: [
            {
              id: "OSV-2",
              summary: "moderate issue",
              severity: "MODERATE",
              affectedVersions: "<1.2.0",
            },
          ],
          usages: [],
        },
      ],
    },
  ],
  totalDependencies: 2,
  totalVulnerabilities: 2,
  summary: {
    ecosystems: ["npm"],
    outdatedDependencies: 2,
    deadDependencies: 2,
    topOutdated: [],
    topVulnerable: [],
    topDead: [
      {
        name: "alpha",
        ecosystem: "npm",
        isDev: false,
        manifestPath: "package.json",
      },
      {
        name: "beta",
        ecosystem: "npm",
        isDev: false,
        manifestPath: "package.json",
      },
    ],
    byComponent: [],
  },
  scanPath: ".",
  timestamp: new Date(0).toISOString(),
  durationMs: 10,
};

const duplicatedPackageFixtureResult: DepScannerResult = {
  scans: [
    {
      ecosystem: "npm",
      manifestPaths: ["apps/web/package.json", "services/api/package.json"],
      scanDurationMs: 5,
      reports: [
        {
          dependency: {
            name: "shared-dep",
            ecosystem: "npm",
            currentVersion: "1.0.0",
            manifestPath: "apps/web/package.json",
            isDev: false,
            isOptional: false,
          },
          version: {
            latestVersion: "2.0.0",
            updateType: "major",
          },
          vulnerabilities: [
            {
              id: "OSV-SHARED-1",
              summary: "critical issue",
              severity: "CRITICAL",
              affectedVersions: "<2.0.0",
            },
          ],
          usages: [],
        },
        {
          dependency: {
            name: "shared-dep",
            ecosystem: "npm",
            currentVersion: "1.0.0",
            manifestPath: "services/api/package.json",
            isDev: false,
            isOptional: false,
          },
          version: {
            latestVersion: "2.0.0",
            updateType: "major",
          },
          vulnerabilities: [
            {
              id: "OSV-SHARED-1",
              summary: "critical issue",
              severity: "CRITICAL",
              affectedVersions: "<2.0.0",
            },
          ],
          usages: [],
        },
      ],
    },
  ],
  totalDependencies: 1,
  totalVulnerabilities: 1,
  summary: {
    ecosystems: ["npm"],
    outdatedDependencies: 1,
    deadDependencies: 1,
    topOutdated: [],
    topVulnerable: [],
    topDead: [
      {
        name: "shared-dep",
        ecosystem: "npm",
        isDev: false,
        manifestPath: "apps/web/package.json",
      },
    ],
    byComponent: [],
  },
  scanPath: ".",
  timestamp: new Date(0).toISOString(),
  durationMs: 10,
};

const unknownSeverityFixtureResult: DepScannerResult = {
  scans: [
    {
      ecosystem: "npm",
      manifestPaths: ["apps/web/package.json", "services/api/package.json"],
      scanDurationMs: 5,
      reports: [
        {
          dependency: {
            name: "mystery-pkg",
            ecosystem: "npm",
            currentVersion: "1.0.0",
            manifestPath: "apps/web/package.json",
            isDev: false,
            isOptional: false,
          },
          version: undefined,
          vulnerabilities: [
            {
              id: "OSV-MYSTERY-1",
              summary: "unknown severity issue",
              severity: "UNKNOWN",
              affectedVersions: "*",
            },
          ],
          usages: [],
        },
        {
          dependency: {
            name: "mystery-pkg",
            ecosystem: "npm",
            currentVersion: "1.0.0",
            manifestPath: "services/api/package.json",
            isDev: false,
            isOptional: false,
          },
          version: undefined,
          vulnerabilities: [
            {
              id: "OSV-MYSTERY-1",
              summary: "unknown severity issue",
              severity: "UNKNOWN",
              affectedVersions: "*",
            },
          ],
          usages: [],
        },
      ],
    },
  ],
  totalDependencies: 1,
  totalVulnerabilities: 1,
  summary: {
    ecosystems: ["npm"],
    outdatedDependencies: 0,
    deadDependencies: 0,
    topOutdated: [],
    topVulnerable: [],
    topDead: [],
    byComponent: [],
  },
  scanPath: ".",
  timestamp: new Date(0).toISOString(),
  durationMs: 10,
};

describe("dependency policy counters", () => {
  it("counts vulnerabilities by threshold", () => {
    expect(countVulnerabilitiesAtOrAboveThreshold(fixtureResult, "LOW")).toBe(
      2,
    );
    expect(countVulnerabilitiesAtOrAboveThreshold(fixtureResult, "HIGH")).toBe(
      1,
    );
    expect(
      countVulnerabilitiesAtOrAboveThreshold(fixtureResult, "CRITICAL"),
    ).toBe(1);
  });

  it("counts outdated dependencies by threshold", () => {
    expect(countOutdatedAtOrAboveThreshold(fixtureResult, "patch")).toBe(2);
    expect(countOutdatedAtOrAboveThreshold(fixtureResult, "minor")).toBe(2);
    expect(countOutdatedAtOrAboveThreshold(fixtureResult, "major")).toBe(1);
  });

  it("deduplicates outdated threshold counts by package key", () => {
    expect(
      countOutdatedAtOrAboveThreshold(duplicatedPackageFixtureResult, "major"),
    ).toBe(1);
  });

  it("deduplicates vulnerability threshold counts by package key", () => {
    expect(
      countVulnerabilitiesAtOrAboveThreshold(
        duplicatedPackageFixtureResult,
        "HIGH",
      ),
    ).toBe(1);
  });

  it("counts unknown-severity vulnerabilities when threshold is unknown", () => {
    expect(
      countVulnerabilitiesAtOrAboveThreshold(
        unknownSeverityFixtureResult,
        "UNKNOWN",
      ),
    ).toBe(1);
  });

  it("evaluates threshold and count policy triggers", () => {
    const evaluation = evaluateDependencyPolicy(fixtureResult, {
      failOnVulns: true,
      failOnVulnsCount: 1,
      severityThreshold: "HIGH",
      failOnOutdated: false,
      failOnOutdatedCount: 2,
      outdatedThreshold: "minor",
      failOnDeadDeps: false,
    });

    expect(evaluation.failed).toBeTrue();
    expect(evaluation.vulnerabilities.failed).toBeTrue();
    expect(evaluation.vulnerabilities.triggeredBy).toBe("both");
    expect(evaluation.outdated.failed).toBeTrue();
    expect(evaluation.outdated.triggeredBy).toBe("fail-on-outdated-count");
  });

  it("evaluates dead deps policy with failOnDeadDeps", () => {
    const evaluation = evaluateDependencyPolicy(fixtureResult, {
      failOnVulns: false,
      severityThreshold: "LOW",
      failOnOutdated: false,
      outdatedThreshold: "patch",
      failOnDeadDeps: true,
    });

    expect(evaluation.failed).toBeTrue();
    expect(evaluation.deadDeps.failed).toBeTrue();
    expect(evaluation.deadDeps.count).toBe(2);
    expect(evaluation.deadDeps.triggeredBy).toBe("fail-on-dead-deps");
  });

  it("evaluates dead deps policy with failOnDeadDepsCount", () => {
    const evaluation = evaluateDependencyPolicy(fixtureResult, {
      failOnVulns: false,
      severityThreshold: "LOW",
      failOnOutdated: false,
      outdatedThreshold: "patch",
      failOnDeadDeps: false,
      failOnDeadDepsCount: 3,
    });

    // 2 dead deps, threshold is 3, should not fail
    expect(evaluation.deadDeps.failed).toBeFalse();
    expect(evaluation.deadDeps.triggeredBy).toBe("none");
  });

  it("evaluates dead deps with both triggers", () => {
    const evaluation = evaluateDependencyPolicy(fixtureResult, {
      failOnVulns: false,
      severityThreshold: "LOW",
      failOnOutdated: false,
      outdatedThreshold: "patch",
      failOnDeadDeps: true,
      failOnDeadDepsCount: 2,
    });

    expect(evaluation.deadDeps.failed).toBeTrue();
    expect(evaluation.deadDeps.triggeredBy).toBe("both");
  });

  it("does not fail when no dead deps exist", () => {
    const noDeadResult: DepScannerResult = {
      ...fixtureResult,
      summary: {
        ...fixtureResult.summary,
        deadDependencies: 0,
        topDead: [],
      },
    };
    const evaluation = evaluateDependencyPolicy(noDeadResult, {
      failOnVulns: false,
      severityThreshold: "LOW",
      failOnOutdated: false,
      outdatedThreshold: "patch",
      failOnDeadDeps: true,
    });

    expect(evaluation.deadDeps.failed).toBeFalse();
    expect(evaluation.deadDeps.triggeredBy).toBe("none");
  });

  it("correctly populates deadDeps dimension metadata", () => {
    const evaluation = evaluateDependencyPolicy(fixtureResult, {
      failOnVulns: false,
      severityThreshold: "LOW",
      failOnOutdated: false,
      outdatedThreshold: "patch",
      failOnDeadDeps: true,
      failOnDeadDepsCount: 5,
    });

    expect(evaluation.deadDeps.count).toBe(2);
    expect(evaluation.deadDeps.failOnAnyEnabled).toBeTrue();
    expect(evaluation.deadDeps.failOnCount).toBe(5);
    // failOnDeadDeps triggers (2 > 0), but failOnDeadDepsCount doesn't (2 < 5)
    expect(evaluation.deadDeps.triggeredBy).toBe("fail-on-dead-deps");
  });

  it("fails overall when vulns, outdated, AND dead deps all trigger", () => {
    const evaluation = evaluateDependencyPolicy(fixtureResult, {
      failOnVulns: true,
      severityThreshold: "LOW",
      failOnOutdated: true,
      outdatedThreshold: "patch",
      failOnDeadDeps: true,
    });

    expect(evaluation.failed).toBeTrue();
    expect(evaluation.vulnerabilities.failed).toBeTrue();
    expect(evaluation.outdated.failed).toBeTrue();
    expect(evaluation.deadDeps.failed).toBeTrue();
  });

  it("does not fail dead deps dimension when only failOnDeadDepsCount exceeds", () => {
    const evaluation = evaluateDependencyPolicy(fixtureResult, {
      failOnVulns: false,
      severityThreshold: "LOW",
      failOnOutdated: false,
      outdatedThreshold: "patch",
      failOnDeadDeps: false,
      failOnDeadDepsCount: 100,
    });

    expect(evaluation.deadDeps.failed).toBeFalse();
    expect(evaluation.deadDeps.count).toBe(2);
  });
});
