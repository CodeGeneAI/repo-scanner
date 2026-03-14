import type { Ecosystem } from "../types";

/** Default concurrency limit for parallel registry lookups. */
export const DEFAULT_REGISTRY_CONCURRENCY = 10;

export interface RegistryClient {
  readonly ecosystem: Ecosystem;

  /** Fetch latest version for a single package. */
  getLatestVersion(packageName: string): Promise<string | undefined>;

  /** Batch fetch latest versions. Returns map of name -> latest version. */
  getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>>;
}
