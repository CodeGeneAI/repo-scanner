import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

interface CocoapodsResponse {
  versions?: Array<{ name?: string }>;
}

export const cocoapodsRegistryClient: RegistryClient = {
  ecosystem: "cocoapods",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    const data = await fetchJson<CocoapodsResponse>(
      `https://trunk.cocoapods.org/api/v1/pods/${encodeURIComponent(packageName)}`,
    );
    return data?.versions?.[0]?.name;
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await cocoapodsRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};
