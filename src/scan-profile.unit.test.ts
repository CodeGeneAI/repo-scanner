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
});
