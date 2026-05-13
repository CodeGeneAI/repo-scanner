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
        "complexity-hotspots,large-file",
      ]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.enabledDetectorIds).toContain("complexity-hotspots");
    expect(profile.enabledDetectorIds).toContain("large-file");
  });

  it("runs todo-only mode via --detectors without section flags", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--detectors", "todo"]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(["todo"]);
    expect(profile.explicitDetectorOutputIds).toEqual(["todo"]);
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
        "language,todo,external-services",
      ]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual([]);
    expect(profile.enabledDetectorIds).toEqual(
      expect.arrayContaining(["language", "todo", "external-services"]),
    );
  });

  it("adds todo detector to section profile when combined with section flags", () => {
    const profile = resolveScanProfile(
      parseArgs(["bun", "repo-scanner", "--inventory", "--detectors", "todo"]),
    );

    expect(profile.allDetectors).toBeFalse();
    expect(profile.selectedSections).toEqual(["inventory"]);
    expect(profile.enabledDetectorIds).toContain("todo");
    expect(profile.enabledDetectorIds).toContain("language");
  });

  it("adds optional detector IDs to section profiles from --detectors", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--inventory",
        "--detectors",
        "runtime,large-file,todo,complexity-hotspots",
      ]),
    );

    expect(profile.enabledDetectorIds).toContain("runtime");
    expect(profile.enabledDetectorIds).toContain("large-file");
    expect(profile.enabledDetectorIds).toContain("todo");
    expect(profile.enabledDetectorIds).toContain("complexity-hotspots");
  });

  it("runs detector-only mode for core detector IDs via --detectors", () => {
    const profile = resolveScanProfile(
      parseArgs([
        "bun",
        "repo-scanner",
        "--detectors",
        "language,framework,monorepo,dependency-manager,ci,containerization,iac,testing,datastore,linting,build,repo-tools,code-quality,deployment-platform,external-services",
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
        "code-quality",
        "deployment-platform",
        "external-services",
      ]),
    );
  });

  it("does not add todo detector by default", () => {
    const profile = resolveScanProfile(parseArgs(["bun", "repo-scanner"]));

    expect(profile.enabledDetectorIds).not.toContain("todo");
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
});
