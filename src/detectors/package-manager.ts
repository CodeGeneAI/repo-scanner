import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { registerDetector } from "./registry";
import { createFindingAdder } from "./shared";
import type { DetectorResult } from "./types";

/** Lockfile name → display name. Presence alone is sufficient signal. */
const LOCKFILE_RULES: ReadonlyMap<string, string> = new Map([
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "Yarn"],
  ["bun.lock", "Bun"],
  ["bun.lockb", "Bun"],
  ["Pipfile.lock", "Pipenv"],
  ["poetry.lock", "Poetry"],
  ["uv.lock", "uv"],
  ["Cargo.lock", "Cargo"],
  ["go.sum", "Go modules"],
  ["Gemfile.lock", "Bundler"],
  ["composer.lock", "Composer"],
  ["packages.lock.json", "NuGet"],
  ["pubspec.lock", "pub"],
  ["gradle.lockfile", "Gradle"],
  ["mix.lock", "Mix"],
  ["stack.yaml.lock", "Stack"],
  ["cabal.project.freeze", "Cabal"],
  ["Package.resolved", "Swift Package Manager"],
]);

/** Manifest rules: filename + optional content matcher → display name.
 *  These run after lockfile rules; createFindingAdder dedups by name. */
type ManifestRule = {
  readonly file: string;
  readonly match?: (content: string) => boolean;
  readonly name: string;
};

const MANIFEST_RULES: readonly ManifestRule[] = [
  // Python: content-aware (no bare-pyproject false positives).
  {
    file: "pyproject.toml",
    match: (c) => /\[tool\.poetry\]/.test(c),
    name: "Poetry",
  },
  {
    file: "pyproject.toml",
    match: (c) => /\[tool\.uv(?:\.workspace)?\]/.test(c),
    name: "uv",
  },
  {
    file: "pyproject.toml",
    match: (c) => /\[tool\.pipenv\]/.test(c),
    name: "Pipenv",
  },
  { file: "Pipfile", name: "Pipenv" },
  // Non-Python manifests with no lockfile of their own.
  { file: "Cargo.toml", name: "Cargo" },
  { file: "go.mod", name: "Go modules" },
  { file: "pubspec.yaml", name: "pub" },
  { file: "Gemfile", name: "Bundler" },
  { file: "composer.json", name: "Composer" },
  { file: "pom.xml", name: "Maven" },
  { file: "build.gradle", name: "Gradle" },
  { file: "build.gradle.kts", name: "Gradle" },
  { file: "build.sbt", name: "sbt" },
  { file: "mix.exs", name: "Mix" },
  { file: "stack.yaml", name: "Stack" },
  { file: "cabal.project", name: "Cabal" },
  { file: "Package.swift", name: "Swift Package Manager" },
  { file: "packages.config", name: "NuGet" },
];

/** Manifest extensions: extension → display name. Used for *.cabal, *.csproj, etc. */
const MANIFEST_EXT_RULES: ReadonlyMap<string, string> = new Map([
  [".cabal", "Cabal"],
  [".csproj", "NuGet"],
  [".fsproj", "NuGet"],
  [".vbproj", "NuGet"],
]);

/** Python-PM names: if any of these were already found, suppress 'pip' from requirements.txt. */
const PYTHON_PM_NAMES = new Set(["Poetry", "uv", "Pipenv"]);

registerDetector({
  id: "packageManager",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const { findings, addFinding, seen } = createFindingAdder();

    // 1. Lockfiles first (presence-based, confidence 1.0).
    for (const [fileName, pmName] of LOCKFILE_RULES) {
      for (const file of index.getByNamePrimary(fileName)) {
        addFinding(pmName, 1.0, `lockfile: ${file.relativePath}`);
      }
    }

    // 2. Exact-name manifest fallback (confidence 0.7), with optional content matcher.
    for (const rule of MANIFEST_RULES) {
      const files = index.getByNamePrimary(rule.file);
      for (const file of files) {
        if (rule.match) {
          const content = await readText(file.path);
          if (!content || !rule.match(content)) continue;
        }
        addFinding(rule.name, 0.7, `manifest: ${file.relativePath}`);
      }
    }

    // 3. Extension-based manifest fallback (*.cabal, *.csproj, etc.).
    for (const [ext, pmName] of MANIFEST_EXT_RULES) {
      const files = index.getByExtensionPrimary(ext);
      if (files.length > 0) {
        addFinding(pmName, 0.7, `manifest: ${files[0]!.relativePath}`);
      }
    }

    // 4. requirements.txt → pip, ONLY if no stronger Python signal already present.
    const pythonSignalPresent =
      [...seen].some((n) => PYTHON_PM_NAMES.has(n)) ||
      index.getByNamePrimary("uv.lock").length > 0 ||
      index.getByNamePrimary("poetry.lock").length > 0 ||
      index.getByNamePrimary("Pipfile.lock").length > 0;
    if (!pythonSignalPresent) {
      const reqs = index.getByNamePrimary("requirements.txt");
      if (reqs.length > 0) {
        addFinding("pip", 0.7, `manifest: ${reqs[0]!.relativePath}`);
      }
    }

    return {
      detectorId: "packageManager",
      findings,
    };
  },
});
