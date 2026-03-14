import path from "path";
import type { Dependency } from "../types";
import { findFiles, readText } from "../utils/fs";
import { buildImportPatterns, type EcosystemParser } from "./types";

/**
 * Parse resolved versions from go.sum.
 */
const loadGoSumVersions = async (
  manifestDir: string,
): Promise<Map<string, string>> => {
  const versions = new Map<string, string>();
  const content = await readText(path.join(manifestDir, "go.sum"));
  if (!content) return versions;

  for (const line of content.split("\n")) {
    // Format: module version hash
    const match = line.match(/^(\S+)\s+v([^\s/]+)(?:\/go\.mod)?\s+/);
    if (match && !versions.has(match[1]!)) {
      versions.set(match[1]!, match[2]!);
    }
  }

  return versions;
};

/**
 * Parse go.mod file for require directives and replace directives.
 */
const parseGoMod = (
  content: string,
  manifestPath: string,
  resolvedVersions: Map<string, string>,
): Dependency[] => {
  const deps: Dependency[] = [];
  const replacedModules = new Set<string>();

  // Collect replace directives to know which modules are replaced
  // Single-line: replace old => new version
  const singleReplaceRe = /^replace\s+(\S+)\s+=>\s+/gm;
  let replaceMatch: RegExpExecArray | null;
  while ((replaceMatch = singleReplaceRe.exec(content)) !== null) {
    replacedModules.add(replaceMatch[1]!);
  }

  // Block replace:
  // replace (
  //   old => new version
  // )
  const blockReplaceRe = /^replace\s*\(\s*\n([\s\S]*?)\n\s*\)/gm;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockReplaceRe.exec(content)) !== null) {
    const block = blockMatch[1]!;
    for (const line of block.split("\n")) {
      const m = line.match(/^\s*(\S+)\s+=>/);
      if (m) replacedModules.add(m[1]!);
    }
  }

  // Parse single-line require: require module v1.2.3
  const singleRequireRe = /^require\s+(\S+)\s+v(\S+)\s*$/gm;
  let singleMatch: RegExpExecArray | null;
  while ((singleMatch = singleRequireRe.exec(content)) !== null) {
    const moduleName = singleMatch[1]!;
    if (replacedModules.has(moduleName)) continue;

    deps.push({
      name: moduleName,
      currentVersion: singleMatch[2]!,
      resolvedVersion: resolvedVersions.get(moduleName),
      ecosystem: "go",
      manifestPath,
      isDev: false,
      isOptional: false,
    });
  }

  // Parse require blocks:
  // require (
  //   module v1.2.3
  //   module v1.2.3 // indirect
  // )
  const blockRequireRe = /^require\s*\(\s*\n([\s\S]*?)\n\s*\)/gm;
  let reqBlockMatch: RegExpExecArray | null;
  while ((reqBlockMatch = blockRequireRe.exec(content)) !== null) {
    const block = reqBlockMatch[1]!;
    for (const line of block.split("\n")) {
      const m = line.match(/^\s*(\S+)\s+v(\S+)/);
      if (!m) continue;

      const moduleName = m[1]!;
      if (replacedModules.has(moduleName)) continue;

      const isIndirect = /\/\/\s*indirect/.test(line);

      deps.push({
        name: moduleName,
        currentVersion: m[2]!,
        resolvedVersion: resolvedVersions.get(moduleName),
        ecosystem: "go",
        manifestPath,
        isDev: false,
        isOptional: isIndirect,
      });
    }
  }

  return deps;
};

export const goParser: EcosystemParser = {
  ecosystem: "go",
  manifestPatterns: ["go.mod"],

  async detectFiles(rootPath: string): Promise<readonly string[]> {
    return findFiles(rootPath, ["go.mod"]);
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
        const dir = path.dirname(manifestPath);
        const resolvedVersions = await loadGoSumVersions(dir);
        const parsed = parseGoMod(content, manifestPath, resolvedVersions);

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
    return buildImportPatterns("go", dependencies);
  },
};
