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
      "--inventory",
    ]);
    const profile = resolveScanProfile(options);

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual(["architecture", "inventory"]);
    expect(profile.enabledDetectorIds).toContain("monorepo");
    expect(profile.enabledDetectorIds).toContain("language");
    expect(profile.enabledDetectorIds).toContain("framework");
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

  it("runs explicit detector-only mode via --detectors list", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--detectors", "language,framework"]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(
      expect.arrayContaining(["language", "framework"]),
    );
    expect(profile.explicitDetectorOutputIds).toEqual(
      expect.arrayContaining(["language", "framework"]),
    );
  });

  it("adds detector to section profile when combined with section flags", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--inventory",
        "--detectors",
        "monorepo",
      ]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual(["inventory"]);
    expect(profile.enabledDetectorIds).toContain("monorepo");
    expect(profile.enabledDetectorIds).toContain("language");
  });

  it("runs detector-only mode for all three detector IDs via --detectors", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--detectors",
        "language,framework,monorepo",
      ]),
    );

    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(
      expect.arrayContaining(["language", "framework", "monorepo"]),
    );
  });
});
