import { describe, expect, it } from "bun:test";
import { parseArgs } from "./cli";

describe("parseArgs", () => {
  it("parses default values", () => {
    const result = parseArgs(["bun", "repo-scanner"]);

    expect(result.format).toBe("table");
    expect(result.scanArchitecture).toBeFalse();
    expect(result.scanInventory).toBeFalse();
    expect(result.allDetectors).toBeFalse();
    expect(result.showDetectors).toBeFalse();
    expect(result.completionShell).toBeUndefined();
    expect(result.completionInstall).toBeFalse();
    expect(result.completionUninstall).toBeFalse();
    expect(result.detectorsSchema).toBeFalse();
    expect(result.detectorSelectionWarnings).toEqual([]);
    expect(result.languageDetector).toBeFalse();
    expect(result.frameworkDetector).toBeFalse();
    expect(result.monorepoDetector).toBeFalse();
  });

  it("parses section profile flags", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--architecture",
      "--inventory",
    ]);

    expect(result.scanArchitecture).toBeTrue();
    expect(result.scanInventory).toBeTrue();
    expect(result.allDetectors).toBeFalse();
  });

  it("parses --all-detectors", () => {
    const result = parseArgs(["bun", "repo-scanner", "--all-detectors"]);
    expect(result.allDetectors).toBeTrue();
  });

  it("parses --detectors with multiple detector ids", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--detectors",
      "language,framework,monorepo",
    ]);

    expect(result.languageDetector).toBeTrue();
    expect(result.frameworkDetector).toBeTrue();
    expect(result.monorepoDetector).toBeTrue();
  });

  it("emits warnings for duplicate detector selection", () => {
    const result = parseArgs([
      "bun",
      "repo-scanner",
      "--detectors",
      "language,framework,language",
    ]);

    expect(result.detectorSelectionWarnings.length).toBeGreaterThan(0);
    expect(result.detectorSelectionWarnings.join(" ")).toContain("language");
  });

  it("rejects invalid detector id in --detectors", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--detectors", "env,not-real"]),
    ).toThrow(/invalid detector ids/i);
  });

  it("rejects removed preset selectors in --detectors", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--detectors", "@inventory"]),
    ).toThrow(/invalid detector ids/i);
  });

  it("rejects removed legacy detector ids in --detectors", () => {
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--detectors", "ci"]),
    ).toThrow(/invalid detector ids/i);
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--detectors", "todo"]),
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
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--external-services"]),
    ).toThrow(/unknown option/i);
    expect(() => parseArgs(["bun", "repo-scanner", "--vcs"])).toThrow(
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

  it("rejects --topology flag", () => {
    expect(() => parseArgs(["bun", "repo-scanner", "--topology"])).toThrow(
      /unknown option "--topology"/,
    );
  });
});
