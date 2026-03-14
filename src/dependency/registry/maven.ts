import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson } from "../utils/http";
import { DEFAULT_REGISTRY_CONCURRENCY, type RegistryClient } from "./types";

interface MavenSearchResponse {
  response?: { docs?: Array<{ latestVersion?: string }> };
}

export const mavenRegistryClient: RegistryClient = {
  ecosystem: "maven",

  async getLatestVersion(packageName: string): Promise<string | undefined> {
    const [groupId, artifactId] = packageName.split(":");
    if (!groupId || !artifactId) return undefined;

    const q = encodeURIComponent(`g:${groupId} AND a:${artifactId}`);
    const data = await fetchJson<MavenSearchResponse>(
      `https://search.maven.org/solrsearch/select?q=${q}&rows=1&wt=json`,
    );
    return data?.response?.docs?.[0]?.latestVersion;
  },

  async getLatestVersions(
    packageNames: readonly string[],
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await mapWithConcurrency(
      packageNames,
      DEFAULT_REGISTRY_CONCURRENCY,
      async (name) => {
        const version = await mavenRegistryClient.getLatestVersion(name);
        if (version) results.set(name, version);
      },
    );

    return results;
  },
};
