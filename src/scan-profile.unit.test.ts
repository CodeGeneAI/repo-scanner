import { describe, expect, it } from "bun:test";
import { parseArgs } from "./cli";
import { resolveScanProfile } from "./scan-profile";

describe("resolveScanProfile", () => {
  it("defaults to core sections and core detector set", () => {
    const options = parseArgs(["bun", "repo-scanner"]);
    const profile = resolveScanProfile(options);

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([
      "architecture",
      "inventory",
      "external-services",
      "build-and-test",
    ]);
    expect(profile.enabledDetectorIds).toBeDefined();
    expect(profile.enabledDetectorIds).toContain("monorepo");
    expect(profile.enabledDetectorIds).toContain("language");
    expect(profile.enabledDetectorIds).toContain("external-services");
    expect(profile.enabledDetectorIds).toContain("ci");
    expect(profile.enabledDetectorIds).not.toContain("api-surface");
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
    });
    expect(fromFullScan).toEqual(fromAllDetectors);
  });

  it("adds optional detector IDs for explicit opt-ins", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--inventory",
        "--solid",
        "--db-schema",
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

  it("adds env detector when --diff-env-check is used", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--diff", "HEAD", "--diff-env-check"]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.enabledDetectorIds).toContain("env");
  });

  it("runs env-only mode when --env is set without section flags", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--env"]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(["env"]);
  });

  it("runs explicit detector-only mode for optional detector flags", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--runtime",
        "--todo",
        "--code-duplication",
      ]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(
      expect.arrayContaining(["runtime", "todo", "code-duplication"]),
    );
  });

  it("adds env detector to section profile when combined with section flags", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--inventory", "--env"]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual(["inventory"]);
    expect(profile.enabledDetectorIds).toContain("env");
    expect(profile.enabledDetectorIds).toContain("language");
  });

  it("adds optional detector flags to section profiles", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--inventory",
        "--naming-convention",
        "--runtime",
        "--large-file",
        "--todo",
        "--dead-export",
        "--code-duplication",
        "--complexity-hotspots",
      ]),
    );

    expect(profile.enabledDetectorIds).toContain("naming-convention");
    expect(profile.enabledDetectorIds).toContain("runtime");
    expect(profile.enabledDetectorIds).toContain("large-file");
    expect(profile.enabledDetectorIds).toContain("todo");
    expect(profile.enabledDetectorIds).toContain("dead-export");
    expect(profile.enabledDetectorIds).toContain("code-duplication");
    expect(profile.enabledDetectorIds).toContain("complexity-hotspots");
  });

  it("runs detector-only mode for newly added core detector flags", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--language",
        "--framework",
        "--monorepo",
        "--dependency-manager",
        "--ci",
        "--containerization",
        "--iac-detector",
        "--testing-detector",
        "--datastore",
        "--linting-detector",
        "--build",
        "--repo-tools",
        "--cross-package-deps",
        "--code-quality",
        "--deployment-platform",
        "--external-services-detector",
        "--api-surface",
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
});
