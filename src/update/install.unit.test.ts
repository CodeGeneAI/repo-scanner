import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import {
  UpdateChecksumError,
  UpdateDownloadError,
  UpdateExtractionError,
} from "./errors";
import {
  atomicReplace,
  downloadBundle,
  extractBinaryFromBundle,
  verifyChecksum,
} from "./install";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sha256Hex = (data: Uint8Array): string => {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(data);
  return hasher.digest("hex");
};

const makeFetch =
  (body: Uint8Array, status = 200) =>
  async (_url: string) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => body.buffer as ArrayBuffer,
    }) as unknown as Response;

const makeNetworkErrorFetch =
  (message: string) =>
  async (_url: string): Promise<Response> => {
    throw new Error(message);
  };

/**
 * Build a minimal POSIX tar.gz in memory containing a single file entry.
 * Used to exercise extractBinaryFromBundle without needing real bundle files.
 */
const buildMinimalTarGz = (
  entryName: string,
  content: Uint8Array,
): Uint8Array => {
  // POSIX ustar header is 512 bytes.
  const BLOCK = 512;
  const dataBlocks = Math.ceil(content.length / BLOCK);
  const totalBlocks = 1 + dataBlocks + 2; // header + data + 2 EOA blocks
  const tar = new Uint8Array(totalBlocks * BLOCK);

  const encoder = new TextEncoder();

  // Write name (bytes 0–99).
  const nameBytes = encoder.encode(entryName);
  tar.set(nameBytes.slice(0, 100), 0);

  // Write mode (bytes 100–107): "0000755\0"
  tar.set(encoder.encode("0000755\0"), 100);

  // Write size in octal (bytes 124–135).
  const sizeOctal = content.length.toString(8).padStart(11, "0") + "\0";
  tar.set(encoder.encode(sizeOctal), 124);

  // Write typeflag (byte 156): '0' = regular file.
  tar[156] = 0x30;

  // Write magic (bytes 257–262): "ustar\0"
  tar.set(encoder.encode("ustar\0"), 257);

  // Simple checksum: sum of header bytes, written at bytes 148–155.
  // Set checksum field to spaces first (as per POSIX spec).
  tar.fill(0x20, 148, 156);
  let checksum = 0;
  for (let i = 0; i < BLOCK; i++) checksum += tar[i]!;
  const checksumOctal = checksum.toString(8).padStart(6, "0") + "\0 ";
  tar.set(encoder.encode(checksumOctal), 148);

  // Write file data after the header.
  tar.set(content, BLOCK);

  return Bun.gzipSync(tar as Uint8Array<ArrayBuffer>) as unknown as Uint8Array;
};

// ---------------------------------------------------------------------------
// verifyChecksum
// ---------------------------------------------------------------------------

describe("verifyChecksum", () => {
  const data = new TextEncoder().encode("hello world");

  it("passes when checksum matches", () => {
    const hex = sha256Hex(data);
    expect(() => verifyChecksum(data, hex)).not.toThrow();
  });

  it("throws UpdateChecksumError on mismatch", () => {
    const badHex = "a".repeat(64);
    expect(() => verifyChecksum(data, badHex)).toThrow(UpdateChecksumError);
  });

  it("throws UpdateChecksumError for non-hex expected string", () => {
    expect(() => verifyChecksum(data, "not-a-hex-string")).toThrow(
      UpdateChecksumError,
    );
  });

  it("throws UpdateChecksumError for too-short hex string", () => {
    expect(() => verifyChecksum(data, "abc123")).toThrow(UpdateChecksumError);
  });

  it("accepts uppercase hex checksum", () => {
    const hex = sha256Hex(data);
    expect(() => verifyChecksum(data, hex.toUpperCase())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// downloadBundle
// ---------------------------------------------------------------------------

describe("downloadBundle", () => {
  const content = new TextEncoder().encode("fake bundle bytes");
  const checksum = sha256Hex(content);

  it("resolves with bytes when download succeeds and checksum matches", async () => {
    const result = await downloadBundle(
      "https://x",
      checksum,
      makeFetch(content),
    );
    expect(result).toEqual(content);
  });

  it("throws UpdateDownloadError on non-200 response", async () => {
    await expect(
      downloadBundle("https://x", checksum, makeFetch(content, 404)),
    ).rejects.toBeInstanceOf(UpdateDownloadError);
  });

  it("throws UpdateDownloadError on network error", async () => {
    await expect(
      downloadBundle("https://x", checksum, makeNetworkErrorFetch("refused")),
    ).rejects.toBeInstanceOf(UpdateDownloadError);
  });

  it("throws UpdateChecksumError when downloaded bytes do not match checksum", async () => {
    const badChecksum = "b".repeat(64);
    await expect(
      downloadBundle("https://x", badChecksum, makeFetch(content)),
    ).rejects.toBeInstanceOf(UpdateChecksumError);
  });

  it("throws UpdateDownloadError for non-HTTPS URL", async () => {
    await expect(
      downloadBundle(
        "http://insecure.example.com/bundle.tar.gz",
        checksum,
        makeFetch(content),
      ),
    ).rejects.toBeInstanceOf(UpdateDownloadError);
  });

  it("throws UpdateDownloadError for invalid URL", async () => {
    await expect(
      downloadBundle("not-a-url", checksum, makeFetch(content)),
    ).rejects.toBeInstanceOf(UpdateDownloadError);
  });
});

// ---------------------------------------------------------------------------
// extractBinaryFromBundle
// ---------------------------------------------------------------------------

describe("extractBinaryFromBundle", () => {
  const binaryContent = new TextEncoder().encode("#!/bin/sh\necho hello\n");

  it("extracts bin/repo-scanner from a valid tar.gz", () => {
    const tarGz = buildMinimalTarGz("bin/repo-scanner", binaryContent);
    const result = extractBinaryFromBundle(tarGz);
    expect(result).toEqual(binaryContent);
  });

  it("extracts ./bin/repo-scanner (with leading ./) from a valid tar.gz", () => {
    const tarGz = buildMinimalTarGz("./bin/repo-scanner", binaryContent);
    const result = extractBinaryFromBundle(tarGz);
    expect(result).toEqual(binaryContent);
  });

  it("throws UpdateExtractionError when bin/repo-scanner is not in archive", () => {
    const tarGz = buildMinimalTarGz("dist/something-else", binaryContent);
    expect(() => extractBinaryFromBundle(tarGz)).toThrow(UpdateExtractionError);
  });
});

// ---------------------------------------------------------------------------
// atomicReplace
// ---------------------------------------------------------------------------

describe("atomicReplace", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "repo-scanner-install-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes new binary to target path with 0755 permissions", async () => {
    const targetPath = path.join(tmpDir, "repo-scanner");
    const content = new TextEncoder().encode("new binary v2");

    await atomicReplace(content, targetPath);

    const written = await Bun.file(targetPath).bytes();
    expect(written).toEqual(content);

    const mode = fs.statSync(targetPath).mode & 0o777;
    expect(mode).toBe(0o755);
  });

  it("replaces an existing file atomically", async () => {
    const targetPath = path.join(tmpDir, "repo-scanner");
    await Bun.write(targetPath, "old binary");

    const newContent = new TextEncoder().encode("new binary content");
    await atomicReplace(newContent, targetPath);

    const written = await Bun.file(targetPath).bytes();
    expect(written).toEqual(newContent);
  });

  it("leaves no temp file behind after successful replace", async () => {
    const targetPath = path.join(tmpDir, "repo-scanner");
    await atomicReplace(new TextEncoder().encode("binary"), targetPath);

    const entries = fs.readdirSync(tmpDir);
    const tempFiles = entries.filter((e) =>
      e.startsWith(".repo-scanner.update."),
    );
    expect(tempFiles).toHaveLength(0);
  });
});
