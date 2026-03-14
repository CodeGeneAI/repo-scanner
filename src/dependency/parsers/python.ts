import path from "path";
import type { Dependency } from "../types";
import { findFiles, readText } from "../utils/fs";
import { buildImportPatterns, type EcosystemParser } from "./types";

const MANIFEST_FILES = [
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "setup.cfg",
] as const;

/**
 * Parse a requirements.txt-style file.
 * Handles ==, >=, ~=, <=, !=, comments, blank lines, and -r includes.
 */
const parseRequirementsTxt = (
  content: string,
  manifestPath: string,
): Dependency[] => {
  const deps: Dependency[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (
      !line ||
      line.startsWith("#") ||
      line.startsWith("-r ") ||
      line.startsWith("--")
    ) {
      continue;
    }

    // Match: package[extras]>=version or package==version etc.
    const match = line.match(
      /^([A-Za-z0-9_][A-Za-z0-9._-]*)(?:\[.*?\])?\s*(?:(==|>=|~=|<=|!=|>|<)\s*([^\s;,#]+))?/,
    );
    if (!match) continue;

    deps.push({
      name: match[1]!,
      currentVersion: match[3] ?? "*",
      ecosystem: "pypi",
      manifestPath,
      isDev: false,
      isOptional: false,
    });
  }

  return deps;
};

/**
 * Parse pyproject.toml for [project.dependencies] and [tool.poetry.dependencies].
 */
const parsePyprojectToml = (
  content: string,
  manifestPath: string,
): Dependency[] => {
  const deps: Dependency[] = [];

  // Parse [project.dependencies] — array of requirement strings
  const projectDepsMatch = content.match(
    /\[project\]\s[\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/,
  );
  if (projectDepsMatch) {
    const block = projectDepsMatch[1]!;
    const lineRe =
      /["']([A-Za-z0-9_][A-Za-z0-9._-]*)(?:\[.*?\])?\s*(?:([><=!~]=?)\s*([^\s"',;]+))?["']/g;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(block)) !== null) {
      deps.push({
        name: m[1]!,
        currentVersion: m[3] ?? "*",
        ecosystem: "pypi",
        manifestPath,
        isDev: false,
        isOptional: false,
      });
    }
  }

  // Parse [project.optional-dependencies.*]
  const optDepsRe =
    /\[project\.optional-dependencies\.\w+\]\s*\n([\s\S]*?)(?=\n\[|$)/g;
  let optMatch: RegExpExecArray | null;
  while ((optMatch = optDepsRe.exec(content)) !== null) {
    const block = optMatch[1]!;
    const lineRe =
      /["']([A-Za-z0-9_][A-Za-z0-9._-]*)(?:\[.*?\])?\s*(?:([><=!~]=?)\s*([^\s"',;]+))?["']/g;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(block)) !== null) {
      deps.push({
        name: m[1]!,
        currentVersion: m[3] ?? "*",
        ecosystem: "pypi",
        manifestPath,
        isDev: true,
        isOptional: true,
      });
    }
  }

  // Parse [tool.poetry.dependencies] and [tool.poetry.dev-dependencies]
  const poetrySections = [
    {
      re: /\[tool\.poetry\.dependencies\]\s*\n([\s\S]*?)(?=\n\[|$)/,
      isDev: false,
    },
    {
      re: /\[tool\.poetry\.dev-dependencies\]\s*\n([\s\S]*?)(?=\n\[|$)/,
      isDev: true,
    },
    {
      re: /\[tool\.poetry\.group\.\w+\.dependencies\]\s*\n([\s\S]*?)(?=\n\[|$)/,
      isDev: true,
    },
  ];

  for (const { re, isDev } of poetrySections) {
    const sectionMatch = content.match(re);
    if (!sectionMatch) continue;

    const block = sectionMatch[1]!;
    const lineRe =
      /^([A-Za-z0-9_][A-Za-z0-9._-]*)\s*=\s*(?:"([^"]*)"|\{[^}]*version\s*=\s*"([^"]*)"[^}]*\})/gm;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(block)) !== null) {
      const name = m[1]!;
      if (name === "python") continue;
      deps.push({
        name,
        currentVersion: m[2] ?? m[3] ?? "*",
        ecosystem: "pypi",
        manifestPath,
        isDev,
        isOptional: false,
      });
    }
  }

  return deps;
};

/**
 * Parse Pipfile for [packages] and [dev-packages].
 */
const parsePipfile = (content: string, manifestPath: string): Dependency[] => {
  const deps: Dependency[] = [];
  const sections = [
    { re: /\[packages\]\s*\n([\s\S]*?)(?=\n\[|$)/, isDev: false },
    { re: /\[dev-packages\]\s*\n([\s\S]*?)(?=\n\[|$)/, isDev: true },
  ];

  for (const { re, isDev } of sections) {
    const sectionMatch = content.match(re);
    if (!sectionMatch) continue;

    const block = sectionMatch[1]!;
    const lineRe =
      /^([A-Za-z0-9_][A-Za-z0-9._-]*)\s*=\s*(?:"([^"]*)"|\{[^}]*version\s*=\s*"([^"]*)"[^}]*\}|"(\*)")/gm;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(block)) !== null) {
      deps.push({
        name: m[1]!,
        currentVersion: m[2] ?? m[3] ?? m[4] ?? "*",
        ecosystem: "pypi",
        manifestPath,
        isDev,
        isOptional: false,
      });
    }
  }

  return deps;
};

/**
 * Parse setup.cfg [options] install_requires.
 */
const parseSetupCfg = (content: string, manifestPath: string): Dependency[] => {
  const deps: Dependency[] = [];

  const optionsMatch = content.match(/\[options\]\s*\n([\s\S]*?)(?=\n\[|$)/);
  if (!optionsMatch) return deps;

  const installRequiresMatch = optionsMatch[1]!.match(
    /install_requires\s*=\s*\n((?:\s+[^\n]+\n?)*)/,
  );
  if (!installRequiresMatch) return deps;

  const block = installRequiresMatch[1]!;
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(
      /^([A-Za-z0-9_][A-Za-z0-9._-]*)(?:\[.*?\])?\s*(?:([><=!~]=?)\s*([^\s;,]+))?/,
    );
    if (!match) continue;

    deps.push({
      name: match[1]!,
      currentVersion: match[3] ?? "*",
      ecosystem: "pypi",
      manifestPath,
      isDev: false,
      isOptional: false,
    });
  }

  return deps;
};

export const pythonParser: EcosystemParser = {
  ecosystem: "pypi",
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

      const baseName = path.basename(manifestPath);
      let parsed: Dependency[] = [];

      try {
        if (baseName === "requirements.txt") {
          parsed = parseRequirementsTxt(content, manifestPath);
        } else if (baseName === "pyproject.toml") {
          parsed = parsePyprojectToml(content, manifestPath);
        } else if (baseName === "Pipfile") {
          parsed = parsePipfile(content, manifestPath);
        } else if (baseName === "setup.cfg") {
          parsed = parseSetupCfg(content, manifestPath);
        }
      } catch {
        // Skip malformed files
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
    return buildImportPatterns("pypi", dependencies);
  },
};
