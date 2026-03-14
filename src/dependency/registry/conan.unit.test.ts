import { mock } from "bun:test";
import { beforeEach, describe, expect, it } from "vitest";

// Mock the http utils at the module level
const mockFetchJson = mock();
mock.module("../utils/http.js", () => ({
  fetchJson: mockFetchJson,
  fetchWithRetry: mock(),
}));

// Import after mocking
const { conanRegistryClient } = await import("./conan.js");

beforeEach(() => {
  mockFetchJson.mockReset();
});

describe("conanRegistryClient", () => {
  it("has correct ecosystem", () => {
    expect(conanRegistryClient.ecosystem).toBe("conan");
  });

  describe("getLatestVersion", () => {
    it("returns latest version from search results", async () => {
      mockFetchJson.mockResolvedValueOnce({
        results: ["1.2.0", "1.3.1", "1.3.0"],
      });

      const version = await conanRegistryClient.getLatestVersion("zlib");
      expect(version).toBe("1.3.1");
    });

    it("returns undefined when no results", async () => {
      mockFetchJson.mockResolvedValueOnce({ results: [] });

      const version = await conanRegistryClient.getLatestVersion("nonexistent");
      expect(version).toBeUndefined();
    });

    it("returns undefined on fetch failure", async () => {
      mockFetchJson.mockResolvedValueOnce(undefined);

      const version = await conanRegistryClient.getLatestVersion("zlib");
      expect(version).toBeUndefined();
    });

    it("returns undefined on exception", async () => {
      mockFetchJson.mockRejectedValueOnce(new Error("Network error"));

      const version = await conanRegistryClient.getLatestVersion("zlib");
      expect(version).toBeUndefined();
    });
  });

  describe("getLatestVersions", () => {
    it("fetches versions for multiple packages", async () => {
      mockFetchJson
        .mockResolvedValueOnce({ results: ["1.3.1"] })
        .mockResolvedValueOnce({ results: ["1.84.0"] });

      const versions = await conanRegistryClient.getLatestVersions([
        "zlib",
        "boost",
      ]);
      expect(versions.get("zlib")).toBe("1.3.1");
      expect(versions.get("boost")).toBe("1.84.0");
    });

    it("skips packages that fail", async () => {
      mockFetchJson
        .mockResolvedValueOnce({ results: ["1.3.1"] })
        .mockResolvedValueOnce(undefined);

      const versions = await conanRegistryClient.getLatestVersions([
        "zlib",
        "bad",
      ]);
      expect(versions.get("zlib")).toBe("1.3.1");
      expect(versions.has("bad")).toBe(false);
    });
  });
});
