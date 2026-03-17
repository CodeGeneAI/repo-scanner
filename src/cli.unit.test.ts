import { describe, expect, it } from "bun:test";
import { parseArgs } from "./cli";

describe("parseArgs", () => {
  it("parses default values", () => {
    const result = parseArgs(["bun", "repo-scanner"]);

    expect(result.dryCheck).toBeFalse();
    expect(result.deps).toBeFalse();
    expect(result.depsDebug).toBeFalse();
    expect(result.skipSecurity).toBeFalse();
    expect(result.skipUsage).toBeFalse();
    expect(result.format).toBe("table");
    expect(result.componentGrouping).toBe("default");
    expect(result.failOnVulns).toBeFalse();
    expect(result.failOnVulnsCount).toBeUndefined();
    expect(result.severityThreshold).toBe("LOW");
    expect(result.failOnOutdated).toBeFalse();
    expect(result.failOnOutdatedCount).toBeUndefined();
    expect(result.outdatedThreshold).toBe("patch");
    expect(result.extensions).toEqual([]);
    expect(result.minUniqueRatio).toBe(0.1);
    expect(result.maxLiteralRatio).toBe(0.5);
    expect(result.ignoreBarrelExports).toBeTrue();
  });

  it("parses dependency options", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--deps",
      "--deps-debug",
      "--ecosystems",
      "npm,pypi",
      "--no-usage",
      "--no-security",
      "--concurrency",
      "8",
      "--component-grouping",
      "workspace-package",
      "--fail-on-vulns",
      "--fail-on-vulns-count",
      "3",
      "--severity-threshold",
      "critical",
      "--fail-on-outdated",
      "--fail-on-outdated-count",
      "2",
      "--outdated-threshold",
      "minor",
    ]);

    expect(result.deps).toBeTrue();
    expect(result.depsDebug).toBeTrue();
    expect(result.ecosystems).toEqual(["npm", "pypi"]);
    expect(result.skipUsage).toBeTrue();
    expect(result.skipSecurity).toBeTrue();
    expect(result.concurrency).toBe(8);
    expect(result.componentGrouping).toBe("workspace-package");
    expect(result.failOnVulns).toBeTrue();
    expect(result.failOnVulnsCount).toBe(3);
    expect(result.severityThreshold).toBe("CRITICAL");
    expect(result.failOnOutdated).toBeTrue();
    expect(result.failOnOutdatedCount).toBe(2);
    expect(result.outdatedThreshold).toBe("minor");
  });

  it("deduplicates ecosystems while preserving input order", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--deps",
      "--ecosystems",
      "npm,pypi,npm,go,pypi",
    ]);

    expect(result.ecosystems).toEqual(["npm", "pypi", "go"]);
  });

  it("parses dry-check compatibility flags", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--dry-check",
      "--extensions",
      "ts,py",
      "--min-unique-ratio",
      "0.2",
      "--max-literal-ratio",
      "0.8",
      "--no-barrel-filter",
    ]);

    expect(result.dryCheck).toBeTrue();
    expect(result.extensions).toEqual([".ts", ".py"]);
    expect(result.minUniqueRatio).toBe(0.2);
    expect(result.maxLiteralRatio).toBe(0.8);
    expect(result.ignoreBarrelExports).toBeFalse();
  });
});
