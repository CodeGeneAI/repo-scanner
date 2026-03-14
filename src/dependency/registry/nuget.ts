import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

interface NugetIndex {
  versions?: string[];
}

export const nugetRegistryClient: RegistryClient = {
  ecosystem: "nuget",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    const data = await fetchJson<NugetIndex>(
      `https://api.nuget.org/v3-flatcontainer/${packageName.toLowerCase()}/index.json`,
    );
    const versions = data?.versions?.filter((v) => !v.includes("-"));
    return versions && versions.length > 0
      ? versions[versions.length - 1]
      : undefined;
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await nugetRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};
