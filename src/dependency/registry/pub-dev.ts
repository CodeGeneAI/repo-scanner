import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

interface PubDevResponse {
  latest?: { version?: string };
}

export const pubDevRegistryClient: RegistryClient = {
  ecosystem: "pub",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    const data = await fetchJson<PubDevResponse>(
      `https://pub.dev/api/packages/${encodeURIComponent(packageName)}`,
    );
    return data?.latest?.version;
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await pubDevRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};
