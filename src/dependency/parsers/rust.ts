import path from "path";
import type { Dependency } from "../types";
import { findFiles, readText } from "../utils/fs";
import { buildImportPatterns, type EcosystemParser } from "./types";

/**
 * Load resolved versions from Cargo.lock.
 */
const loadCargoLockVersions = async (
  manifestDir: string,
): Promise<Map<string, string>> => {
  const versions = new Map<string, string>();
  const content = await readText(path.join(manifestDir, "Cargo.lock"));
  if (!content) return versions;

  // Cargo.lock has [[package]] blocks with name and version fields
  const packageRe =
    /\[\[package\]\]\s*\nname\s*=\s*"([^"]+)"\s*\nversion\s*=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = packageRe.exec(content)) !== null) {
    if (!versions.has(m[1]!)) {
      versions.set(m[1]!, m[2]!);
    }
  }

  return versions;
};

/**
 * Parse a TOML dependency section from Cargo.toml.
 * Handles both `pkg = "version"` and `pkg = { version = "...", ... }`.
 */
const parseDepsSection = (
  content: string,
  sectionHeader: string,
  manifestPath: string,
  isDev: boolean,
  resolvedVersions: Map<string, string>,
): Dependency[] => {
  const deps: Dependency[] = [];

  // Find the section block (no 'm' flag so $ means end-of-string, not end-of-line)
  const headerEscaped = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionRe = new RegExp(
    `(?:^|\\n)\\[${headerEscaped}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\[|$)`,
  );
  const sectionMatch = content.match(sectionRe);
  if (!sectionMatch) return deps;

  const block = sectionMatch[1]!;

  // Match simple: pkg = "version"
  const simpleRe = /^([A-Za-z0-9_][A-Za-z0-9_-]*)\s*=\s*"([^"]+)"/gm;
  let m: RegExpExecArray | null;
  while ((m = simpleRe.exec(block)) !== null) {
    const name = m[1]!;
    const isOptional = false;
    deps.push({
      name,
      currentVersion: m[2]!,
      resolvedVersion: resolvedVersions.get(name),
      ecosystem: "cargo",
      manifestPath,
      isDev,
      isOptional,
    });
  }

  // Match table: pkg = { version = "...", optional = true, ... }
  const tableRe = /^([A-Za-z0-9_][A-Za-z0-9_-]*)\s*=\s*\{([^}]*)\}/gm;
  while ((m = tableRe.exec(block)) !== null) {
    const name = m[1]!;
    const attrs = m[2]!;

    const versionMatch = attrs.match(/version\s*=\s*"([^"]+)"/);
    if (!versionMatch) continue;

    const isOptional = /optional\s*=\s*true/.test(attrs);

    deps.push({
      name,
      currentVersion: versionMatch[1]!,
      resolvedVersion: resolvedVersions.get(name),
      ecosystem: "cargo",
      manifestPath,
      isDev,
      isOptional,
    });
  }

  return deps;
};

export const rustParser: EcosystemParser = {
  ecosystem: "cargo",
  manifestPatterns: ["Cargo.toml"],

  async detectFiles(rootPath: string): Promise<readonly string[]> {
    return findFiles(rootPath, ["Cargo.toml"]);
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
        const resolvedVersions = await loadCargoLockVersions(dir);

        const parsed = [
          ...parseDepsSection(
            content,
            "dependencies",
            manifestPath,
            false,
            resolvedVersions,
          ),
          ...parseDepsSection(
            content,
            "dev-dependencies",
            manifestPath,
            true,
            resolvedVersions,
          ),
          ...parseDepsSection(
            content,
            "build-dependencies",
            manifestPath,
            false,
            resolvedVersions,
          ),
        ];

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
    return buildImportPatterns("cargo", dependencies);
  },
};
