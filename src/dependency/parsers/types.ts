import type { Dependency, Ecosystem } from "../types";
import { buildImportRegex } from "../usage/patterns";

export interface EcosystemParser {
  readonly ecosystem: Ecosystem;
  readonly manifestPatterns: readonly string[];

  /** Find all manifest files in the given directory tree. */
  detectFiles(rootPath: string): Promise<readonly string[]>;

  /** Parse dependencies from detected manifest files. */
  parseDependencies(
    manifestPaths: readonly string[],
  ): Promise<readonly Dependency[]>;

  /** Return regex patterns for matching imports of the given dependencies. Key = dep name. */
  getImportPatterns(dependencies: readonly Dependency[]): Map<string, RegExp>;
}

/**
 * Shared helper to build import-matching regex patterns for a list of dependencies.
 * Most parsers can delegate their getImportPatterns method to this function.
 */
export const buildImportPatterns = (
  ecosystem: Ecosystem,
  dependencies: readonly Dependency[],
): Map<string, RegExp> => {
  const patterns = new Map<string, RegExp>();
  const seen = new Set<string>();
  for (const dep of dependencies) {
    if (seen.has(dep.name)) continue;
    seen.add(dep.name);
    patterns.set(dep.name, buildImportRegex(ecosystem, dep.name));
  }
  return patterns;
};
