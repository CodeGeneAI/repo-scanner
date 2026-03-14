import path from "path";
import type { Dependency } from "../types";
import { findFiles, readJson, readText } from "../utils/fs";
import { buildImportPatterns, type EcosystemParser } from "./types";

const MANIFEST_FILES = ["Package.swift", "Package.resolved"] as const;

/**
 * Load resolved versions from Package.resolved (v1 and v2 formats).
 */
const loadResolvedVersions = async (
  manifestDir: string,
): Promise<Map<string, string>> => {
  const versions = new Map<string, string>();

  const resolvedPath = path.join(manifestDir, "Package.resolved");
  const data = await readJson<{
    version?: number;
    object?: {
      pins?: Array<{ package: string; state?: { version?: string } }>;
    };
    pins?: Array<{
      identity?: string;
      state?: { version?: string };
    }>;
  }>(resolvedPath);

  if (!data) return versions;

  // v2 format (Swift 5.6+)
  if (data.pins) {
    for (const pin of data.pins) {
      const name = pin.identity;
      const version = pin.state?.version;
      if (name && version) {
        versions.set(name, version);
      }
    }
  }

  // v1 format
  if (data.object?.pins) {
    for (const pin of data.object.pins) {
      const name = pin.package;
      const version = pin.state?.version;
      if (name && version) {
        versions.set(name.toLowerCase(), version);
      }
    }
  }

  return versions;
};

/**
 * Parse Package.swift for .package declarations.
 * Handles:
 *   .package(name: "...", url: "...", from: "...")
 *   .package(url: "...", from: "...")
 *   .package(url: "...", .upToNextMajor(from: "..."))
 *   .package(url: "...", exact: "...")
 */
const parsePackageSwift = (
  content: string,
  manifestPath: string,
  resolvedVersions: Map<string, string>,
): Dependency[] => {
  const deps: Dependency[] = [];

  // Match .package( ... ) declarations
  const packageRe = /\.package\s*\(([\s\S]*?)\)/g;
  let m: RegExpExecArray | null;

  while ((m = packageRe.exec(content)) !== null) {
    const args = m[1]!;

    // Extract URL
    const urlMatch = args.match(/url\s*:\s*"([^"]+)"/);
    if (!urlMatch) continue;

    const url = urlMatch[1]!;
    // Derive package name from URL: last path segment without .git
    const urlParts = url.split("/");
    const rawName = urlParts[urlParts.length - 1] ?? "";
    const derivedName = rawName.replace(/\.git$/, "");

    // Check for explicit name
    const nameMatch = args.match(/name\s*:\s*"([^"]+)"/);
    const name = nameMatch?.[1] ?? derivedName;

    if (!name) continue;

    // Extract version
    let version = "*";
    const fromMatch = args.match(/from\s*:\s*"([^"]+)"/);
    const exactMatch = args.match(/exact\s*:\s*"([^"]+)"/);

    if (fromMatch) {
      version = `>=${fromMatch[1]}`;
    } else if (exactMatch) {
      version = exactMatch[1]!;
    }

    const resolved = resolvedVersions.get(name.toLowerCase());

    // SPM packages are mapped to the cocoapods ecosystem because both target the
    // Apple/iOS ecosystem and share the CocoaPods trunk registry for version lookups.
    // This is a known simplification.
    deps.push({
      name,
      currentVersion: version,
      resolvedVersion: resolved,
      ecosystem: "cocoapods",
      manifestPath,
      isDev: false,
      isOptional: false,
    });
  }

  return deps;
};

// SPM packages are mapped to the cocoapods ecosystem because both target the
// Apple/iOS ecosystem and share the CocoaPods trunk registry for version lookups.
// This is a known simplification.
export const swiftParser: EcosystemParser = {
  ecosystem: "cocoapods",
  manifestPatterns: [...MANIFEST_FILES],

  async detectFiles(rootPath: string): Promise<readonly string[]> {
    return findFiles(rootPath, [...MANIFEST_FILES]);
  },

  async parseDependencies(
    manifestPaths: readonly string[],
  ): Promise<readonly Dependency[]> {
    const seen = new Set<string>();
    const allDeps: Dependency[] = [];

    // Group by directory so we can pair Package.swift with Package.resolved
    const byDir = new Map<string, string[]>();
    for (const p of manifestPaths) {
      const dir = path.dirname(p);
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir)!.push(p);
    }

    for (const [dir, paths] of byDir) {
      const swiftPath = paths.find((p) => path.basename(p) === "Package.swift");
      if (!swiftPath) continue;

      const content = await readText(swiftPath);
      if (!content) continue;

      try {
        const resolvedVersions = await loadResolvedVersions(dir);
        const parsed = parsePackageSwift(content, swiftPath, resolvedVersions);

        for (const dep of parsed) {
          const key = `${dep.name}@${swiftPath}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allDeps.push(dep);
        }
      } catch {}
    }

    return allDeps;
  },

  getImportPatterns(dependencies) {
    return buildImportPatterns("cocoapods", dependencies);
  },
};
