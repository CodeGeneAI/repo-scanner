import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { parseSemver } from "../utils/semver";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

interface ConanSearchResponse {
  results?: string[];
}

/**
 * Registry client for ConanCenter.
 *
 * Uses the ConanCenter v2 search API to find the latest version of a package.
 * Falls back gracefully — if the API is unavailable or the response format
 * changes, the version check is simply skipped.
 */
export const conanRegistryClient: RegistryClient = {
  ecosystem: "conan",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    try {
      const data = await fetchJson<ConanSearchResponse>(
        `https://center2.conan.io/v2/conans/${encodeURIComponent(packageName)}/search`,
        { headers: { "User-Agent": "dep-scanner (https://github.com)" } },
      );

      if (!data?.results?.length) return undefined;

      // Results are version strings; sort semantically and pick the latest
      const versions = data.results
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .sort((a, b) => compareVersions(a, b));

      return versions.length > 0 ? versions[versions.length - 1] : undefined;
    } catch {
      return undefined;
    }
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await conanRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};

/**
 * Compare two version strings using the shared parseSemver utility.
 * Falls back to segment-by-segment numeric comparison for non-semver
 * Conan versions (e.g. "1.2" with only two segments).
 */
const compareVersions = (a: string, b: string): number => {
  const sa = parseSemver(a);
  const sb = parseSemver(b);

  if (sa && sb) {
    if (sa.major !== sb.major) return sa.major - sb.major;
    if (sa.minor !== sb.minor) return sa.minor - sb.minor;
    return sa.patch - sb.patch;
  }

  // Fallback for non-semver Conan versions (e.g. two-segment "1.2")
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }

  return 0;
};
