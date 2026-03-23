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
    expect(result.scanArchitecture).toBeFalse();
    expect(result.scanInventory).toBeFalse();
    expect(result.scanExternalServices).toBeFalse();
    expect(result.scanBuildAndTest).toBeFalse();
    expect(result.allDetectors).toBeFalse();
    expect(result.showDetectors).toBeFalse();
    expect(result.completionShell).toBeUndefined();
    expect(result.completionInstall).toBeFalse();
    expect(result.completionUninstall).toBeFalse();
    expect(result.detectorsSchema).toBeFalse();
    expect(result.detectorSelectionWarnings).toEqual([]);
    expect(result.env).toBeFalse();
    expect(result.namingConvention).toBeFalse();
    expect(result.runtime).toBeFalse();
    expect(result.largeFile).toBeFalse();
    expect(result.todo).toBeFalse();
    expect(result.deadExport).toBeFalse();
    expect(result.codeDuplication).toBeFalse();
    expect(result.complexityHotspots).toBeFalse();
    expect(result.languageDetector).toBeFalse();
    expect(result.languageStatsDetector).toBeFalse();
    expect(result.codebaseSizeDetector).toBeFalse();
    expect(result.frameworkDetector).toBeFalse();
    expect(result.monorepoDetector).toBeFalse();
    expect(result.componentsDetector).toBeFalse();
    expect(result.dependencyManagerDetector).toBeFalse();
    expect(result.ciDetector).toBeFalse();
    expect(result.containerizationDetector).toBeFalse();
    expect(result.iacDetector).toBeFalse();
    expect(result.testingDetector).toBeFalse();
    expect(result.datastoreDetector).toBeFalse();
    expect(result.lintingDetector).toBeFalse();
    expect(result.buildDetector).toBeFalse();
    expect(result.buildCommandsDetector).toBeFalse();
    expect(result.testCommandsDetector).toBeFalse();
    expect(result.lintCommandsDetector).toBeFalse();
    expect(result.repoToolsDetector).toBeFalse();
    expect(result.crossPackageDepsDetector).toBeFalse();
    expect(result.circularDepsDetector).toBeFalse();
    expect(result.layerViolationsDetector).toBeFalse();
    expect(result.highImpactComponentsDetector).toBeFalse();
    expect(result.codeQualityDetector).toBeFalse();
    expect(result.deploymentPlatformDetector).toBeFalse();
    expect(result.externalServicesDetector).toBeFalse();
    expect(result.apiSurfaceDetector).toBeFalse();
  });

  it("parses section profile flags", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--architecture",
      "--inventory",
      "--external-services",
      "--build-and-test",
    ]);

    expect(result.scanArchitecture).toBeTrue();
    expect(result.scanInventory).toBeTrue();
    expect(result.scanExternalServices).toBeTrue();
    expect(result.scanBuildAndTest).toBeTrue();
    expect(result.allDetectors).toBeFalse();
  });

  it("parses --all-detectors", () => {
    const result = parseArgs(["bun", "repo-scanner", "--all-detectors"]);
    expect(result.allDetectors).toBeTrue();
  });

  it("parses --solid legacy convenience flag", () => {
    const result = parseArgs(["bun", "repo-scanner", "--solid"]);
    expect(result.solid).toBeTrue();
  });

  it("parses --detectors with multiple detector ids", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--detectors",
      "env,language,todo,external-services,solid-health,vcs",
    ]);

    expect(result.env).toBeTrue();
    expect(result.languageDetector).toBeTrue();
    expect(result.todo).toBeTrue();
    expect(result.externalServicesDetector).toBeTrue();
    expect(result.solid).toBeTrue();
    expect(result.vcs).toBeTrue();
  });

  it("parses expanded split selectors", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--detectors",
      "components,language-stats,codebase-size,build-commands,test-commands,lint-commands,circular-deps,layer-violations,high-impact-components",
    ]);

    expect(result.componentsDetector).toBeTrue();
    expect(result.languageStatsDetector).toBeTrue();
    expect(result.codebaseSizeDetector).toBeTrue();
    expect(result.buildCommandsDetector).toBeTrue();
    expect(result.testCommandsDetector).toBeTrue();
    expect(result.lintCommandsDetector).toBeTrue();
    expect(result.circularDepsDetector).toBeTrue();
    expect(result.layerViolationsDetector).toBeTrue();
    expect(result.highImpactComponentsDetector).toBeTrue();
  });

  it("expands detector presets in --detectors", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--detectors",
      "@inventory,@quality",
    ]);

    expect(result.languageDetector).toBeTrue();
    expect(result.frameworkDetector).toBeTrue();
    expect(result.codeQualityDetector).toBeTrue();
    expect(result.codeDuplication).toBeTrue();
  });

  it("emits warnings for duplicate detector selection via mixed presets", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--detectors",
      "@inventory,language,@quality,code-quality",
    ]);

    expect(result.detectorSelectionWarnings.length).toBeGreaterThan(0);
    expect(result.detectorSelectionWarnings.join(" ")).toContain("language");
    expect(result.detectorSelectionWarnings.join(" ")).toContain(
      "code-quality",
    );
  });

  it("rejects invalid detector id in --detectors", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--detectors", "env,not-real"]),
    ).toThrow(/invalid detector ids/i);
  });

  it("supports short aliases for common flags", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "-p",
      "/tmp/repo",
      "-f",
      "json",
    ]);

    expect(result.path).toBe("/tmp/repo");
    expect(result.format).toBe("json");
  });

  it("parses --full-scan as an alias for --all-detectors", () => {
    const allDetectors = parseArgs(["bun", "repo-scanner", "--all-detectors"]);
    const fullScan = parseArgs(["bun", "repo-scanner", "--full-scan"]);

    expect(fullScan.allDetectors).toBeTrue();
    expect(fullScan.allDetectors).toBe(allDetectors.allDetectors);
  });

  it("rejects unknown option flags", () => {
    expect(() => parseArgs(["bun", "repo-scanner", "--wat-is-this"])).toThrow(
      /unknown option/i,
    );
  });

  it("rejects removed legacy detector flags", () => {
    expect(() => parseArgs(["bun", "repo-scanner", "--language"])).toThrow(
      /unknown option/i,
    );
    expect(() => parseArgs(["bun", "repo-scanner", "--env"])).toThrow(
      /unknown option/i,
    );
  });

  it("parses detectors subcommand", () => {
    const result = parseArgs(["bun", "repo-scanner", "detectors"]);
    expect(result.showDetectors).toBeTrue();
  });

  it("parses completion subcommand", () => {
    const result = parseArgs(["bun", "repo-scanner", "completion", "bash"]);
    expect(result.completionShell).toBe("bash");
    expect(result.completionInstall).toBeFalse();
  });

  it("parses completion install subcommand", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "completion",
      "install",
      "fish",
    ]);
    expect(result.completionShell).toBe("fish");
    expect(result.completionInstall).toBeTrue();
    expect(result.completionUninstall).toBeFalse();
  });

  it("parses completion uninstall subcommand", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "completion",
      "uninstall",
      "fish",
    ]);
    expect(result.completionShell).toBe("fish");
    expect(result.completionUninstall).toBeTrue();
  });

  it("parses --schema option", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "detectors",
      "--format",
      "json",
      "--schema",
    ]);
    expect(result.showDetectors).toBeTrue();
    expect(result.detectorsSchema).toBeTrue();
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

  it("parses topology defaults", () => {
    const result = parseArgs(["bun", "repo-scanner"]);
    expect(result.topology).toBeFalse();
    expect(result.topologyDiagrams).toBeUndefined();
    expect(result.topologyOutput).toBeUndefined();
  });

  it("parses --topology flag", () => {
    const result = parseArgs(["bun", "repo-scanner", "--topology"]);
    expect(result.topology).toBeTrue();
  });

  it("parses --topology-diagrams", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--topology-diagrams",
      "architecture,dataflow",
    ]);
    expect(result.topology).toBeTrue();
    expect(result.topologyDiagrams).toEqual(["architecture", "dataflow"]);
  });

  it("rejects invalid --topology-diagrams with erd in valid list", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--topology-diagrams", "invalid-type"]),
    ).toThrow(
      /Use one of architecture,dependency,dataflow,api-topology,erd,call-graph/,
    );
  });

  it("parses --topology-output", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--topology-output",
      "./out.md",
    ]);
    expect(result.topology).toBeTrue();
    expect(result.topologyOutput).toBe("./out.md");
  });

  it("parses --topology-diagrams erd", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--topology-diagrams",
      "erd",
    ]);
    expect(result.topology).toBeTrue();
    expect(result.topologyDiagrams).toEqual(["erd"]);
  });

  it("parses --topology-diagrams with erd and other kinds", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--topology-diagrams",
      "architecture,erd",
    ]);
    expect(result.topology).toBeTrue();
    expect(result.topologyDiagrams).toEqual(["architecture", "erd"]);
  });

  it("parses --diff range", () => {
    const result = parseArgs(["bun", "repo-scanner", "--diff", "HEAD~1"]);
    expect(result.diff).toBe("HEAD~1");
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

  it("defaults diff pre-commit flags to false/undefined", () => {
    const result = parseArgs(["bun", "repo-scanner"]);
    expect(result.diffDryCheck).toBeFalse();
    expect(result.diffDryIncludeTests).toBeFalse();
    expect(result.diffEnvCheck).toBeFalse();
    expect(result.failOnNewDuplicationPct).toBeUndefined();
    expect(result.failOnNewEnvVars).toBeFalse();
  });

  it("parses --diff-dry-check and --diff-env-check flags", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--diff",
      "HEAD",
      "--diff-dry-check",
      "--diff-env-check",
    ]);
    expect(result.diffDryCheck).toBeTrue();
    expect(result.diffEnvCheck).toBeTrue();
    expect(result.diffDryIncludeTests).toBeFalse();
  });

  it("parses --diff-dry-include-tests flag", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--diff",
      "HEAD",
      "--diff-dry-check",
      "--diff-dry-include-tests",
    ]);
    expect(result.diffDryCheck).toBeTrue();
    expect(result.diffDryIncludeTests).toBeTrue();
  });

  it("parses --fail-on-new-duplication-pct with integer value", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--fail-on-new-duplication-pct",
      "15",
    ]);
    expect(result.failOnNewDuplicationPct).toBe(15);
  });

  it("parses --fail-on-new-duplication-pct with zero", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--fail-on-new-duplication-pct",
      "0",
    ]);
    expect(result.failOnNewDuplicationPct).toBe(0);
  });

  it("parses --fail-on-new-duplication-pct with decimal value", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--fail-on-new-duplication-pct",
      "5.5",
    ]);
    expect(result.failOnNewDuplicationPct).toBe(5.5);
  });

  it("throws CliParseError for --fail-on-new-duplication-pct without value", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--fail-on-new-duplication-pct"]),
    ).toThrow(CliParseError);
  });

  it("throws CliParseError for --fail-on-new-duplication-pct with negative value", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--fail-on-new-duplication-pct", "-5"]),
    ).toThrow(CliParseError);
  });

  it("throws CliParseError for --fail-on-new-duplication-pct with non-numeric value", () => {
    expect(() =>
      parseArgs([
        "bun",
        "repo-scanner",
        "--fail-on-new-duplication-pct",
        "abc",
      ]),
    ).toThrow(CliParseError);
  });

  it("parses --fail-on-new-env-vars flag", () => {
    const result = parseArgs(["bun", "repo-scanner", "--fail-on-new-env-vars"]);
    expect(result.failOnNewEnvVars).toBeTrue();
  });

  it("parses --diff-dry-check without --diff (no-op scenario)", () => {
    const result = parseArgs(["bun", "repo-scanner", "--diff-dry-check"]);
    expect(result.diffDryCheck).toBeTrue();
    expect(result.diff).toBeUndefined();
  });

  it("parses all diff pre-commit flags together", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--diff",
      "HEAD",
      "--diff-dry-check",
      "--diff-dry-include-tests",
      "--diff-env-check",
      "--fail-on-new-duplication-pct",
      "15",
      "--fail-on-new-env-vars",
    ]);
    expect(result.diff).toBe("HEAD");
    expect(result.diffDryCheck).toBeTrue();
    expect(result.diffDryIncludeTests).toBeTrue();
    expect(result.diffEnvCheck).toBeTrue();
    expect(result.failOnNewDuplicationPct).toBe(15);
    expect(result.failOnNewEnvVars).toBeTrue();
  });
});
