import type { Dependency } from "../types";
import { findFiles, readText } from "../utils/fs";
import { buildImportPatterns, type EcosystemParser } from "./types";

/**
 * Parse a Gemfile for gem declarations.
 * Handles `gem "name", "version"` and group blocks for isDev detection.
 */
const parseGemfile = (content: string, manifestPath: string): Dependency[] => {
  const deps: Dependency[] = [];
  const lines = content.split("\n");

  let inDevGroup = false;
  let groupDepth = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Track group blocks
    const groupMatch = line.match(/^group\s+(.+?)\s+do\b/);
    if (groupMatch) {
      const groups = groupMatch[1]!;
      inDevGroup = /:(?:test|development|dev)/.test(groups);
      groupDepth++;
      continue;
    }

    if (line === "end" && groupDepth > 0) {
      groupDepth--;
      if (groupDepth === 0) inDevGroup = false;
      continue;
    }

    // Match gem declarations: gem "name", "~> 1.0"  or  gem 'name', '>= 2.0'
    const gemMatch = line.match(
      /^gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?/,
    );
    if (!gemMatch) continue;

    const name = gemMatch[1]!;
    const versionStr = gemMatch[2] ?? "*";

    // Check for inline group specification
    const inlineGroupMatch = line.match(/group:\s*(?:\[([^\]]*)\]|:(\w+))/);
    let isDev = inDevGroup;
    if (inlineGroupMatch) {
      const groupStr = inlineGroupMatch[1] ?? inlineGroupMatch[2] ?? "";
      isDev = /test|development|dev/.test(groupStr);
    }

    deps.push({
      name,
      currentVersion: versionStr,
      ecosystem: "rubygems",
      manifestPath,
      isDev,
      isOptional: false,
    });
  }

  return deps;
};

export const rubyParser: EcosystemParser = {
  ecosystem: "rubygems",
  manifestPatterns: ["Gemfile"],

  async detectFiles(rootPath: string): Promise<readonly string[]> {
    return findFiles(rootPath, ["Gemfile"]);
  },

  async parseDependencies(
    manifestPaths: readonly string[],
  ): Promise<readonly Dependency[]> {
    const seen = new Set<string>();
    const allDeps: Dependency[] = [];

    for (const manifestPath of manifestPaths) {
      const content = await readText(manifestPath);
      if (!content) continue;

      try {
        const parsed = parseGemfile(content, manifestPath);

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

  getImportPatterns(dependencies) {
    return buildImportPatterns("rubygems", dependencies);
  },
};
