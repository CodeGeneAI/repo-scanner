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
    topOutdated: [],
    topVulnerable: [],
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

  it("evaluates threshold and count policy triggers", () => {
    const evaluation = evaluateDependencyPolicy(fixtureResult, {
      failOnVulns: true,
      failOnVulnsCount: 1,
      severityThreshold: "HIGH",
      failOnOutdated: false,
      failOnOutdatedCount: 2,
      outdatedThreshold: "minor",
    });

    expect(evaluation.failed).toBeTrue();
    expect(evaluation.vulnerabilities.failed).toBeTrue();
    expect(evaluation.vulnerabilities.triggeredBy).toBe("both");
    expect(evaluation.outdated.failed).toBeTrue();
    expect(evaluation.outdated.triggeredBy).toBe("fail-on-outdated-count");
  });
});
