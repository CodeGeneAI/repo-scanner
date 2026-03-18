import { describe, expect, it } from "bun:test";
import { CliParseError, parseArgs } from "./cli";

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
    expect(result.failOnDeadDeps).toBeFalse();
    expect(result.failOnDeadDepsCount).toBeUndefined();
    expect(result.includeDevDeadDeps).toBeFalse();
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

  it("parses dead dependency flags", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--fail-on-dead-deps",
      "--fail-on-dead-deps-count",
      "5",
      "--include-dev-dead-deps",
    ]);

    expect(result.failOnDeadDeps).toBeTrue();
    expect(result.failOnDeadDepsCount).toBe(5);
    expect(result.includeDevDeadDeps).toBeTrue();
  });

  it("throws CliParseError for --fail-on-dead-deps-count without value", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--fail-on-dead-deps-count"]),
    ).toThrow(CliParseError);
  });

  it("throws CliParseError for --fail-on-dead-deps-count with invalid value", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--fail-on-dead-deps-count", "abc"]),
    ).toThrow(CliParseError);
  });

  it("throws CliParseError for --fail-on-dead-deps-count with negative value", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--fail-on-dead-deps-count", "-1"]),
    ).toThrow(CliParseError);
  });

  it("parses --fail-on-dead-deps-count with decimal value as truncated integer", () => {
    // parseInt("1.5") returns 1, which is a valid positive integer
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--fail-on-dead-deps-count",
      "1.5",
    ]);
    expect(result.failOnDeadDepsCount).toBe(1);
  });

  it("parses --fail-on-dead-deps-count independently without --fail-on-dead-deps", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--fail-on-dead-deps-count",
      "10",
    ]);
    expect(result.failOnDeadDeps).toBeFalse();
    expect(result.failOnDeadDepsCount).toBe(10);
  });

  it("parses --include-dev-dead-deps independently without other dead deps flags", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--include-dev-dead-deps",
    ]);
    expect(result.includeDevDeadDeps).toBeTrue();
    expect(result.failOnDeadDeps).toBeFalse();
    expect(result.failOnDeadDepsCount).toBeUndefined();
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
