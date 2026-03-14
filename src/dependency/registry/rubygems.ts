import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

interface RubygemInfo {
  version?: string;
}

export const rubygemsRegistryClient: RegistryClient = {
  ecosystem: "rubygems",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    const data = await fetchJson<RubygemInfo>(
      `https://rubygems.org/api/v1/gems/${encodeURIComponent(packageName)}.json`,
    );
    return data?.version;
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await rubygemsRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};
