import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

interface GoModuleInfo {
  Version?: string;
}

export const goRegistryClient: RegistryClient = {
  ecosystem: "go",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    const encoded = encodeURIComponent(packageName).replaceAll("%2F", "/");
    const data = await fetchJson<GoModuleInfo>(
      `https://proxy.golang.org/${encoded}/@latest`,
    );
    return data?.Version;
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await goRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};
