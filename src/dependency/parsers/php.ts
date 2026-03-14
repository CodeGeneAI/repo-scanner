import type { Dependency } from "../types";
import { buildImportRegex } from "../usage/patterns";
import { findFiles, readJson } from "../utils/fs";
import type { EcosystemParser } from "./types";

// Note: php parser uses custom getImportPatterns logic (namespace transformation),
// so it cannot use the shared buildImportPatterns helper.

interface ComposerJson {
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
}

/**
 * Parse composer.json for require and require-dev sections.
 */
const parseComposerJson = (
  data: ComposerJson,
  manifestPath: string,
): Dependency[] => {
  const deps: Dependency[] = [];

  const extractSection = (
    section: Record<string, string> | undefined,
    isDev: boolean,
  ): void => {
    if (!section) return;

    for (const [name, version] of Object.entries(section)) {
      // Skip platform requirements like "php", "ext-*"
      if (
        name === "php" ||
        name.startsWith("ext-") ||
        name.startsWith("lib-")
      ) {
        continue;
      }

      deps.push({
        name,
        currentVersion: version,
        ecosystem: "packagist",
        manifestPath,
        isDev,
        isOptional: false,
      });
    }
  };

  extractSection(data.require, false);
  extractSection(data["require-dev"], true);

  return deps;
};

export const phpParser: EcosystemParser = {
  ecosystem: "packagist",
  manifestPatterns: ["composer.json"],

  async detectFiles(rootPath: string): Promise<readonly string[]> {
    return findFiles(rootPath, ["composer.json"]);
  },

  async parseDependencies(
    manifestPaths: readonly string[],
  ): Promise<readonly Dependency[]> {
    const seen = new Set<string>();
    const allDeps: Dependency[] = [];

    for (const manifestPath of manifestPaths) {
      const data = await readJson<ComposerJson>(manifestPath);
      if (!data) continue;

      try {
        const parsed = parseComposerJson(data, manifestPath);

        for (const dep of parsed) {
          const key = `${dep.name}@${manifestPath}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allDeps.push(dep);
        }
      } catch {}
    }

    return allDeps;
  },

  getImportPatterns(dependencies: readonly Dependency[]): Map<string, RegExp> {
    const patterns = new Map<string, RegExp>();
    const seen = new Set<string>();

    for (const dep of dependencies) {
      if (seen.has(dep.name)) continue;
      seen.add(dep.name);
      // For Packagist, use the vendor/package namespace for import matching
      const namespace = dep.name
        .split("/")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("\\");
      patterns.set(dep.name, buildImportRegex("packagist", namespace));
    }

    return patterns;
  },
};
