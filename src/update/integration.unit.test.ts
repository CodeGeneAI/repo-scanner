import { afterEach, describe, expect, it } from "bun:test";
import os from "os";
import path from "path";
import { BUILD_SHA, BUILD_UPDATE_URL } from "./build-version";
import { getCacheFilePath, isUpdateAvailable } from "./check";
import { verifyChecksum } from "./install";

// ---------------------------------------------------------------------------
// Build constants
// ---------------------------------------------------------------------------

describe("build constants (integration)", () => {
  it("BUILD_SHA is a non-empty string", () => {
    expect(typeof BUILD_SHA).toBe("string");
    expect(BUILD_SHA.length).toBeGreaterThan(0);
  });

  it("BUILD_UPDATE_URL is either empty or a valid URL", () => {
    if (BUILD_UPDATE_URL.length > 0) {
      expect(() => new URL(BUILD_UPDATE_URL)).not.toThrow();
    }
  });

  it("dev builds never trigger auto-update", () => {
    // This protects against local dev builds accidentally being told to update.
    const anySha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(isUpdateAvailable("dev", anySha)).toBe(false);
    expect(isUpdateAvailable(anySha, "dev")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cache path safety
// ---------------------------------------------------------------------------

describe("getCacheFilePath (integration)", () => {
  const origXDG = process.env.XDG_CACHE_HOME;

  afterEach(() => {
    if (origXDG === undefined) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = origXDG;
    }
  });

  it("returns a path under the home directory or XDG_CACHE_HOME", () => {
    const filePath = getCacheFilePath();
    const homeDir = os.homedir();
    const xdgCache = process.env.XDG_CACHE_HOME;

    const expectedBase = xdgCache ?? path.join(homeDir, ".cache");
    expect(filePath.startsWith(expectedBase)).toBe(true);
  });

  it("uses XDG_CACHE_HOME when set", () => {
    process.env.XDG_CACHE_HOME = "/tmp/custom-xdg-cache";
    expect(getCacheFilePath().startsWith("/tmp/custom-xdg-cache")).toBe(true);
  });

  it("falls back to ~/.cache when XDG_CACHE_HOME is unset", () => {
    delete process.env.XDG_CACHE_HOME;
    const expected = path.join(os.homedir(), ".cache");
    expect(getCacheFilePath().startsWith(expected)).toBe(true);
  });

  it("returns a path ending with the expected filename", () => {
    const filePath = getCacheFilePath();
    expect(filePath).toContain("repo-scanner");
    expect(filePath.endsWith("update-check.json")).toBe(true);
  });

  it("does not contain path traversal sequences", () => {
    const filePath = getCacheFilePath();
    expect(filePath).not.toContain("..");
  });
});

// ---------------------------------------------------------------------------
// Checksum determinism
// ---------------------------------------------------------------------------

describe("verifyChecksum (integration)", () => {
  it("produces consistent results for the same input", () => {
    const data = new TextEncoder().encode("consistent input for hashing");
    const hasher1 = new Bun.CryptoHasher("sha256");
    hasher1.update(data);
    const hex1 = hasher1.digest("hex");

    const hasher2 = new Bun.CryptoHasher("sha256");
    hasher2.update(data);
    const hex2 = hasher2.digest("hex");

    expect(hex1).toBe(hex2);
    expect(() => verifyChecksum(data, hex1)).not.toThrow();
  });

  it("rejects a zero-length checksum", () => {
    const data = new TextEncoder().encode("data");
    expect(() => verifyChecksum(data, "")).toThrow();
  });
});
