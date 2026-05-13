import { describe, expect, it } from "bun:test";
import { parseArgs } from "./cli";

describe("parseArgs", () => {
  it("parses default values", () => {
    const result = parseArgs(["bun", "repo-scanner"]);

    expect(result.format).toBe("table");
    expect(result.showDetectors).toBeFalse();
    expect(result.completionShell).toBeUndefined();
    expect(result.completionInstall).toBeFalse();
    expect(result.completionUninstall).toBeFalse();
    expect(result.detectorSelectionWarnings).toEqual([]);
    expect(result.languageDetector).toBeFalse();
    expect(result.frameworkDetector).toBeFalse();
    expect(result.monorepoDetector).toBeFalse();
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
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--detectors", "@quality"]),
    ).toThrow(/invalid detector ids/i);
    expect(() =>
      parseArgs(["bun", "repo-scanner", "--detectors", "@architecture"]),
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

  it("rejects unknown option flags", () => {
    expect(() => parseArgs(["bun", "repo-scanner", "--wat-is-this"])).toThrow(
      /unknown option/i,
    );
  });

  it("rejects removed section-profile flags", () => {
    expect(() => parseArgs(["bun", "repo-scanner", "--architecture"])).toThrow(
      /unknown option/i,
    );
    expect(() => parseArgs(["bun", "repo-scanner", "--inventory"])).toThrow(
      /unknown option/i,
    );
    expect(() => parseArgs(["bun", "repo-scanner", "--all-detectors"])).toThrow(
      /unknown option/i,
    );
    expect(() => parseArgs(["bun", "repo-scanner", "--full-scan"])).toThrow(
      /unknown option/i,
    );
    expect(() => parseArgs(["bun", "repo-scanner", "--schema"])).toThrow(
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

  it("rejects --topology flag", () => {
    expect(() => parseArgs(["bun", "repo-scanner", "--topology"])).toThrow(
      /unknown option "--topology"/,
    );
  });
});
