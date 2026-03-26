import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import fs from "fs";
import {
  detectAvx2,
  detectPlatform,
  fetchLatestVersion,
  formatUpdateNotice,
  getBundleForPlatform,
  isCacheStale,
  isUpdateAvailable,
  shouldRunUpdateCheck,
  startBackgroundUpdateCheck,
} from "./check";
import { UpdateFetchError, UpdatePlatformError } from "./errors";
import type { BunPlatform, UpdateCheckCache, VersionInfo } from "./types";
import { BUN_PLATFORMS } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LATEST: VersionInfo = {
  sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  publishedAt: "2026-03-18T00:00:00.000Z",
  platforms: {
    "bun-linux-x64-baseline": {
      bundleUrl:
        "https://cdn.example.com/binaries/releases/aaa/scanner-tools-bundle-bun-linux-x64-baseline.tar.gz",
      bundleChecksum:
        "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    },
    "bun-darwin-arm64": {
      bundleUrl:
        "https://cdn.example.com/binaries/releases/aaa/scanner-tools-bundle-bun-darwin-arm64.tar.gz",
      bundleChecksum:
        "def456abc123def456abc123def456abc123def456abc123def456abc123def4",
    },
  },
};

/** All-platform fixture exercised in getBundleForPlatform parameterized tests. */
const ALL_PLATFORMS_LATEST: VersionInfo = {
  sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  publishedAt: "2026-03-18T00:00:00.000Z",
  platforms: {
    "bun-linux-x64": {
      bundleUrl:
        "https://cdn.example.com/releases/bbb/scanner-tools-bundle-bun-linux-x64.tar.gz",
      bundleChecksum:
        "1111111111111111111111111111111111111111111111111111111111111111",
    },
    "bun-linux-x64-baseline": {
      bundleUrl:
        "https://cdn.example.com/releases/bbb/scanner-tools-bundle-bun-linux-x64-baseline.tar.gz",
      bundleChecksum:
        "2222222222222222222222222222222222222222222222222222222222222222",
    },
    "bun-linux-arm64": {
      bundleUrl:
        "https://cdn.example.com/releases/bbb/scanner-tools-bundle-bun-linux-arm64.tar.gz",
      bundleChecksum:
        "3333333333333333333333333333333333333333333333333333333333333333",
    },
    "bun-darwin-x64": {
      bundleUrl:
        "https://cdn.example.com/releases/bbb/scanner-tools-bundle-bun-darwin-x64.tar.gz",
      bundleChecksum:
        "4444444444444444444444444444444444444444444444444444444444444444",
    },
    "bun-darwin-x64-baseline": {
      bundleUrl:
        "https://cdn.example.com/releases/bbb/scanner-tools-bundle-bun-darwin-x64-baseline.tar.gz",
      bundleChecksum:
        "5555555555555555555555555555555555555555555555555555555555555555",
    },
    "bun-darwin-arm64": {
      bundleUrl:
        "https://cdn.example.com/releases/bbb/scanner-tools-bundle-bun-darwin-arm64.tar.gz",
      bundleChecksum:
        "6666666666666666666666666666666666666666666666666666666666666666",
    },
    "bun-windows-x64": {
      bundleUrl:
        "https://cdn.example.com/releases/bbb/scanner-tools-bundle-bun-windows-x64.tar.gz",
      bundleChecksum:
        "7777777777777777777777777777777777777777777777777777777777777777",
    },
    "bun-windows-x64-baseline": {
      bundleUrl:
        "https://cdn.example.com/releases/bbb/scanner-tools-bundle-bun-windows-x64-baseline.tar.gz",
      bundleChecksum:
        "8888888888888888888888888888888888888888888888888888888888888888",
    },
  },
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

  it("throws UpdateFetchError when platforms is missing", async () => {
    const { platforms: _platforms, ...bad } = LATEST;
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch(bad)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError when platforms is not an object", async () => {
    const bad = { ...LATEST, platforms: "not-an-object" };
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch(bad)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError when platforms is an empty object", async () => {
    const bad = { ...LATEST, platforms: {} };
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch(bad)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError when a platform entry has missing bundleUrl", async () => {
    const bad = {
      ...LATEST,
      platforms: {
        "bun-linux-x64-baseline": { bundleChecksum: "a".repeat(64) },
      },
    };
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch(bad)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdateFetchError when a platform entry has missing bundleChecksum", async () => {
    const bad = {
      ...LATEST,
      platforms: {
        "bun-linux-x64-baseline": {
          bundleUrl: "https://cdn.example.com/bundle.tar.gz",
        },
      },
    };
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

  it("throws UpdateFetchError when platforms contains an unknown platform key", async () => {
    const bad = {
      ...LATEST,
      platforms: {
        "bun-unknown-platform": {
          bundleUrl: "https://cdn.example.com/bundle.tar.gz",
          bundleChecksum: "a".repeat(64),
        },
      },
    };
    await expect(
      fetchLatestVersion("https://x", 100, makeFetch(bad)),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });
});

// ---------------------------------------------------------------------------
// getBundleForPlatform
// ---------------------------------------------------------------------------

describe("getBundleForPlatform", () => {
  it("returns the bundle for a present platform key", () => {
    const bundle = getBundleForPlatform(
      LATEST,
      "bun-linux-x64-baseline" as BunPlatform,
    );
    expect(bundle.bundleUrl).toContain("bun-linux-x64-baseline");
    expect(bundle.bundleChecksum).toBe(
      "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    );
  });

  it("throws UpdatePlatformError when platform is absent", () => {
    expect(() =>
      getBundleForPlatform(LATEST, "bun-linux-arm64" as BunPlatform),
    ).toThrow(UpdatePlatformError);
  });

  it("includes the platform name in the error message", () => {
    expect(() =>
      getBundleForPlatform(LATEST, "bun-darwin-x64" as BunPlatform),
    ).toThrow(/bun-darwin-x64/);
  });

  // Parameterized: every BUN_PLATFORM must be retrievable from the all-platform fixture.
  for (const platform of BUN_PLATFORMS) {
    it(`returns bundle for ${platform}`, () => {
      const bundle = getBundleForPlatform(ALL_PLATFORMS_LATEST, platform);
      expect(bundle.bundleUrl).toContain(platform);
      expect(bundle.bundleChecksum).toMatch(/^[0-9a-f]{64}$/);
    });
  }
});

// ---------------------------------------------------------------------------
// detectAvx2
// ---------------------------------------------------------------------------

describe("detectAvx2", () => {
  it("returns a boolean on the current system", () => {
    expect(typeof detectAvx2()).toBe("boolean");
  });

  it("returns false on unsupported platforms (win32)", () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });
    try {
      expect(detectAvx2()).toBe(false);
    } finally {
      if (orig) Object.defineProperty(process, "platform", orig);
    }
  });

  it("returns true on linux when /proc/cpuinfo contains avx2 flag", () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
    });
    // biome-ignore lint: @typescript-eslint/no-explicit-any
    const spy = spyOn(fs, "readFileSync").mockImplementation(
      (() => "flags : fpu avx2 sse4_2\n") as any,
    );
    try {
      expect(detectAvx2()).toBe(true);
    } finally {
      spy.mockRestore();
      if (orig) Object.defineProperty(process, "platform", orig);
    }
  });

  it("returns false on linux when /proc/cpuinfo lacks avx2 flag", () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
    });
    // biome-ignore lint: @typescript-eslint/no-explicit-any
    const spy = spyOn(fs, "readFileSync").mockImplementation(
      (() => "flags : fpu sse4_2\n") as any,
    );
    try {
      expect(detectAvx2()).toBe(false);
    } finally {
      spy.mockRestore();
      if (orig) Object.defineProperty(process, "platform", orig);
    }
  });

  it("returns false on linux when readFileSync throws", () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
    });
    const spy = spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });
    try {
      expect(detectAvx2()).toBe(false);
    } finally {
      spy.mockRestore();
      if (orig) Object.defineProperty(process, "platform", orig);
    }
  });

  it("returns true on darwin when sysctl reports avx2", () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });
    // biome-ignore lint: @typescript-eslint/no-explicit-any
    const spy = spyOn(Bun, "spawnSync").mockReturnValue({
      success: true,
      stdout: Buffer.from("1\n"),
      stderr: Buffer.from(""),
      exitCode: 0,
      signalCode: null,
    } as unknown as ReturnType<typeof Bun.spawnSync>);
    try {
      expect(detectAvx2()).toBe(true);
    } finally {
      spy.mockRestore();
      if (orig) Object.defineProperty(process, "platform", orig);
    }
  });

  it("returns false on darwin when sysctl reports no avx2", () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });
    const spy = spyOn(Bun, "spawnSync").mockReturnValue({
      success: true,
      stdout: Buffer.from("0\n"),
      stderr: Buffer.from(""),
      exitCode: 0,
      signalCode: null,
    } as unknown as ReturnType<typeof Bun.spawnSync>);
    try {
      expect(detectAvx2()).toBe(false);
    } finally {
      spy.mockRestore();
      if (orig) Object.defineProperty(process, "platform", orig);
    }
  });

  it("returns false on darwin when sysctl command fails", () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });
    const spy = spyOn(Bun, "spawnSync").mockReturnValue({
      success: false,
      stdout: Buffer.from(""),
      stderr: Buffer.from("sysctl: unknown oid"),
      exitCode: 1,
      signalCode: null,
    } as unknown as ReturnType<typeof Bun.spawnSync>);
    try {
      expect(detectAvx2()).toBe(false);
    } finally {
      spy.mockRestore();
      if (orig) Object.defineProperty(process, "platform", orig);
    }
  });
});

// ---------------------------------------------------------------------------
// detectPlatform
// ---------------------------------------------------------------------------

describe("detectPlatform", () => {
  const mockPlatformArch = (platform: string, arch: string, fn: () => void) => {
    const origPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    const origArch = Object.getOwnPropertyDescriptor(process, "arch");
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: arch,
      configurable: true,
    });
    try {
      fn();
    } finally {
      if (origPlatform)
        Object.defineProperty(process, "platform", origPlatform);
      if (origArch) Object.defineProperty(process, "arch", origArch);
    }
  };

  it("returns a valid BunPlatform on the current system", () => {
    const result = detectPlatform();
    expect(BUN_PLATFORMS).toContain(result);
  });

  it("returns bun-linux-arm64 on linux/arm64", () => {
    mockPlatformArch("linux", "arm64", () => {
      expect(detectPlatform()).toBe("bun-linux-arm64");
    });
  });

  it("returns bun-darwin-arm64 on darwin/arm64", () => {
    mockPlatformArch("darwin", "arm64", () => {
      expect(detectPlatform()).toBe("bun-darwin-arm64");
    });
  });

  it("returns bun-linux-x64 on linux/x64 with avx2 present", () => {
    mockPlatformArch("linux", "x64", () => {
      const spy = spyOn(fs, "readFileSync").mockImplementation(
        (() => "flags : fpu avx2 sse4_2\n") as any,
      );
      try {
        expect(detectPlatform()).toBe("bun-linux-x64");
      } finally {
        spy.mockRestore();
      }
    });
  });

  it("returns bun-linux-x64-baseline on linux/x64 without avx2", () => {
    mockPlatformArch("linux", "x64", () => {
      const spy = spyOn(fs, "readFileSync").mockImplementation(
        (() => "flags : fpu sse4_2\n") as any,
      );
      try {
        expect(detectPlatform()).toBe("bun-linux-x64-baseline");
      } finally {
        spy.mockRestore();
      }
    });
  });

  it("returns bun-darwin-x64 on darwin/x64 with avx2 present", () => {
    mockPlatformArch("darwin", "x64", () => {
      const spy = spyOn(Bun, "spawnSync").mockReturnValue({
        success: true,
        stdout: Buffer.from("1\n"),
        stderr: Buffer.from(""),
        exitCode: 0,
        signalCode: null,
      } as unknown as ReturnType<typeof Bun.spawnSync>);
      try {
        expect(detectPlatform()).toBe("bun-darwin-x64");
      } finally {
        spy.mockRestore();
      }
    });
  });

  it("returns bun-darwin-x64-baseline on darwin/x64 without avx2", () => {
    mockPlatformArch("darwin", "x64", () => {
      const spy = spyOn(Bun, "spawnSync").mockReturnValue({
        success: true,
        stdout: Buffer.from("0\n"),
        stderr: Buffer.from(""),
        exitCode: 0,
        signalCode: null,
      } as unknown as ReturnType<typeof Bun.spawnSync>);
      try {
        expect(detectPlatform()).toBe("bun-darwin-x64-baseline");
      } finally {
        spy.mockRestore();
      }
    });
  });

  it("returns bun-windows-x64-baseline on win32/x64 (always baseline)", () => {
    mockPlatformArch("win32", "x64", () => {
      // Windows always uses baseline — no AVX2 detection attempted.
      expect(detectPlatform()).toBe("bun-windows-x64-baseline");
    });
  });

  it("throws UpdatePlatformError for unsupported OS on arm64", () => {
    mockPlatformArch("freebsd", "arm64", () => {
      expect(() => detectPlatform()).toThrow(UpdatePlatformError);
    });
  });

  it("throws UpdatePlatformError for unsupported arch", () => {
    mockPlatformArch("linux", "ia32", () => {
      expect(() => detectPlatform()).toThrow(UpdatePlatformError);
    });
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
