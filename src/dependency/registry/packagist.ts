import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

interface PackagistResponse {
  packages?: Record<string, Array<{ version?: string }>>;
}

export const packagistRegistryClient: RegistryClient = {
  ecosystem: "packagist",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    const data = await fetchJson<PackagistResponse>(
      `https://repo.packagist.org/p2/${packageName}.json`,
    );
    const version = data?.packages?.[packageName]?.[0]?.version;
    return version?.startsWith("v") ? version.slice(1) : version;
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await packagistRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};
