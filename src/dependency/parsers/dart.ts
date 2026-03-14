import type { Dependency } from "../types";
import { findFiles, readText } from "../utils/fs";
import { buildImportPatterns, type EcosystemParser } from "./types";

/**
 * Parse a YAML-like dependency block from pubspec.yaml using regex.
 * Handles:
 *   dependencies:
 *     pkg_name: ^1.0.0
 *     pkg_name: ">=1.0.0 <2.0.0"
 *     pkg_name:
 *       version: ^1.0.0
 *     pkg_name:
 *       hosted: ...
 *     pkg_name:
 *       path: ...
 *     pkg_name:
 *       git: ...
 */
const parseDepsBlock = (
  content: string,
  sectionName: string,
  manifestPath: string,
  isDev: boolean,
): Dependency[] => {
  const deps: Dependency[] = [];

  // Find the section. It starts with `sectionName:` at column 0 and continues
  // until the next top-level key (non-indented line that isn't blank/comment).
  const sectionRe = new RegExp(
    `^${sectionName}:\\s*\\n((?:[ \\t]+[^\\n]*\\n?)*)`,
    "m",
  );
  const sectionMatch = content.match(sectionRe);
  if (!sectionMatch) return deps;

  const block = sectionMatch[1]!;
  const lines = block.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    // A dependency entry starts with exactly 2 spaces (standard YAML indent)
    const entryMatch = line.match(
      /^ {2}([A-Za-z0-9_][A-Za-z0-9_]*)\s*:\s*(.*)/,
    );
    if (!entryMatch) {
      i++;
      continue;
    }

    const name = entryMatch[1]!;
    const valueStr = entryMatch[2]!.trim();

    // Skip Flutter SDK and special entries
    if (
      name === "flutter" ||
      name === "flutter_test" ||
      name === "flutter_localizations"
    ) {
      i++;
      continue;
    }

    let version = "*";

    if (valueStr && !valueStr.startsWith("#")) {
      // Inline version: pkg: ^1.0.0 or pkg: ">=1.0.0 <2.0.0"
      const inlineMatch = valueStr.match(/^['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/);
      if (inlineMatch) {
        version = inlineMatch[1]!.trim();
      }
    } else {
      // Block value — look for version in nested lines
      let j = i + 1;
      while (j < lines.length) {
        const nestedLine = lines[j]!;
        // If indentation drops back to 2 or less, we're out of this entry
        if (nestedLine.match(/^\S/) || nestedLine.match(/^ {2}\S/)) break;
        if (!nestedLine.trim() || nestedLine.trim().startsWith("#")) {
          j++;
          continue;
        }

        const versionMatch = nestedLine.match(
          /^\s+version\s*:\s*['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/,
        );
        if (versionMatch) {
          version = versionMatch[1]!.trim();
          break;
        }
        j++;
      }
    }

    deps.push({
      name,
      currentVersion: version,
      ecosystem: "pub",
      manifestPath,
      isDev,
      isOptional: false,
    });

    i++;
  }

  return deps;
};

export const dartParser: EcosystemParser = {
  ecosystem: "pub",
  manifestPatterns: ["pubspec.yaml"],

  async detectFiles(rootPath: string): Promise<readonly string[]> {
    return findFiles(rootPath, ["pubspec.yaml"]);
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
        const parsed = [
          ...parseDepsBlock(content, "dependencies", manifestPath, false),
          ...parseDepsBlock(content, "dev_dependencies", manifestPath, true),
          ...parseDepsBlock(
            content,
            "dependency_overrides",
            manifestPath,
            false,
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
    return buildImportPatterns("pub", dependencies);
  },
};
