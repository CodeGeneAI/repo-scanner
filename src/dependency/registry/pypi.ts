import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

interface PypiPackageInfo {
  info?: { version?: string };
}

export const pypiRegistryClient: RegistryClient = {
  ecosystem: "pypi",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    const data = await fetchJson<PypiPackageInfo>(
      `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`,
    );
    return data?.info?.version;
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await pypiRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};
