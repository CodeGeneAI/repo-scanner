import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

/** Lockfile → package manager (high confidence). */
const LOCKFILE_TO_MANAGER: ReadonlyMap<string, string> = new Map([
  ["bun.lock", "Bun"],
  ["bun.lockb", "Bun"],
  ["yarn.lock", "Yarn"],
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["Cargo.lock", "Cargo"],
  ["go.sum", "Go Modules"],
  ["poetry.lock", "Poetry"],
  ["Pipfile.lock", "Pipenv"],
  ["Gemfile.lock", "Bundler"],
  ["composer.lock", "Composer"],
  ["pubspec.lock", "Pub (Dart)"],
  ["Package.resolved", "Swift PM"],
  ["mix.lock", "Mix (Elixir)"],
  ["uv.lock", "uv"],
  ["packages.lock.json", "NuGet"],
  ["Berksfile.lock", "Berkshelf"],
  ["conan.lock", "Conan"],
]);

/** JS package managers — mutually exclusive group (lockfile wins). */
const JS_MANAGERS = new Set(["Bun", "Yarn", "pnpm", "npm"]);

/** Manifest → package manager (lower confidence, no lockfile). */
const MANIFEST_TO_MANAGER: ReadonlyMap<string, string> = new Map([
  ["package.json", "npm"],
  ["Cargo.toml", "Cargo"],
  ["go.mod", "Go Modules"],
  ["pyproject.toml", "Python"],
  ["requirements.txt", "pip"],
  ["setup.py", "pip"],
  ["Gemfile", "Bundler"],
  ["composer.json", "Composer"],
  ["pubspec.yaml", "Pub (Dart)"],
  ["build.gradle", "Gradle"],
  ["build.gradle.kts", "Gradle"],
  ["pom.xml", "Maven"],
  ["Package.swift", "Swift PM"],
  ["mix.exs", "Mix (Elixir)"],
  ["build.sbt", "SBT"],
  ["conanfile.txt", "Conan"],
  ["conanfile.py", "Conan"],
  ["vcpkg.json", "vcpkg"],
  ["environment.yml", "Conda"],
  ["environment.yaml", "Conda"],
]);

registerDetector({
  id: "dependency-manager",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const seen = new Set<string>();
    const findings: Finding[] = [];

    // Check lockfiles first (higher confidence), primary paths only
    for (const [fileName, manager] of LOCKFILE_TO_MANAGER) {
      if (index.hasFilePrimary(fileName)) {
        seen.add(manager);
        findings.push({
          value: manager,
          confidence: 1.0,
          evidence: [`lockfile: ${fileName}`],
        });
      }
    }

    // Check if ANY JS lockfile exists in primary paths
    const JS_LOCKFILES = [
      "bun.lock",
      "bun.lockb",
      "yarn.lock",
      "pnpm-lock.yaml",
      "package-lock.json",
    ];
    const hasJsLockfile = JS_LOCKFILES.some((f) => index.hasFilePrimary(f));

    // Check manifests for managers not already found via lockfile (primary paths only)
    for (const [fileName, manager] of MANIFEST_TO_MANAGER) {
      if (seen.has(manager)) continue;
      // Skip all JS manifest-based detection if any JS lockfile exists
      if (JS_MANAGERS.has(manager) && hasJsLockfile) continue;
      if (index.hasFilePrimary(fileName)) {
        seen.add(manager);
        findings.push({
          value: manager,
          confidence: 0.7,
          evidence: [`manifest: ${fileName}`],
        });
      }
    }

    // NuGet via .csproj presence (if not already detected via lockfile)
    if (
      !seen.has("NuGet") &&
      index.getByExtensionPrimary(".csproj").length > 0
    ) {
      findings.push({
        value: "NuGet",
        confidence: 0.8,
        evidence: [".csproj files found"],
      });
    }

    // Maturin detection via pyproject.toml build-system
    if (!seen.has("maturin")) {
      for (const pyproject of index.getByNamePrimary("pyproject.toml")) {
        const content = await readText(pyproject.path);
        if (content?.includes("maturin")) {
          seen.add("maturin");
          findings.push({
            value: "maturin",
            confidence: 0.95,
            evidence: [`maturin in ${pyproject.relativePath}`],
          });
          break;
        }
      }
    }

    // Gradle Wrapper detection
    if (
      seen.has("Gradle") &&
      (index.hasFilePrimary("gradlew") || index.hasFilePrimary("gradlew.bat"))
    ) {
      const existing = findings.find((f) => f.value === "Gradle");
      if (existing) {
        const idx = findings.indexOf(existing);
        findings[idx] = {
          ...existing,
          evidence: [...existing.evidence, "Gradle Wrapper (gradlew)"],
        };
      }
    }

    // Maven Wrapper detection
    if (
      seen.has("Maven") &&
      (index.hasFilePrimary("mvnw") || index.hasFilePrimary("mvnw.cmd"))
    ) {
      const existing = findings.find((f) => f.value === "Maven");
      if (existing) {
        const idx = findings.indexOf(existing);
        findings[idx] = {
          ...existing,
          evidence: [...existing.evidence, "Maven Wrapper (mvnw)"],
        };
      }
    }

    return { detectorId: "dependency-manager", findings };
  },
});
