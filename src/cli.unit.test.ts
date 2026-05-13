import { describe, expect, it } from "bun:test";
import { CliParseError, parseArgs } from "./cli";

describe("parseArgs", () => {
  it("parses default values", () => {
    const result = parseArgs(["bun", "repo-scanner"]);

    expect(result.dryCheck).toBeFalse();
    expect(result.format).toBe("table");
    expect(result.extensions).toEqual([]);
    expect(result.minUniqueRatio).toBe(0.1);
    expect(result.maxLiteralRatio).toBe(0.5);
    expect(result.ignoreBarrelExports).toBeTrue();
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

  it("parses --diff --cached for staged files", () => {
    const result = parseArgs(["bun", "repo-scanner", "--diff", "--cached"]);
    expect(result.diff).toBe("--cached");
  });

  it("parses --diff --staged for staged files", () => {
    const result = parseArgs(["bun", "repo-scanner", "--diff", "--staged"]);
    expect(result.diff).toBe("--staged");
  });

  it("rejects unknown flags as --diff value", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--diff", "--unknown-flag"]),
    ).toThrow(CliParseError);
  });

  it("parses --diff --cached with --diff-dry-check and threshold", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--diff",
      "--cached",
      "--diff-dry-check",
      "--fail-on-new-duplication-pct",
      "20",
    ]);
    expect(result.diff).toBe("--cached");
    expect(result.diffDryCheck).toBeTrue();
    expect(result.failOnNewDuplicationPct).toBe(20);
  });

  it("parses --diff --staged with --diff-env-check", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--diff",
      "--staged",
      "--diff-env-check",
    ]);
    expect(result.diff).toBe("--staged");
    expect(result.diffEnvCheck).toBeTrue();
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
      "--diff",
      "HEAD",
      "--fail-on-new-duplication-pct",
      "15",
    ]);
    expect(result.failOnNewDuplicationPct).toBe(15);
    expect(result.diffDryCheck).toBeTrue();
  });

  it("parses --fail-on-new-duplication-pct with zero", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--diff",
      "HEAD",
      "--fail-on-new-duplication-pct",
      "0",
    ]);
    expect(result.failOnNewDuplicationPct).toBe(0);
    expect(result.diffDryCheck).toBeTrue();
  });

  it("parses --fail-on-new-duplication-pct with decimal value", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--diff",
      "HEAD",
      "--fail-on-new-duplication-pct",
      "5.5",
    ]);
    expect(result.failOnNewDuplicationPct).toBe(5.5);
    expect(result.diffDryCheck).toBeTrue();
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
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--diff",
      "HEAD",
      "--fail-on-new-env-vars",
    ]);
    expect(result.failOnNewEnvVars).toBeTrue();
    expect(result.diffEnvCheck).toBeTrue();
  });

  it("throws CliParseError for diff-only flags without --diff", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--diff-dry-check"]),
    ).toThrow(CliParseError);
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--diff-dry-include-tests"]),
    ).toThrow(CliParseError);
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--diff-env-check"]),
    ).toThrow(CliParseError);
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--fail-on-new-duplication-pct", "1"]),
    ).toThrow(CliParseError);
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--fail-on-new-env-vars"]),
    ).toThrow(CliParseError);
  });

  it("throws CliParseError for --diff-dry-include-tests without --diff-dry-check", () => {
    expect(() =>
      parseArgs([
        "bun",
        "repo-scanner",
        "--diff",
        "HEAD",
        "--diff-dry-include-tests",
      ]),
    ).toThrow(CliParseError);
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
