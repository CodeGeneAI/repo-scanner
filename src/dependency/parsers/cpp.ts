import path from "path";
import type { Dependency } from "../types";
import { findFiles, readText } from "../utils/fs";
import { buildImportPatterns, type EcosystemParser } from "./types";

/**
 * Parse conanfile.txt — INI-like format with [requires] section.
 * Lines like: zlib/1.3.1, boost/1.84.0
 */
const parseConanfileTxt = (
  content: string,
  manifestPath: string,
): Dependency[] => {
  const deps: Dependency[] = [];

  // Extract [requires] section
  const requiresRe = /(?:^|\n)\[requires\]\s*\n([\s\S]*?)(?=\n\[|$)/;
  const match = content.match(requiresRe);
  if (!match) return deps;

  const block = match[1]!;
  const lineRe = /^\s*([a-zA-Z0-9_][a-zA-Z0-9_.-]*)\/([^\s#]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(block)) !== null) {
    deps.push({
      name: m[1]!,
      currentVersion: m[2]!,
      ecosystem: "conan",
      manifestPath,
      isDev: false,
      isOptional: false,
    });
  }

  // Extract [test_requires] section for dev deps
  const testRequiresRe = /(?:^|\n)\[test_requires\]\s*\n([\s\S]*?)(?=\n\[|$)/;
  const testMatch = content.match(testRequiresRe);
  if (testMatch) {
    const testBlock = testMatch[1]!;
    const testLineRe = /^\s*([a-zA-Z0-9_][a-zA-Z0-9_.-]*)\/([^\s#]+)/gm;
    while ((m = testLineRe.exec(testBlock)) !== null) {
      deps.push({
        name: m[1]!,
        currentVersion: m[2]!,
        ecosystem: "conan",
        manifestPath,
        isDev: true,
        isOptional: false,
      });
    }
  }

  return deps;
};

/**
 * Parse conanfile.py — Python file with requires patterns.
 * Handles: requires = "pkg/ver", self.requires("pkg/ver"), self.tool_requires("pkg/ver")
 */
const parseConanfilePy = (
  content: string,
  manifestPath: string,
): Dependency[] => {
  const deps: Dependency[] = [];
  const seen = new Set<string>();

  // Match self.requires("pkg/ver") and requires = "pkg/ver"
  const requiresRe =
    /(?:self\.requires|requires\s*=)\s*\(\s*["']([a-zA-Z0-9_][a-zA-Z0-9_.-]*)\/([^"'/\s]+)["']\s*\)|requires\s*=\s*["']([a-zA-Z0-9_][a-zA-Z0-9_.-]*)\/([^"'/\s]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = requiresRe.exec(content)) !== null) {
    const name = m[1] ?? m[3];
    const version = m[2] ?? m[4];
    if (!name || !version) continue;
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deps.push({
      name,
      currentVersion: version,
      ecosystem: "conan",
      manifestPath,
      isDev: false,
      isOptional: false,
    });
  }

  // Match self.tool_requires("pkg/ver") — dev dependencies
  const toolRequiresRe =
    /self\.tool_requires\s*\(\s*["']([a-zA-Z0-9_][a-zA-Z0-9_.-]*)\/([^"'/\s]+)["']\s*\)/g;
  while ((m = toolRequiresRe.exec(content)) !== null) {
    const name = m[1]!;
    const version = m[2]!;
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deps.push({
      name,
      currentVersion: version,
      ecosystem: "conan",
      manifestPath,
      isDev: true,
      isOptional: false,
    });
  }

  return deps;
};

/**
 * Parse vcpkg.json — JSON with dependencies array.
 * Dependencies can be strings or objects with "name" field.
 */
const parseVcpkgJson = (
  content: string,
  manifestPath: string,
): Dependency[] => {
  const deps: Dependency[] = [];

  try {
    const json = JSON.parse(content) as {
      dependencies?: Array<string | { name: string; version?: string }>;
      "version-string"?: string;
      version?: string;
    };

    if (!Array.isArray(json.dependencies)) return deps;

    for (const entry of json.dependencies) {
      if (typeof entry === "string") {
        deps.push({
          name: entry,
          currentVersion: "*",
          ecosystem: "conan",
          manifestPath,
          isDev: false,
          isOptional: false,
        });
      } else if (entry && typeof entry === "object" && entry.name) {
        deps.push({
          name: entry.name,
          currentVersion: entry.version ?? "*",
          ecosystem: "conan",
          manifestPath,
          isDev: false,
          isOptional: false,
        });
      }
    }
  } catch {
    // Invalid JSON
  }

  return deps;
};

/**
 * Parse CMakeLists.txt — extract find_package() calls.
 * Matches: find_package(Boost), find_package(OpenSSL REQUIRED), find_package(Boost 1.70 REQUIRED)
 */
const parseCMakeLists = (
  content: string,
  manifestPath: string,
): Dependency[] => {
  const deps: Dependency[] = [];
  const seen = new Set<string>();

  const findPackageRe =
    /find_package\s*\(\s*([A-Za-z0-9_][A-Za-z0-9_-]*)(?:\s+(\d+(?:\.\d+)*))?/g;
  let m: RegExpExecArray | null;
  while ((m = findPackageRe.exec(content)) !== null) {
    const name = m[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    deps.push({
      name,
      currentVersion: m[2] ?? "*",
      ecosystem: "conan",
      manifestPath,
      isDev: false,
      isOptional: false,
    });
  }

  return deps;
};

export const cppParser: EcosystemParser = {
  ecosystem: "conan",
  manifestPatterns: [
    "conanfile.txt",
    "conanfile.py",
    "vcpkg.json",
    "CMakeLists.txt",
  ],

  async detectFiles(rootPath: string): Promise<readonly string[]> {
    return findFiles(rootPath, [
      "conanfile.txt",
      "conanfile.py",
      "vcpkg.json",
      "CMakeLists.txt",
    ]);
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
        const baseName = path.basename(manifestPath);
        let parsed: Dependency[] = [];

        if (baseName === "conanfile.txt") {
          parsed = parseConanfileTxt(content, manifestPath);
        } else if (baseName === "conanfile.py") {
          parsed = parseConanfilePy(content, manifestPath);
        } else if (baseName === "vcpkg.json") {
          parsed = parseVcpkgJson(content, manifestPath);
        } else if (baseName === "CMakeLists.txt") {
          parsed = parseCMakeLists(content, manifestPath);
        }

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
    return buildImportPatterns("conan", dependencies);
  },
};
