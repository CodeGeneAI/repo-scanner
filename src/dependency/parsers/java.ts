import type { Dependency } from "../types";
import { buildImportRegex } from "../usage/patterns";
import { findFiles, readText } from "../utils/fs";
import type { EcosystemParser } from "./types";

// Note: java parser uses custom getImportPatterns logic (extracts groupId),
// so it cannot use the shared buildImportPatterns helper.

const MANIFEST_FILES = ["pom.xml", "build.gradle", "build.gradle.kts"] as const;

/**
 * Parse pom.xml for <dependency> blocks.
 * Extracts groupId, artifactId, version, and optional <scope>.
 */
const parsePomXml = (content: string, manifestPath: string): Dependency[] => {
  const deps: Dependency[] = [];

  const depBlockRe = /<dependency>\s*([\s\S]*?)<\/dependency>/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = depBlockRe.exec(content)) !== null) {
    const block = blockMatch[1]!;

    const groupIdMatch = block.match(/<groupId>\s*([^<]+?)\s*<\/groupId>/);
    const artifactIdMatch = block.match(
      /<artifactId>\s*([^<]+?)\s*<\/artifactId>/,
    );
    const versionMatch = block.match(/<version>\s*([^<]+?)\s*<\/version>/);
    const scopeMatch = block.match(/<scope>\s*([^<]+?)\s*<\/scope>/);
    const optionalMatch = block.match(/<optional>\s*([^<]+?)\s*<\/optional>/);

    if (!groupIdMatch || !artifactIdMatch) continue;

    const groupId = groupIdMatch[1]!;
    const artifactId = artifactIdMatch[1]!;
    const version = versionMatch?.[1] ?? "*";
    const scope = scopeMatch?.[1]?.trim() ?? "";
    const isDev = scope === "test";
    const isOptional =
      optionalMatch?.[1]?.trim() === "true" || scope === "provided";

    deps.push({
      name: `${groupId}:${artifactId}`,
      currentVersion: version,
      ecosystem: "maven",
      manifestPath,
      isDev,
      isOptional,
    });
  }

  return deps;
};

/**
 * Parse build.gradle or build.gradle.kts for dependency declarations.
 * Handles: implementation, api, compileOnly, runtimeOnly, testImplementation, etc.
 */
const parseGradle = (content: string, manifestPath: string): Dependency[] => {
  const deps: Dependency[] = [];
  const devConfigs = new Set([
    "testImplementation",
    "testCompileOnly",
    "testRuntimeOnly",
    "testApi",
    "androidTestImplementation",
  ]);

  // Match: configuration "group:artifact:version"
  // and:   configuration("group:artifact:version")
  const stringDepRe =
    /\b(implementation|api|compileOnly|runtimeOnly|testImplementation|testCompileOnly|testRuntimeOnly|testApi|androidTestImplementation|kapt|annotationProcessor)\s*[\s(]\s*['"]([^'"]+)['"]/g;

  let m: RegExpExecArray | null;
  while ((m = stringDepRe.exec(content)) !== null) {
    const config = m[1]!;
    const coordStr = m[2]!;

    // Expect group:artifact:version or group:artifact
    const parts = coordStr.split(":");
    if (parts.length < 2) continue;

    const name = `${parts[0]}:${parts[1]}`;
    const version = parts[2] ?? "*";

    deps.push({
      name,
      currentVersion: version,
      ecosystem: "maven",
      manifestPath,
      isDev: devConfigs.has(config),
      isOptional: config === "compileOnly",
    });
  }

  // Match Kotlin DSL: configuration(group = "...", name = "...", version = "...")
  const kotlinDepRe =
    /\b(implementation|api|compileOnly|runtimeOnly|testImplementation|testCompileOnly|testRuntimeOnly|testApi)\s*\(\s*group\s*=\s*"([^"]+)"\s*,\s*name\s*=\s*"([^"]+)"\s*(?:,\s*version\s*=\s*"([^"]+)")?\s*\)/g;

  while ((m = kotlinDepRe.exec(content)) !== null) {
    const config = m[1]!;
    const group = m[2]!;
    const artifact = m[3]!;
    const version = m[4] ?? "*";

    deps.push({
      name: `${group}:${artifact}`,
      currentVersion: version,
      ecosystem: "maven",
      manifestPath,
      isDev: devConfigs.has(config),
      isOptional: config === "compileOnly",
    });
  }

  return deps;
};

export const javaParser: EcosystemParser = {
  ecosystem: "maven",
  manifestPatterns: [...MANIFEST_FILES],

  async detectFiles(rootPath: string): Promise<readonly string[]> {
    return findFiles(rootPath, [...MANIFEST_FILES]);
  },

  async parseDependencies(
    manifestPaths: readonly string[],
  ): Promise<readonly Dependency[]> {
    const seen = new Set<string>();
    const allDeps: Dependency[] = [];

    for (const manifestPath of manifestPaths) {
      const content = await readText(manifestPath);
      if (!content) continue;

      const baseName = manifestPath.split("/").pop() ?? "";
      let parsed: Dependency[] = [];

      try {
        if (baseName === "pom.xml") {
          parsed = parsePomXml(content, manifestPath);
        } else if (baseName.startsWith("build.gradle")) {
          parsed = parseGradle(content, manifestPath);
        }
      } catch {
        continue;
      }

      for (const dep of parsed) {
        const key = `${dep.name}@${manifestPath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allDeps.push(dep);
      }
    }

    return allDeps;
  },

  getImportPatterns(dependencies: readonly Dependency[]): Map<string, RegExp> {
    const patterns = new Map<string, RegExp>();
    const seen = new Set<string>();

    for (const dep of dependencies) {
      if (seen.has(dep.name)) continue;
      seen.add(dep.name);
      // For Maven, the import pattern uses the groupId (first part of name)
      const groupId = dep.name.split(":")[0]!;
      patterns.set(dep.name, buildImportRegex("maven", groupId));
    }

    return patterns;
  },
};
