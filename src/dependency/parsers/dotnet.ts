import type { Dependency } from "../types";
import { findFiles, readText } from "../utils/fs";
import { buildImportPatterns, type EcosystemParser } from "./types";

const MANIFEST_FILES = [
  "*.csproj",
  "Directory.Packages.props",
  "packages.config",
] as const;

/**
 * Parse .csproj or Directory.Packages.props for <PackageReference> and
 * <PackageVersion> elements.
 * Formats:
 *   <PackageReference Include="Name" Version="1.0.0" />
 *   <PackageReference Include="Name" Version="1.0.0"></PackageReference>
 *   <PackageReference Include="Name">
 *     <Version>1.0.0</Version>
 *   </PackageReference>
 *   <PackageVersion Include="Name" Version="1.0.0" />
 */
const parseProjectFile = (
  content: string,
  manifestPath: string,
): Dependency[] => {
  const deps: Dependency[] = [];

  const TAG = "(?:PackageReference|PackageVersion)";

  // Self-closing and inline: <PackageReference|PackageVersion Include="..." Version="..." ... />
  const inlineRe = new RegExp(
    `<${TAG}\\s+[^>]*Include\\s*=\\s*"([^"]+)"[^>]*Version\\s*=\\s*"([^"]+)"[^>]*/?>`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(content)) !== null) {
    const name = m[1]!;
    const version = m[2]!;
    const surroundingText = m[0]!;
    const isPrivate = /PrivateAssets\s*=\s*"[Aa]ll"/i.test(surroundingText);

    deps.push({
      name,
      currentVersion: version,
      ecosystem: "nuget",
      manifestPath,
      isDev: isPrivate,
      isOptional: false,
    });
  }

  // Also check Version="..." Include="..." order
  const reverseRe = new RegExp(
    `<${TAG}\\s+[^>]*Version\\s*=\\s*"([^"]+)"[^>]*Include\\s*=\\s*"([^"]+)"[^>]*/?>`,
    "gi",
  );
  while ((m = reverseRe.exec(content)) !== null) {
    const version = m[1]!;
    const name = m[2]!;
    // Skip if already found
    if (deps.some((d) => d.name === name)) continue;

    deps.push({
      name,
      currentVersion: version,
      ecosystem: "nuget",
      manifestPath,
      isDev: false,
      isOptional: false,
    });
  }

  // Multi-line: <PackageReference|PackageVersion Include="Name">\n<Version>...</Version>
  const multiLineRe = new RegExp(
    `<${TAG}\\s+Include\\s*=\\s*"([^"]+)"[^>]*>[\\s\\S]*?<Version>([^<]+)<\\/Version>[\\s\\S]*?<\\/(?:PackageReference|PackageVersion)>`,
    "gi",
  );
  while ((m = multiLineRe.exec(content)) !== null) {
    const name = m[1]!;
    if (deps.some((d) => d.name === name)) continue;

    deps.push({
      name,
      currentVersion: m[2]!.trim(),
      ecosystem: "nuget",
      manifestPath,
      isDev: false,
      isOptional: false,
    });
  }

  return deps;
};

/**
 * Parse packages.config for <package> elements.
 * Format: <package id="Name" version="1.0.0" />
 */
const parsePackagesConfig = (
  content: string,
  manifestPath: string,
): Dependency[] => {
  const deps: Dependency[] = [];

  const packageRe =
    /<package\s+[^>]*id\s*=\s*"([^"]+)"[^>]*version\s*=\s*"([^"]+)"[^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = packageRe.exec(content)) !== null) {
    const isDev = /developmentDependency\s*=\s*"true"/i.test(m[0]!);

    deps.push({
      name: m[1]!,
      currentVersion: m[2]!,
      ecosystem: "nuget",
      manifestPath,
      isDev,
      isOptional: false,
    });
  }

  return deps;
};

export const dotnetParser: EcosystemParser = {
  ecosystem: "nuget",
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
        if (baseName === "packages.config") {
          parsed = parsePackagesConfig(content, manifestPath);
        } else {
          parsed = parseProjectFile(content, manifestPath);
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

  getImportPatterns(dependencies) {
    return buildImportPatterns("nuget", dependencies);
  },
};
