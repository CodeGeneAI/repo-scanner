import type { UpdateType } from "../types";

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/**
 * Parse a semver string. Returns undefined for non-semver versions.
 */
export const parseSemver = (version: string): SemVer | undefined => {
  const cleaned = version.replace(/^[v^~>=<!\s]+/, "").split(/\s/)[0]!;
  const match = cleaned.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-(.+))?/);
  if (!match) return undefined;
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3] ?? "0", 10),
    prerelease: match[4],
  };
};

/**
 * Determine the update type between current and latest versions.
 */
export const getUpdateType = (current: string, latest: string): UpdateType => {
  const cur = parseSemver(current);
  const lat = parseSemver(latest);

  if (!cur || !lat) return "unknown";

  if (
    cur.major === lat.major &&
    cur.minor === lat.minor &&
    cur.patch === lat.patch
  ) {
    return "up-to-date";
  }
  if (cur.major !== lat.major) return "major";
  if (cur.minor !== lat.minor) return "minor";
  return "patch";
};

/**
 * Extract a "base" version from a version range string.
 * e.g., "^1.2.3" -> "1.2.3", ">=2.0.0" -> "2.0.0"
 */
export const extractBaseVersion = (range: string): string => {
  return range.replace(/^[v^~>=<!\s]+/, "").split(/\s/)[0] ?? range;
};
