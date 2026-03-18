import fs from "fs";
import os from "os";
import path from "path";
import { UpdateFetchError } from "./errors";
import type { FetchFn, UpdateCheckCache, VersionInfo } from "./types";

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
  if (!isString(obj.bundleUrl) || obj.bundleUrl.length === 0) {
    throw new UpdateFetchError(
      "version.json: missing or empty field 'bundleUrl'",
    );
  }
  if (!isString(obj.bundleChecksum) || obj.bundleChecksum.length === 0) {
    throw new UpdateFetchError(
      "version.json: missing or empty field 'bundleChecksum'",
    );
  }
  if (!isString(obj.publishedAt) || obj.publishedAt.length === 0) {
    throw new UpdateFetchError(
      "version.json: missing or empty field 'publishedAt'",
    );
  }
  return {
    sha: obj.sha,
    bundleUrl: obj.bundleUrl,
    bundleChecksum: obj.bundleChecksum,
    publishedAt: obj.publishedAt,
  };
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const requireHttpsUrl = (url: string, label: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UpdateFetchError(`${label}: invalid URL "${url}"`);
  }
  if (parsed.protocol !== "https:") {
    throw new UpdateFetchError(
      `${label}: URL must use HTTPS (got "${parsed.protocol}")`,
    );
  }
};

export const fetchLatestVersion = async (
  url: string,
  timeoutMs = 3000,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<VersionInfo> => {
  requireHttpsUrl(url, "fetchLatestVersion");

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
