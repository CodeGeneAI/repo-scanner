import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

const NPM_REGISTRY = "https://registry.npmjs.org";

interface NpmPackageInfo {
  "dist-tags"?: { latest?: string };
}

export const npmRegistryClient: RegistryClient = {
  ecosystem: "npm",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    const encoded = encodeURIComponent(packageName).replace("%40", "@");
    const data = await fetchJson<NpmPackageInfo>(`${NPM_REGISTRY}/${encoded}`, {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
    });
    return data?.["dist-tags"]?.latest;
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await npmRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};
