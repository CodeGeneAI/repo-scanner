import { describe, expect, it } from "vitest";
import { extractBaseVersion, getUpdateType, parseSemver } from "./semver";

describe("parseSemver", () => {
  it("parses standard semver", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("parses with v prefix", () => {
    expect(parseSemver("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("parses with caret prefix", () => {
    expect(parseSemver("^1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("parses with tilde prefix", () => {
    expect(parseSemver("~1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("parses with prerelease", () => {
    const result = parseSemver("1.0.0-beta.1");
    expect(result).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: "beta.1",
    });
  });

  it("returns undefined for non-semver", () => {
    expect(parseSemver("latest")).toBeUndefined();
    expect(parseSemver("*")).toBeUndefined();
    expect(parseSemver("workspace:*")).toBeUndefined();
  });

  it("handles >= prefix", () => {
    expect(parseSemver(">=1.0.0")).toEqual({ major: 1, minor: 0, patch: 0 });
  });
});

describe("getUpdateType", () => {
  it("returns up-to-date for same versions", () => {
    expect(getUpdateType("1.2.3", "1.2.3")).toBe("up-to-date");
  });

  it("returns patch for patch bump", () => {
    expect(getUpdateType("1.2.3", "1.2.5")).toBe("patch");
  });

  it("returns minor for minor bump", () => {
    expect(getUpdateType("1.2.3", "1.3.0")).toBe("minor");
  });

  it("returns major for major bump", () => {
    expect(getUpdateType("1.2.3", "2.0.0")).toBe("major");
  });

  it("returns unknown for non-semver", () => {
    expect(getUpdateType("latest", "1.0.0")).toBe("unknown");
    expect(getUpdateType("1.0.0", "latest")).toBe("unknown");
  });

  it("handles v prefix in both", () => {
    expect(getUpdateType("v1.0.0", "v1.0.1")).toBe("patch");
  });

  it("returns major when versions differ in major component", () => {
    // getUpdateType compares fields, not direction
    expect(getUpdateType("2.0.0", "1.0.0")).toBe("major");
  });
});

describe("extractBaseVersion", () => {
  it("strips caret", () => {
    expect(extractBaseVersion("^1.2.3")).toBe("1.2.3");
  });

  it("strips tilde", () => {
    expect(extractBaseVersion("~1.2.3")).toBe("1.2.3");
  });

  it("strips >= prefix", () => {
    expect(extractBaseVersion(">=1.0.0")).toBe("1.0.0");
  });

  it("handles plain version", () => {
    expect(extractBaseVersion("1.2.3")).toBe("1.2.3");
  });

  it("strips v prefix", () => {
    expect(extractBaseVersion("v1.2.3")).toBe("1.2.3");
  });

  it("handles range with space", () => {
    expect(extractBaseVersion(">=1.0.0 <2.0.0")).toBe("1.0.0");
  });
});
