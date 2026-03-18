import { describe, expect, it } from "bun:test";
import { getVersion } from "../cli";
import { BUILD_SHA, BUILD_UPDATE_URL } from "./build-version";

describe("build-version", () => {
  it("exports a non-empty BUILD_SHA string", () => {
    expect(typeof BUILD_SHA).toBe("string");
    expect(BUILD_SHA.length).toBeGreaterThan(0);
  });

  it("exports a BUILD_UPDATE_URL string", () => {
    expect(typeof BUILD_UPDATE_URL).toBe("string");
  });

  it("BUILD_UPDATE_URL is either empty or a valid https URL", () => {
    if (BUILD_UPDATE_URL.length > 0) {
      expect(BUILD_UPDATE_URL).toMatch(/^https?:\/\//);
    }
  });
});

describe("getVersion", () => {
  it("returns BUILD_SHA", () => {
    expect(getVersion()).toBe(BUILD_SHA);
  });

  it("returns a non-empty string", () => {
    expect(getVersion().length).toBeGreaterThan(0);
  });
});
