import fs from "fs";
import path from "path";
import {
  UpdateChecksumError,
  UpdateDownloadError,
  UpdateExtractionError,
} from "./errors";
import type { FetchFn } from "./types";
import { parseHttpsUrl } from "./utils";

// ---------------------------------------------------------------------------
// Checksum verification
// ---------------------------------------------------------------------------

const HEX_RE = /^[a-f0-9]{64}$/i;

export const verifyChecksum = (data: Uint8Array, expected: string): void => {
  if (!HEX_RE.test(expected)) {
    throw new UpdateChecksumError(
      `Expected checksum is not a valid SHA-256 hex digest: "${expected}"`,
    );
  }

  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(data);
  const actual = hasher.digest("hex");

  if (actual !== expected.toLowerCase()) {
    throw new UpdateChecksumError(
      `Checksum mismatch: expected ${expected.slice(0, 16)}..., got ${actual.slice(0, 16)}...`,
    );
  }
};

// ---------------------------------------------------------------------------
// Bundle download
// ---------------------------------------------------------------------------

// 5 minutes — matches the --max-time 300 used in install-repo-scanner.sh for
// large binary bundles on slow connections.
const DOWNLOAD_TIMEOUT_MS = 300_000;

export const downloadBundle = async (
  url: string,
  expectedChecksum: string,
  fetchFn: FetchFn = globalThis.fetch,
  timeoutMs: number = DOWNLOAD_TIMEOUT_MS,
): Promise<Uint8Array> => {
  // Reject non-HTTPS URLs to prevent SSRF from version.json-controlled URLs.
  parseHttpsUrl(url, (msg) => new UpdateDownloadError(msg));

  let response: Response;
  try {
    response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UpdateDownloadError(`Failed to download bundle: ${message}`);
  }

  if (!response.ok) {
    throw new UpdateDownloadError(
      `Bundle download returned HTTP ${response.status}: ${url}`,
    );
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  verifyChecksum(bytes, expectedChecksum);

  return bytes;
};

// ---------------------------------------------------------------------------
// Tar extraction
// ---------------------------------------------------------------------------

const getBinaryEntryName = (): string =>
  process.platform === "win32" ? "bin/repo-scanner.exe" : "bin/repo-scanner";

const tarDecoder = new TextDecoder();

const readOctal = (buf: Uint8Array, start: number, len: number): number => {
  let str = "";
  for (let i = start; i < start + len; i++) {
    const byte = buf[i];
    if (byte === 0 || byte === 0x20) break;
    str += String.fromCharCode(byte!);
  }
  return Number.parseInt(str.trim(), 8) || 0;
};

const readString = (buf: Uint8Array, start: number, len: number): string => {
  let end = start;
  while (end < start + len && buf[end] !== 0) end++;
  return tarDecoder.decode(buf.slice(start, end));
};

export const extractBinaryFromBundle = (tarGzBytes: Uint8Array): Uint8Array => {
  // Cast required: tsgo treats bare Uint8Array as Uint8Array<ArrayBufferLike>
  // but Bun.gunzipSync expects Uint8Array<ArrayBuffer>. The data is always
  // a real ArrayBuffer in practice (never SharedArrayBuffer).
  const tar = Bun.gunzipSync(tarGzBytes as Uint8Array<ArrayBuffer>);

  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.slice(offset, offset + 512);

    // End-of-archive: two consecutive 512-byte zero blocks.
    if (header[0] === 0) break;

    const rawName = readString(header, 0, 100);
    const size = readOctal(header, 124, 12);
    const typeflag = header[156];

    offset += 512;

    // Normalise: strip leading "./" so both "./bin/x" and "bin/x" match.
    const entryName = rawName.replace(/^\.\//, "");
    const isRegularFile = typeflag === 0x30 || typeflag === 0x00;

    if (isRegularFile && entryName === getBinaryEntryName()) {
      return tar.slice(offset, offset + size);
    }

    // Advance past data blocks (rounded up to 512-byte boundary).
    offset += Math.ceil(size / 512) * 512;
  }

  throw new UpdateExtractionError(
    `"${getBinaryEntryName()}" not found in bundle archive`,
  );
};

// ---------------------------------------------------------------------------
// Atomic replacement
// ---------------------------------------------------------------------------

export const resolveRealExecPath = (): string =>
  fs.realpathSync(process.execPath);

export const atomicReplace = async (
  newBinaryBytes: Uint8Array,
  targetPath: string,
): Promise<void> => {
  const dir = path.dirname(targetPath);
  // Include a random suffix to avoid PID-reuse collisions on rapid updates.
  const rand = Math.random().toString(36).slice(2, 10);
  const tmpPath = path.join(dir, `.repo-scanner.update.${process.pid}.${rand}`);

  try {
    await Bun.write(tmpPath, newBinaryBytes);
    fs.chmodSync(tmpPath, 0o755);
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors — original binary is untouched.
    }
    throw err;
  }
};
