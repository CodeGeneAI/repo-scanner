import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

interface CratesResponse {
  crate?: { max_stable_version?: string };
}

export const cratesRegistryClient: RegistryClient = {
  ecosystem: "cargo",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    const data = await fetchJson<CratesResponse>(
      `https://crates.io/api/v1/crates/${encodeURIComponent(packageName)}`,
      {
        headers: {
          "User-Agent": "dep-scanner/0.1.0 (https://github.com/codegeneai)",
        },
      },
    );
    return data?.crate?.max_stable_version;
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await cratesRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};
