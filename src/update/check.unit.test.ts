import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  fetchLatestVersion,
  formatUpdateNotice,
  isCacheStale,
  isUpdateAvailable,
  shouldRunUpdateCheck,
  startBackgroundUpdateCheck,
} from "./check";
import { UpdateFetchError } from "./errors";
import type { UpdateCheckCache, VersionInfo } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LATEST: VersionInfo = {
  sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  bundleUrl:
    "https://cdn.example.com/binaries/releases/aaa/scanner-tools-bundle.tar.gz",
  bundleChecksum:
    "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  publishedAt: "2026-03-18T00:00:00.000Z",
};

const makeFetch =
  (body: unknown, status = 200) =>
  async (_url: string) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response;

const makeNetworkErrorFetch =
  (message: string) =>
  async (_url: string): Promise<Response> => {
    throw new Error(message);
  };

// ---------------------------------------------------------------------------
// fetchLatestVersion
// ---------------------------------------------------------------------------

describe("fetchLatestVersion", () => {
  it("resolves to VersionInfo on valid response", async () => {
    const result = await fetchLatestVersion(
      "https://x",
      100,
      makeFetch(LATEST),
    );
    expect(result).toEqual(LATEST);
  });

  it("throws UpdateFetchError on non-200 response", async () => {
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch({}, 404)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError on network error", async () => {
    await expect(
      fetchLatestVersion(
        "https://x",
        100,
        makeNetworkErrorFetch("network down"),
      ),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError when sha is missing", async () => {
    const bad = { ...LATEST, sha: "" };
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch(bad)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError when bundleUrl is missing", async () => {
    const bad = { ...LATEST, bundleUrl: "" };
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch(bad)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError when bundleChecksum is missing", async () => {
    const bad = { ...LATEST, bundleChecksum: "" };
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch(bad)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError when response is not an object", async () => {
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch("string")),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError when publishedAt is missing", async () => {
    const bad = { ...LATEST, publishedAt: "" };
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch(bad)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError for non-HTTPS URL", async () => {
    await expect(
      fetchLatestVersion(
        "http://insecure.example.com/version.json",
        100,
        makeFetch(LATEST),
      ),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError for invalid URL", async () => {
    await expect(
      fetchLatestVersion("not-a-url", 100, makeFetch(LATEST)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });
});

// ---------------------------------------------------------------------------
// isUpdateAvailable
// ---------------------------------------------------------------------------

describe("isUpdateAvailable", () => {
  it("returns true when SHAs differ", () => {
    expect(isUpdateAvailable("aaa", "bbb")).toBe(true);
  });

  it("returns false when SHAs are identical", () => {
    expect(isUpdateAvailable("aaa", "aaa")).toBe(false);
  });

  it("returns false when currentSha is dev", () => {
    expect(isUpdateAvailable("dev", "bbb")).toBe(false);
  });

  it("returns false when latestSha is dev", () => {
    expect(isUpdateAvailable("aaa", "dev")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCacheStale
// ---------------------------------------------------------------------------

describe("isCacheStale", () => {
  const now = Date.now();
  const freshCache: UpdateCheckCache = {
    checkedAt: now - 3600_000,
    latest: null,
  }; // 1 hour ago
  const staleCache: UpdateCheckCache = {
    checkedAt: now - 90_000_000,
    latest: null,
  }; // ~25 hours ago

  it("returns false for a cache checked 1 hour ago", () => {
    expect(isCacheStale(freshCache, now)).toBe(false);
  });

  it("returns true for a cache checked 25 hours ago", () => {
    expect(isCacheStale(staleCache, now)).toBe(true);
  });

  it("returns true for a cache exactly at 24h boundary", () => {
    const borderCache: UpdateCheckCache = {
      checkedAt: now - 86_400_001,
      latest: null,
    };
    expect(isCacheStale(borderCache, now)).toBe(true);
  });

  it("returns false for cache checked exactly at 24h (not yet stale)", () => {
    const exactBoundary: UpdateCheckCache = {
      checkedAt: now - 86_400_000,
      latest: null,
    };
    expect(isCacheStale(exactBoundary, now)).toBe(false);
  });

  it("uses Date.now() as default when nowMs is not provided", () => {
    const oldCache: UpdateCheckCache = {
      checkedAt: Date.now() - 100_000_000,
      latest: null,
    };
    expect(isCacheStale(oldCache)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldRunUpdateCheck
// ---------------------------------------------------------------------------

describe("shouldRunUpdateCheck", () => {
  const origCI = process.env.CI;
  const origNoCheck = process.env.REPO_SCANNER_NO_UPDATE_CHECK;

  afterEach(() => {
    if (origCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = origCI;
    }
    if (origNoCheck === undefined) {
      delete process.env.REPO_SCANNER_NO_UPDATE_CHECK;
    } else {
      process.env.REPO_SCANNER_NO_UPDATE_CHECK = origNoCheck;
    }
  });

  it("returns false when noUpdateCheck option is true", () => {
    delete process.env.CI;
    delete process.env.REPO_SCANNER_NO_UPDATE_CHECK;
    expect(shouldRunUpdateCheck({ noUpdateCheck: true })).toBe(false);
  });

  it("returns false when CI env is set", () => {
    process.env.CI = "true";
    delete process.env.REPO_SCANNER_NO_UPDATE_CHECK;
    expect(shouldRunUpdateCheck({})).toBe(false);
  });

  it("returns false when REPO_SCANNER_NO_UPDATE_CHECK is set", () => {
    delete process.env.CI;
    process.env.REPO_SCANNER_NO_UPDATE_CHECK = "1";
    expect(shouldRunUpdateCheck({})).toBe(false);
  });

  it("returns true when no suppression signals are present", () => {
    delete process.env.CI;
    delete process.env.REPO_SCANNER_NO_UPDATE_CHECK;
    expect(shouldRunUpdateCheck({})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// startBackgroundUpdateCheck
// ---------------------------------------------------------------------------

describe("startBackgroundUpdateCheck", () => {
  const origCI = process.env.CI;

  beforeEach(() => {
    delete process.env.CI;
    delete process.env.REPO_SCANNER_NO_UPDATE_CHECK;
  });

  afterEach(() => {
    if (origCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = origCI;
    }
  });

  const noCache = { loadCache: async () => null, saveCache: async () => {} };

  it("returns null when noUpdateCheck is true", async () => {
    const result = await startBackgroundUpdateCheck({
      currentSha: "aaa",
      updateUrl: "https://x",
      noUpdateCheck: true,
      fetchFn: makeFetch(LATEST),
      ...noCache,
    });
    expect(result).toBeNull();
  });

  it("returns null when updateUrl is empty", async () => {
    const result = await startBackgroundUpdateCheck({
      currentSha: "aaa",
      updateUrl: "",
      fetchFn: makeFetch(LATEST),
      ...noCache,
    });
    expect(result).toBeNull();
  });

  it("returns null when current SHA matches latest", async () => {
    const result = await startBackgroundUpdateCheck({
      currentSha: LATEST.sha,
      updateUrl: "https://x",
      fetchFn: makeFetch(LATEST),
      ...noCache,
    });
    expect(result).toBeNull();
  });

  it("returns VersionInfo when update is available", async () => {
    const result = await startBackgroundUpdateCheck({
      currentSha: "oldshaoldshaoldshaoldshaoldshaoldshaoldsha",
      updateUrl: "https://x",
      fetchFn: makeFetch(LATEST),
      ...noCache,
    });
    expect(result).toEqual(LATEST);
  });

  it("returns null (never throws) when fetch fails", async () => {
    const result = await startBackgroundUpdateCheck({
      currentSha: "oldshaoldshaoldshaoldshaoldshaoldshaoldsha",
      updateUrl: "https://x",
      fetchFn: makeNetworkErrorFetch("timeout"),
      loadCache: async () => null,
      saveCache: async () => {},
    });
    expect(result).toBeNull();
  });

  it("returns null when currentSha is dev", async () => {
    const result = await startBackgroundUpdateCheck({
      currentSha: "dev",
      updateUrl: "https://x",
      fetchFn: makeFetch(LATEST),
      loadCache: async () => null,
      saveCache: async () => {},
    });
    expect(result).toBeNull();
  });

  it("returns VersionInfo from a fresh cache when update is available", async () => {
    const cachedLatest: VersionInfo = {
      ...LATEST,
      sha: "cachedshaacachedshaacachedshaacachedshaac",
    };
    const freshCache: UpdateCheckCache = {
      checkedAt: Date.now() - 3600_000, // 1 hour ago — not stale
      latest: cachedLatest,
    };
    const result = await startBackgroundUpdateCheck({
      currentSha: "oldshaoldshaoldshaoldshaoldshaoldshaoldsha",
      updateUrl: "https://x",
      fetchFn: makeFetch(LATEST), // Should NOT be called (cache is fresh)
      loadCache: async () => freshCache,
      saveCache: async () => {},
    });
    expect(result).toEqual(cachedLatest);
  });

  it("returns null (never throws) when loadCache throws", async () => {
    const result = await startBackgroundUpdateCheck({
      currentSha: "oldshaoldshaoldshaoldshaoldshaoldshaoldsha",
      updateUrl: "https://x",
      fetchFn: makeFetch(LATEST),
      loadCache: async () => {
        throw new Error("I/O error");
      },
      saveCache: async () => {},
    });
    expect(result).toBeNull();
  });

  it("returns result even when saveCache throws", async () => {
    const result = await startBackgroundUpdateCheck({
      currentSha: "oldshaoldshaoldshaoldshaoldshaoldshaoldsha",
      updateUrl: "https://x",
      fetchFn: makeFetch(LATEST),
      loadCache: async () => null,
      saveCache: async () => {
        throw new Error("disk full");
      },
    });
    // Cache save failed but we still get the update info.
    expect(result).toEqual(LATEST);
  });
});

// ---------------------------------------------------------------------------
// formatUpdateNotice
// ---------------------------------------------------------------------------

describe("formatUpdateNotice", () => {
  it("includes abbreviated SHAs", () => {
    const notice = formatUpdateNotice("oldshaOLDSHA", LATEST);
    expect(notice).toContain("oldsha");
    expect(notice).toContain("aaaaaaa");
  });

  it("includes the update command", () => {
    const notice = formatUpdateNotice("oldshaOLDSHA", LATEST);
    expect(notice).toContain("repo-scanner update");
  });
});
