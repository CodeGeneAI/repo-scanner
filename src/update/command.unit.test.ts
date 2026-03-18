import { describe, expect, it } from "bun:test";
import type { UpdateCommandDeps } from "./command";
import { runUpdateCommand } from "./command";
import {
  UpdateChecksumError,
  UpdateConfigError,
  UpdateDownloadError,
  UpdateExtractionError,
  UpdateFetchError,
  UpdatePlatformError,
} from "./errors";
import type { BunPlatform, VersionInfo } from "./types";
import { BUN_PLATFORMS } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CURRENT_SHA = "oldshaoldshaoldshaoldshaoldshaoldshaoldsha";
const LATEST: VersionInfo = {
  sha: "newshanewshanewshanewshanewshanewshanewsha",
  publishedAt: "2026-03-18T00:00:00.000Z",
  platforms: {
    "bun-linux-x64-baseline": {
      bundleUrl:
        "https://cdn.example.com/bundles/scanner-bun-linux-x64-baseline.tar.gz",
      bundleChecksum:
        "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    },
  },
};

/** All-platform version fixture for parameterized platform selection tests. */
const LATEST_ALL_PLATFORMS: VersionInfo = {
  sha: "newshanewshanewshanewshanewshanewshanewsha",
  publishedAt: "2026-03-18T00:00:00.000Z",
  platforms: Object.fromEntries(
    BUN_PLATFORMS.map((p, i) => [
      p,
      {
        bundleUrl: `https://cdn.example.com/bundles/scanner-${p}.tar.gz`,
        bundleChecksum: String(i + 1)
          .repeat(64)
          .slice(0, 64),
      },
    ]),
  ) as VersionInfo["platforms"],
};
const FAKE_BINARY = new TextEncoder().encode("fake-binary-bytes");

const makeWritable = (): {
  stream: NodeJS.WritableStream;
  output: string[];
} => {
  const output: string[] = [];
  const stream = {
    write: (chunk: string) => {
      output.push(chunk);
      return true;
    },
  } as unknown as NodeJS.WritableStream;
  return { stream, output };
};

const makeDeps = (
  overrides: Partial<UpdateCommandDeps> = {},
): UpdateCommandDeps => ({
  fetchLatestVersion: async () => LATEST,
  detectPlatform: () => "bun-linux-x64-baseline" as BunPlatform,
  downloadBundle: async () => FAKE_BINARY,
  extractBinaryFromBundle: () => FAKE_BINARY,
  atomicReplace: async () => {},
  resolveRealExecPath: () => "/usr/local/bin/repo-scanner",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runUpdateCommand", () => {
  it("returns up-to-date when SHA matches", async () => {
    const { stream } = makeWritable();
    const result = await runUpdateCommand(
      { currentSha: LATEST.sha, updateUrl: "https://x", stderr: stream },
      makeDeps(),
    );
    expect(result).toBe("up-to-date");
  });

  it("prints 'Already up to date' when SHA matches", async () => {
    const { stream, output } = makeWritable();
    await runUpdateCommand(
      { currentSha: LATEST.sha, updateUrl: "https://x", stderr: stream },
      makeDeps(),
    );
    expect(output.join("")).toContain("Already up to date");
  });

  it("returns updated when SHA differs", async () => {
    const { stream } = makeWritable();
    const result = await runUpdateCommand(
      { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
      makeDeps(),
    );
    expect(result).toBe("updated");
  });

  it("calls atomicReplace with extracted bytes and real exec path", async () => {
    const { stream } = makeWritable();
    const replaceArgs: Array<[Uint8Array, string]> = [];

    await runUpdateCommand(
      { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
      makeDeps({
        atomicReplace: async (bytes, p) => {
          replaceArgs.push([bytes, p]);
        },
        resolveRealExecPath: () => "/usr/local/bin/repo-scanner",
      }),
    );

    expect(replaceArgs).toHaveLength(1);
    expect(replaceArgs[0]![1]).toBe("/usr/local/bin/repo-scanner");
  });

  it("prints progress steps in order", async () => {
    const { stream, output } = makeWritable();
    await runUpdateCommand(
      { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
      makeDeps(),
    );
    const combined = output.join("");
    const downloadIdx = combined.indexOf("Downloading");
    const extractIdx = combined.indexOf("Extracting");
    const installIdx = combined.indexOf("Installing");
    expect(downloadIdx).toBeGreaterThan(-1);
    expect(extractIdx).toBeGreaterThan(downloadIdx);
    expect(installIdx).toBeGreaterThan(extractIdx);
  });

  it("throws UpdateConfigError when updateUrl is empty", async () => {
    const { stream } = makeWritable();
    await expect(
      runUpdateCommand(
        { currentSha: CURRENT_SHA, updateUrl: "", stderr: stream },
        makeDeps(),
      ),
    ).rejects.toBeInstanceOf(UpdateConfigError);
  });

  it("propagates UpdateFetchError from fetchLatestVersion", async () => {
    const { stream } = makeWritable();
    await expect(
      runUpdateCommand(
        { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
        makeDeps({
          fetchLatestVersion: async () => {
            throw new UpdateFetchError("server error");
          },
        }),
      ),
    ).rejects.toBeInstanceOf(UpdateFetchError);
  });

  it("throws UpdatePlatformError when no bundle exists for detected platform", async () => {
    const { stream } = makeWritable();
    await expect(
      runUpdateCommand(
        { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
        makeDeps({
          detectPlatform: () => "bun-darwin-arm64" as BunPlatform,
          // LATEST has no entry for bun-darwin-arm64
        }),
      ),
    ).rejects.toBeInstanceOf(UpdatePlatformError);
  });

  it("propagates UpdateDownloadError from downloadBundle", async () => {
    const { stream } = makeWritable();
    await expect(
      runUpdateCommand(
        { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
        makeDeps({
          downloadBundle: async () => {
            throw new UpdateDownloadError("timeout");
          },
        }),
      ),
    ).rejects.toBeInstanceOf(UpdateDownloadError);
  });

  it("propagates UpdateChecksumError from downloadBundle", async () => {
    const { stream } = makeWritable();
    await expect(
      runUpdateCommand(
        { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
        makeDeps({
          downloadBundle: async () => {
            throw new UpdateChecksumError("bad checksum");
          },
        }),
      ),
    ).rejects.toBeInstanceOf(UpdateChecksumError);
  });

  it("does not call downloadBundle when already up to date", async () => {
    const { stream } = makeWritable();
    let downloadCalled = false;
    await runUpdateCommand(
      { currentSha: LATEST.sha, updateUrl: "https://x", stderr: stream },
      makeDeps({
        downloadBundle: async () => {
          downloadCalled = true;
          return FAKE_BINARY;
        },
      }),
    );
    expect(downloadCalled).toBe(false);
  });

  it("propagates UpdateExtractionError from extractBinaryFromBundle", async () => {
    const { stream } = makeWritable();
    await expect(
      runUpdateCommand(
        { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
        makeDeps({
          extractBinaryFromBundle: () => {
            throw new UpdateExtractionError("binary not found in archive");
          },
        }),
      ),
    ).rejects.toBeInstanceOf(UpdateExtractionError);
  });

  it("passes extracted binary bytes to atomicReplace", async () => {
    const { stream } = makeWritable();
    const extractedBinary = new TextEncoder().encode("expected-binary");
    const replaceArgs: Array<[Uint8Array, string]> = [];

    await runUpdateCommand(
      { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
      makeDeps({
        extractBinaryFromBundle: () => extractedBinary,
        atomicReplace: async (bytes, p) => {
          replaceArgs.push([bytes, p]);
        },
      }),
    );

    expect(replaceArgs[0]![0]).toEqual(extractedBinary);
  });

  it("downloads using the platform-specific bundleUrl and bundleChecksum", async () => {
    const { stream } = makeWritable();
    const downloadArgs: Array<[string, string]> = [];

    await runUpdateCommand(
      { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
      makeDeps({
        detectPlatform: () => "bun-linux-x64-baseline" as BunPlatform,
        downloadBundle: async (url, checksum) => {
          downloadArgs.push([url, checksum]);
          return FAKE_BINARY;
        },
      }),
    );

    expect(downloadArgs).toHaveLength(1);
    expect(downloadArgs[0]![0]).toBe(
      LATEST.platforms["bun-linux-x64-baseline"]!.bundleUrl,
    );
    expect(downloadArgs[0]![1]).toBe(
      LATEST.platforms["bun-linux-x64-baseline"]!.bundleChecksum,
    );
  });

  // Parameterized: each platform resolves to the correct bundle URL/checksum.
  for (const platform of BUN_PLATFORMS) {
    it(`selects correct bundle for platform ${platform}`, async () => {
      const { stream } = makeWritable();
      const downloadArgs: Array<[string, string]> = [];

      await runUpdateCommand(
        { currentSha: CURRENT_SHA, updateUrl: "https://x", stderr: stream },
        makeDeps({
          fetchLatestVersion: async () => LATEST_ALL_PLATFORMS,
          detectPlatform: () => platform,
          downloadBundle: async (url, checksum) => {
            downloadArgs.push([url, checksum]);
            return FAKE_BINARY;
          },
        }),
      );

      const expected = LATEST_ALL_PLATFORMS.platforms[platform]!;
      expect(downloadArgs[0]![0]).toBe(expected.bundleUrl);
      expect(downloadArgs[0]![1]).toBe(expected.bundleChecksum);
    });
  }
});
