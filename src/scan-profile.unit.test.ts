import { describe, expect, it } from "bun:test";
import { parseArgs } from "./cli";
import { resolveScanProfile } from "./scan-profile";

describe("resolveScanProfile", () => {
  it("defaults to no selected sections or detectors", () => {
    const options = parseArgs(["bun", "repo-scanner"]);
    const profile = resolveScanProfile(options);

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual([]);
  });

  it("uses explicit section flags when provided", () => {
    const options = parseArgs([
      "bun",
      "repo-scanner",
      "--architecture",
      "--build-and-test",
    ]);
    const profile = resolveScanProfile(options);

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([
      "architecture",
      "build-and-test",
    ]);
    expect(profile.enabledDetectorIds).toContain("monorepo");
    expect(profile.enabledDetectorIds).toContain("cross-package-deps");
    expect(profile.enabledDetectorIds).toContain("build");
    expect(profile.enabledDetectorIds).toContain("ci");
    expect(profile.enabledDetectorIds).not.toContain("framework");
    expect(profile.enabledDetectorIds).not.toContain("external-services");
  });

  it("treats --full-scan as equivalent to --all-detectors", () => {
    const fromAllDetectors = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--all-detectors"]),
    );
    const fromFullScan = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--full-scan"]),
    );

    expect(fromAllDetectors).toEqual({
      allDetectors: true,
      selectedSections: [],
      explicitDetectorOutputIds: [],
    });
    expect(fromFullScan).toEqual(fromAllDetectors);
  });

  it("adds optional detector IDs for explicit opt-ins", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--inventory",
        "--detectors",
        "solid-health,db-schema",
      ]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.enabledDetectorIds).toContain("solid-health");
    expect(profile.enabledDetectorIds).toContain("db-schema");
  });

  it("adds topology-required detectors when section flags narrow report output", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--inventory",
        "--topology-diagrams",
        "api-topology,erd",
      ]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual(["inventory"]);
    expect(profile.enabledDetectorIds).toContain("monorepo");
    expect(profile.enabledDetectorIds).toContain("api-surface");
    expect(profile.enabledDetectorIds).toContain("db-schema");
  });

  it("adds call-graph detector when call-graph topology is requested", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--topology-diagrams", "call-graph"]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.enabledDetectorIds).toContain("call-graph");
  });

  it("runs topology-only profiles without default section detector execution", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--topology-diagrams", "erd"]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(["db-schema"]);
    expect(profile.explicitDetectorOutputIds).toEqual([]);
  });

  it("runs env-only mode via --detectors without section flags", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--detectors", "env"]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(["env"]);
    expect(profile.explicitDetectorOutputIds).toEqual(["env"]);
  });

  it("runs explicit detector-only mode via --detectors list", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--detectors",
        "runtime,todo,large-file",
      ]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(
      expect.arrayContaining(["runtime", "todo", "large-file"]),
    );
    expect(profile.explicitDetectorOutputIds).toEqual(
      expect.arrayContaining(["runtime", "todo", "large-file"]),
    );
  });

  it("runs explicit detector-only mode for --detectors selector", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--detectors",
        "language,env,todo,external-services",
      ]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(
      expect.arrayContaining(["language", "env", "todo", "external-services"]),
    );
  });

  it("adds env detector to section profile when combined with section flags", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--inventory", "--detectors", "env"]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual(["inventory"]);
    expect(profile.enabledDetectorIds).toContain("env");
    expect(profile.enabledDetectorIds).toContain("language");
  });

  it("adds optional detector IDs to section profiles from --detectors", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--inventory",
        "--detectors",
        "naming-convention,runtime,large-file,todo,dead-export,complexity-hotspots",
      ]),
    );

    expect(profile.enabledDetectorIds).toContain("naming-convention");
    expect(profile.enabledDetectorIds).toContain("runtime");
    expect(profile.enabledDetectorIds).toContain("large-file");
    expect(profile.enabledDetectorIds).toContain("todo");
    expect(profile.enabledDetectorIds).toContain("dead-export");
    expect(profile.enabledDetectorIds).toContain("complexity-hotspots");
  });

  it("runs detector-only mode for core detector IDs via --detectors", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--detectors",
        "language,framework,monorepo,dependency-manager,ci,containerization,iac,testing,datastore,linting,build,repo-tools,cross-package-deps,code-quality,deployment-platform,external-services,api-surface",
      ]),
    );

    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(
      expect.arrayContaining([
        "language",
        "framework",
        "monorepo",
        "dependency-manager",
        "ci",
        "containerization",
        "iac",
        "testing",
        "datastore",
        "linting",
        "build",
        "repo-tools",
        "cross-package-deps",
        "code-quality",
        "deployment-platform",
        "external-services",
        "api-surface",
      ]),
    );
  });

  it("does not add env detector by default", () => {
    const profile = resolveScanProfile(parseArgs(["bun", "repo-scanner"]));

    expect(profile.enabledDetectorIds).not.toContain("env");
  });

  it("maps components selector to monorepo execution detector", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--detectors", "components"]),
    );

    expect(profile.selectedSections).toEqual([]);
    expect(profile.explicitDetectorOutputIds).toEqual(["components"]);
    expect(profile.enabledDetectorIds).toEqual(["monorepo"]);
  });

  it("maps language-stats and codebase-size selectors to language detector", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--detectors",
        "language-stats,codebase-size",
      ]),
    );

    expect(profile.selectedSections).toEqual([]);
    expect(profile.explicitDetectorOutputIds).toEqual(
      expect.arrayContaining(["language-stats", "codebase-size"]),
    );
    expect(profile.enabledDetectorIds).toEqual(["language"]);
  });

  it("maps build command selectors to build detector", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--detectors",
        "build-commands,test-commands,lint-commands",
      ]),
    );

    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(["build"]);
    expect(profile.explicitDetectorOutputIds).toEqual(
      expect.arrayContaining([
        "build-commands",
        "test-commands",
        "lint-commands",
      ]),
    );
  });

  it("maps architecture derived selectors to monorepo + cross-package-deps", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--detectors",
        "circular-deps,layer-violations,high-impact-components",
      ]),
    );

    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(
      expect.arrayContaining(["monorepo", "cross-package-deps"]),
    );
    expect(profile.explicitDetectorOutputIds).toEqual(
      expect.arrayContaining([
        "circular-deps",
        "layer-violations",
        "high-impact-components",
      ]),
    );
  });
});
