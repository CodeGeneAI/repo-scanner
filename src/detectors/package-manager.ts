import type { FileIndex } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
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

/** Regex matching any [tool.uv] or [tool.uv.<subtable>] header in pyproject.toml.
 *  C3 fix: broadened from /\[tool\.uv(?:\.workspace)?\]/ to cover [tool.uv.sources],
 *  [tool.uv.dev-dependencies], etc. */
const PY_UV_RE = /\[tool\.uv(?:\.[a-zA-Z][a-zA-Z0-9_-]*)?\]/;

const MANIFEST_RULES: readonly ManifestRule[] = [
  // Python: content-aware (no bare-pyproject false positives).
  {
    file: "pyproject.toml",
    match: (c) => /\[tool\.poetry\]/.test(c),
    name: "Poetry",
  },
  {
    file: "pyproject.toml",
    match: (c) => PY_UV_RE.test(c),
    name: "uv",
  },
  {
    file: "pyproject.toml",
    match: (c) => /\[tool\.pipenv\]/.test(c),
    name: "Pipenv",
  },
  { file: "Pipfile", name: "Pipenv" },
  // C4 fix: pnpm-workspace.yaml presence → pnpm.
  { file: "pnpm-workspace.yaml", name: "pnpm" },
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

/** C2 fix: Corepack-style packageManager field name → display name mapping. */
const NPM_PACKAGE_MANAGER_FIELDS: ReadonlyMap<string, string> = new Map([
  ["npm", "npm"],
  ["pnpm", "pnpm"],
  ["yarn", "Yarn"],
  ["bun", "Bun"],
]);

/** Returns the directory portion of a relative path (repo-root-relative).
 *  e.g. "services/api/pyproject.toml" → "services/api"
 *       "requirements.txt" → "." */
const dirOf = (rel: string): string => {
  const i = rel.lastIndexOf("/");
  return i < 0 ? "." : rel.slice(0, i);
};

registerDetector({
  id: "packageManager",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const { findings, addFinding } = createFindingAdder();

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

    // 4. C2 fix: package.json#packageManager field (Corepack syntax: <name>@<version>).
    //    Reports JS PM even when no lockfile is committed.
    for (const pkgFile of index.getByNamePrimary("package.json")) {
      const pkg = await readJson<{ packageManager?: string }>(pkgFile.path);
      const declared = pkg?.packageManager;
      if (!declared) continue;
      const [name] = declared.split("@", 2);
      const display = name
        ? NPM_PACKAGE_MANAGER_FIELDS.get(name.toLowerCase())
        : undefined;
      if (display) {
        addFinding(
          display,
          0.7,
          `manifest: ${pkgFile.relativePath} packageManager=${declared}`,
        );
      }
    }

    // 5. C1 fix: requirements.txt → pip, scoped per-component.
    //    Pip is suppressed only when a stronger Python signal (Poetry/uv/Pipenv) lives
    //    in the same directory or an ancestor directory of the requirements file.
    //    This allows a monorepo where one component uses Poetry and another uses pip.
    const pythonSignalDirs = new Set<string>();

    for (const f of index.getByNamePrimary("uv.lock"))
      pythonSignalDirs.add(dirOf(f.relativePath));
    for (const f of index.getByNamePrimary("poetry.lock"))
      pythonSignalDirs.add(dirOf(f.relativePath));
    for (const f of index.getByNamePrimary("Pipfile.lock"))
      pythonSignalDirs.add(dirOf(f.relativePath));
    for (const f of index.getByNamePrimary("Pipfile"))
      pythonSignalDirs.add(dirOf(f.relativePath));
    for (const f of index.getByNamePrimary("pyproject.toml")) {
      const content = await readText(f.path);
      if (!content) continue;
      if (
        /\[tool\.poetry\]/.test(content) ||
        PY_UV_RE.test(content) ||
        /\[tool\.pipenv\]/.test(content)
      ) {
        pythonSignalDirs.add(dirOf(f.relativePath));
      }
    }

    const isCoveredByPythonSignal = (reqPath: string): boolean => {
      let dir = dirOf(reqPath);
      while (true) {
        if (pythonSignalDirs.has(dir)) return true;
        if (dir === "." || dir === "") return false;
        const next = dir.includes("/")
          ? dir.slice(0, dir.lastIndexOf("/"))
          : ".";
        if (next === dir) return false;
        dir = next;
      }
    };

    for (const req of index.getByNamePrimary("requirements.txt")) {
      if (isCoveredByPythonSignal(req.relativePath)) continue;
      addFinding("pip", 0.7, `manifest: ${req.relativePath}`);
    }

    return {
      detectorId: "packageManager",
      findings,
    };
  },
});
