import { describe, expect, it } from "bun:test";
import type { UpdateCommandDeps } from "./command";
import { runUpdateCommand } from "./command";
import {
  UpdateChecksumError,
  UpdateDownloadError,
  UpdateExtractionError,
  UpdateFetchError,
} from "./errors";
import type { VersionInfo } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CURRENT_SHA = "oldshaoldshaoldshaoldshaoldshaoldshaoldsha";
const LATEST: VersionInfo = {
  sha: "newshanewshanewshanewshanewshanewshanewsha",
  bundleUrl: "https://cdn.example.com/bundles/scanner.tar.gz",
  bundleChecksum:
    "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  publishedAt: "2026-03-18T00:00:00.000Z",
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

  it("throws when updateUrl is empty", async () => {
    const { stream } = makeWritable();
    await expect(
      runUpdateCommand(
        { currentSha: CURRENT_SHA, updateUrl: "", stderr: stream },
        makeDeps(),
      ),
    ).rejects.toThrow();
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
});
