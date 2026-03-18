import fs from "fs";
import os from "os";
import path from "path";
import { UpdateFetchError, UpdatePlatformError } from "./errors";
import type {
  BunPlatform,
  FetchFn,
  PlatformBundle,
  UpdateCheckCache,
  VersionInfo,
} from "./types";
import { isBunPlatform, parseHttpsUrl } from "./utils";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isString = (v: unknown): v is string => typeof v === "string";

const validateVersionInfo = (raw: unknown): VersionInfo => {
  if (raw === null || typeof raw !== "object") {
    throw new UpdateFetchError("version.json: expected an object");
  }
  const obj = raw as Record<string, unknown>;
  if (!isString(obj.sha) || obj.sha.length === 0) {
    throw new UpdateFetchError("version.json: missing or empty field 'sha'");
  }
  if (!isString(obj.publishedAt) || obj.publishedAt.length === 0) {
    throw new UpdateFetchError(
      "version.json: missing or empty field 'publishedAt'",
    );
  }
  if (
    obj.platforms === null ||
    typeof obj.platforms !== "object" ||
    Array.isArray(obj.platforms)
  ) {
    throw new UpdateFetchError(
      "version.json: missing or invalid field 'platforms' (expected object)",
    );
  }
  const platforms = obj.platforms as Record<string, unknown>;
  const entries = Object.entries(platforms);
  if (entries.length === 0) {
    throw new UpdateFetchError(
      "version.json: 'platforms' must contain at least one entry",
    );
  }
  for (const [key, val] of entries) {
    if (!isBunPlatform(key)) {
      throw new UpdateFetchError(
        `version.json: platforms["${key}"] is not a recognised platform`,
      );
    }
    if (val === null || typeof val !== "object") {
      throw new UpdateFetchError(
        `version.json: platforms["${key}"] must be an object`,
      );
    }
    const entry = val as Record<string, unknown>;
    if (!isString(entry.bundleUrl) || entry.bundleUrl.length === 0) {
      throw new UpdateFetchError(
        `version.json: platforms["${key}"].bundleUrl is missing or empty`,
      );
    }
    if (!isString(entry.bundleChecksum) || entry.bundleChecksum.length === 0) {
      throw new UpdateFetchError(
        `version.json: platforms["${key}"].bundleChecksum is missing or empty`,
      );
    }
  }
  return {
    sha: obj.sha,
    publishedAt: obj.publishedAt,
    platforms: platforms as Partial<Record<BunPlatform, PlatformBundle>>,
  };
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export const fetchLatestVersion = async (
  url: string,
  timeoutMs = 3000,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<VersionInfo> => {
  parseHttpsUrl(url, (msg) => new UpdateFetchError(msg));

  let response: Response;
  try {
    response = await fetchFn(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UpdateFetchError(`Failed to fetch version.json: ${message}`);
  }

  if (!response.ok) {
    throw new UpdateFetchError(
      `version.json returned HTTP ${response.status}: ${url}`,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new UpdateFetchError("version.json: invalid JSON response");
  }

  return validateVersionInfo(raw);
};

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the current CPU supports AVX2.
 *
 * Windows is intentionally not detected here: reliable cross-process CPU
 * feature detection on Windows requires native Win32 API calls that are not
 * available in a pure Bun process. Bun's own `bun-windows-x64-baseline` target
 * is compiled for the SSE4.2 baseline and runs on all x64 Windows hardware, so
 * using baseline on Windows is always correct and avoids the detection risk.
 * Windows therefore always uses the `-baseline` variant — see `detectPlatform`.
 */
export const detectAvx2 = (): boolean => {
  try {
    if (process.platform === "linux") {
      return /\bavx2\b/.test(fs.readFileSync("/proc/cpuinfo", "utf8"));
    }
    if (process.platform === "darwin") {
      const r = Bun.spawnSync(["sysctl", "-n", "hw.optional.avx2_0"]);
      return r.success && r.stdout.toString().trim() === "1";
    }
  } catch {
    // Fall through to baseline on any error.
  }
  return false;
};

export const detectPlatform = (): BunPlatform => {
  const plat = process.platform; // "linux" | "darwin" | "win32"
  const arch = process.arch; // "x64" | "arm64"

  if (arch === "arm64") {
    if (plat === "linux") return "bun-linux-arm64";
    if (plat === "darwin") return "bun-darwin-arm64";
  }
  if (arch === "x64") {
    // Windows: reliable AVX2 detection requires Win32 native APIs unavailable
    // in Bun; baseline is safe on all x64 Windows hardware (see detectAvx2).
    if (plat === "win32") return "bun-windows-x64-baseline";
    const avx2 = detectAvx2();
    if (plat === "linux")
      return avx2 ? "bun-linux-x64" : "bun-linux-x64-baseline";
    if (plat === "darwin")
      return avx2 ? "bun-darwin-x64" : "bun-darwin-x64-baseline";
  }
  throw new UpdatePlatformError(`Unsupported platform: ${plat}/${arch}`);
};

export const getBundleForPlatform = (
  info: VersionInfo,
  platform: BunPlatform,
): PlatformBundle => {
  const bundle = info.platforms[platform];
  if (!bundle) {
    throw new UpdatePlatformError(
      `No bundle available for platform "${platform}" in version.json`,
    );
  }
  return bundle;
};

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export const isUpdateAvailable = (
  currentSha: string,
  latestSha: string,
): boolean => {
  // Never prompt dev builds to self-update.
  if (currentSha === "dev" || latestSha === "dev") return false;
  return currentSha !== latestSha;
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export const getCacheFilePath = (): string => {
  const cacheBase =
    process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  return path.join(cacheBase, "repo-scanner", "update-check.json");
};

export const loadUpdateCache = async (): Promise<UpdateCheckCache | null> => {
  try {
    const raw = await Bun.file(getCacheFilePath()).text();
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).checkedAt !== "number"
    ) {
      return null;
    }
    return parsed as UpdateCheckCache;
  } catch {
    return null;
  }
};

export const saveUpdateCache = async (
  cache: UpdateCheckCache,
): Promise<void> => {
  const filePath = getCacheFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await Bun.write(filePath, JSON.stringify(cache));
  } catch {
    // Best-effort — never throw from cache writes.
  }
};

export const isCacheStale = (
  cache: UpdateCheckCache,
  nowMs: number = Date.now(),
): boolean => nowMs - cache.checkedAt > 86_400_000; // 24 hours

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

export const shouldRunUpdateCheck = (opts: {
  noUpdateCheck?: boolean;
}): boolean => {
  if (opts.noUpdateCheck) return false;
  if (process.env.CI) return false;
  if (process.env.REPO_SCANNER_NO_UPDATE_CHECK) return false;
  return true;
};

// ---------------------------------------------------------------------------
// Background check
// ---------------------------------------------------------------------------

export interface BackgroundUpdateCheckOpts {
  readonly currentSha: string;
  readonly updateUrl: string;
  readonly noUpdateCheck?: boolean;
  readonly fetchFn?: FetchFn;
  readonly loadCache?: () => Promise<UpdateCheckCache | null>;
  readonly saveCache?: (cache: UpdateCheckCache) => Promise<void>;
}

export const startBackgroundUpdateCheck = async (
  opts: BackgroundUpdateCheckOpts,
): Promise<VersionInfo | null> => {
  if (!shouldRunUpdateCheck({ noUpdateCheck: opts.noUpdateCheck })) {
    return null;
  }

  // No URL configured (local dev build).
  if (!opts.updateUrl) return null;

  const doLoadCache = opts.loadCache ?? loadUpdateCache;
  const doSaveCache = opts.saveCache ?? saveUpdateCache;

  try {
    const cache = await doLoadCache();

    if (cache && !isCacheStale(cache)) {
      // Use cached result — avoid network if still fresh.
      if (
        cache.latest &&
        isUpdateAvailable(opts.currentSha, cache.latest.sha)
      ) {
        return cache.latest;
      }
      return null;
    }

    const latest = await fetchLatestVersion(
      opts.updateUrl,
      3000,
      opts.fetchFn,
    ).catch(() => null);

    // Save cache best-effort — never let a cache write failure suppress the result.
    await doSaveCache({ checkedAt: Date.now(), latest }).catch(() => undefined);

    if (latest && isUpdateAvailable(opts.currentSha, latest.sha)) {
      return latest;
    }
    return null;
  } catch {
    // Background check must never surface errors to the user.
    return null;
  }
};

// ---------------------------------------------------------------------------
// Notice formatting
// ---------------------------------------------------------------------------

export const shortSha = (sha: string): string => sha.slice(0, 7);

export const formatUpdateNotice = (
  currentSha: string,
  latest: VersionInfo,
): string =>
  `\nrepo-scanner update available: ${shortSha(currentSha)} → ${shortSha(latest.sha)}\n` +
  "Run `repo-scanner update` to install the latest version.\n\n";
