import type { FileIndex } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import type { Finding } from "./types";

/** Shared package.json shape used by multiple detectors. */
export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  require?: Record<string, string>;
}

/** Creates the standard dedup-aware addFinding helper used by most detectors. */
export function createFindingAdder(): {
  seen: Set<string>;
  findings: Finding[];
  addFinding: (name: string, confidence: number, evidence: string) => void;
} {
  const seen = new Set<string>();
  const findings: Finding[] = [];

  const addFinding = (name: string, confidence: number, evidence: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    findings.push({ value: name, confidence, evidence: [evidence] });
  };

  return { seen, findings, addFinding };
}

/**
 * Scan named files for substring indicators from a map.
 * Used by testing, framework, and datastore detectors to check
 * build.gradle, pom.xml, CMakeLists.txt, etc.
 */
export async function scanFilesForIndicators(
  index: FileIndex,
  fileNames: readonly string[],
  indicatorMap: ReadonlyMap<string, string>,
  addFinding: (name: string, confidence: number, evidence: string) => void,
  confidence: number,
  evidencePrefix: string,
): Promise<void> {
  for (const fileName of fileNames) {
    for (const file of index.getByNamePrimary(fileName)) {
      const content = await readText(file.path);
      if (!content) continue;
      for (const [indicator, name] of indicatorMap) {
        if (content.includes(indicator)) {
          addFinding(
            name,
            confidence,
            `${evidencePrefix}: ${indicator} in ${file.relativePath}`,
          );
        }
      }
    }
  }
}

/**
 * Scan Python dependency files (pyproject.toml, requirements.txt) for
 * package names using word-boundary matching to avoid substring false positives.
 */
export async function scanPythonDeps(
  index: FileIndex,
  packageMap: ReadonlyMap<string, string>,
  addFinding: (name: string, confidence: number, evidence: string) => void,
  confidence: number,
): Promise<void> {
  for (const file of [
    ...index.getByNamePrimary("pyproject.toml"),
    ...index.getByNamePrimary("requirements.txt"),
  ]) {
    const content = await readText(file.path);
    if (!content) continue;
    for (const [pkg, name] of packageMap) {
      const regex = new RegExp(
        `(?:^|[^a-zA-Z0-9_-])${escapeRegex(pkg)}(?:[^a-zA-Z0-9_-]|$)`,
        "m",
      );
      if (regex.test(content)) {
        addFinding(
          name,
          confidence,
          `Python dep: ${pkg} in ${file.relativePath}`,
        );
      }
    }
  }
}

/**
 * Scan Gemfile for Ruby gem dependencies using quoted-string matching.
 */
export async function scanGemfile(
  index: FileIndex,
  gemMap: ReadonlyMap<string, string>,
  addFinding: (name: string, confidence: number, evidence: string) => void,
  confidence: number,
): Promise<void> {
  for (const gemfile of index.getByNamePrimary("Gemfile")) {
    const content = await readText(gemfile.path);
    if (!content) continue;
    for (const [gem, name] of gemMap) {
      if (content.includes(`'${gem}'`) || content.includes(`"${gem}"`)) {
        addFinding(name, confidence, `Gemfile contains ${gem}`);
      }
    }
  }
}

/**
 * Scan composer.json for PHP Composer dependencies.
 */
export async function scanComposerJson(
  index: FileIndex,
  packageMap: ReadonlyMap<string, string>,
  addFinding: (name: string, confidence: number, evidence: string) => void,
  confidence: number,
): Promise<void> {
  for (const composerFile of index.getByNamePrimary("composer.json")) {
    const pkg = await readJson<{ require?: Record<string, string> }>(
      composerFile.path,
    );
    if (!pkg?.require) continue;
    for (const depName of Object.keys(pkg.require)) {
      const name = packageMap.get(depName);
      if (name) {
        addFinding(
          name,
          confidence,
          `Composer dep: ${depName} in ${composerFile.relativePath}`,
        );
      }
    }
  }
}

/** Escape special regex characters in a string. */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
