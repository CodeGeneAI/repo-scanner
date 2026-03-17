import path from "path";
import type { FileIndex } from "../utils/file-index";
import { isSecondaryPath } from "../utils/file-index";
import { readJson } from "../utils/fs";
import { registerDetector } from "./registry";
import type { PackageJson } from "./shared";
import type { DetectorResult, Finding } from "./types";

interface BuildCheck {
  detect: (index: FileIndex) => boolean;
  name: string;
  evidence: string;
}

const BUILD_CHECKS: readonly BuildCheck[] = [
  {
    detect: (idx) => idx.hasFilePrimary("turbo.json"),
    name: "Turborepo",
    evidence: "turbo.json",
  },
  {
    detect: (idx) => idx.hasFilePrimary("nx.json"),
    name: "Nx",
    evidence: "nx.json",
  },
  {
    detect: (idx) => idx.hasFilePrimary("Makefile"),
    name: "Make",
    evidence: "Makefile",
  },
  {
    detect: (idx) => idx.hasFilePrimary("CMakeLists.txt"),
    name: "CMake",
    evidence: "CMakeLists.txt",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("BUILD") || idx.hasFilePrimary("BUILD.bazel"),
    name: "Bazel",
    evidence: "BUILD / BUILD.bazel",
  },
  {
    detect: (idx) => idx.hasFilePrimary("Taskfile.yml"),
    name: "Task",
    evidence: "Taskfile.yml",
  },
  {
    detect: (idx) => idx.hasFilePrimary("Rakefile"),
    name: "Rake",
    evidence: "Rakefile",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("build.gradle") ||
      idx.hasFilePrimary("build.gradle.kts"),
    name: "Gradle",
    evidence: "build.gradle / build.gradle.kts",
  },
  {
    detect: (idx) => idx.hasFilePrimary("pom.xml"),
    name: "Maven",
    evidence: "pom.xml",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            f.name.startsWith("vite.config.") &&
            !isSecondaryPath(f.relativePath),
        ),
    name: "Vite",
    evidence: "vite.config.*",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            f.name.startsWith("webpack.config.") &&
            !isSecondaryPath(f.relativePath),
        ),
    name: "Webpack",
    evidence: "webpack.config.*",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            f.name.startsWith("rollup.config.") &&
            !isSecondaryPath(f.relativePath),
        ),
    name: "Rollup",
    evidence: "rollup.config.*",
  },
  {
    detect: (idx) =>
      idx.getByExtensionPrimary(".csproj").length > 0 ||
      idx.getByExtensionPrimary(".sln").length > 0,
    name: "MSBuild",
    evidence: ".csproj / .sln files",
  },

  // Scala
  {
    detect: (idx) => idx.hasFilePrimary("build.sbt"),
    name: "SBT",
    evidence: "build.sbt",
  },

  // Rust
  {
    detect: (idx) => idx.hasFilePrimary("Cargo.toml"),
    name: "Cargo",
    evidence: "Cargo.toml",
  },

  // Go
  {
    detect: (idx) => idx.hasFilePrimary("go.mod"),
    name: "Go Build",
    evidence: "go.mod",
  },

  // Python
  {
    detect: (idx) =>
      idx.hasFilePrimary("setup.py") || idx.hasFilePrimary("setup.cfg"),
    name: "Setuptools",
    evidence: "setup.py / setup.cfg",
  },
  {
    detect: (idx) => idx.hasFilePrimary("pyproject.toml"),
    name: "pyproject.toml",
    evidence: "pyproject.toml",
  },

  // JS bundlers
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            f.name.startsWith("esbuild.") && !isSecondaryPath(f.relativePath),
        ) || idx.hasFilePrimary("esbuild.mjs"),
    name: "esbuild",
    evidence: "esbuild config",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            f.name.startsWith("tsup.config.") &&
            !isSecondaryPath(f.relativePath),
        ),
    name: "tsup",
    evidence: "tsup.config.*",
  },

  // C/C++
  {
    detect: (idx) => idx.hasFilePrimary("meson.build"),
    name: "Meson",
    evidence: "meson.build",
  },

  // Elixir
  {
    detect: (idx) => idx.hasFilePrimary("mix.exs"),
    name: "Mix",
    evidence: "mix.exs",
  },

  // Swift
  {
    detect: (idx) => idx.hasFilePrimary("Package.swift"),
    name: "Swift PM",
    evidence: "Package.swift",
  },

  // Dart/Flutter
  {
    detect: (idx) => idx.hasFilePrimary("pubspec.yaml"),
    name: "Pub",
    evidence: "pubspec.yaml",
  },

  // PHP
  {
    detect: (idx) => idx.hasFilePrimary("composer.json"),
    name: "Composer",
    evidence: "composer.json",
  },

  // Java (Ant)
  {
    detect: (idx) => idx.hasFilePrimary("build.xml"),
    name: "Ant",
    evidence: "build.xml",
  },

  // Just (polyglot)
  {
    detect: (idx) =>
      idx.hasFilePrimary("justfile") || idx.hasFilePrimary("Justfile"),
    name: "Just",
    evidence: "justfile / Justfile",
  },
];

/** Script keys that map to command categories. */
const SCRIPT_TO_CATEGORY: ReadonlyMap<string, "build" | "test" | "lint"> =
  new Map([
    ["build", "build"],
    ["test", "test"],
    ["test:unit", "test"],
    ["test:e2e", "test"],
    ["lint", "lint"],
    ["typecheck", "lint"],
  ]);

registerDetector({
  id: "build",
  async detect(rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const findings: Finding[] = [];

    // Detect build systems
    for (const check of BUILD_CHECKS) {
      if (check.detect(index)) {
        findings.push({
          value: check.name,
          confidence: 1.0,
          evidence: [check.evidence],
        });
      }
    }

    // Extract commands from root package.json
    const commands: {
      build: string[];
      test: string[];
      lint: string[];
    } = { build: [], test: [], lint: [] };

    const rootPkgPath = path.join(rootPath, "package.json");
    const rootPkg = await readJson<PackageJson>(rootPkgPath);

    if (rootPkg?.scripts) {
      for (const [scriptKey, category] of SCRIPT_TO_CATEGORY) {
        const scriptValue = rootPkg.scripts[scriptKey as string];
        if (scriptValue) {
          commands[category as "build" | "test" | "lint"].push(scriptValue);
        }
      }
    }

    const hasCommands =
      commands.build.length > 0 ||
      commands.test.length > 0 ||
      commands.lint.length > 0;

    return {
      detectorId: "build",
      findings,
      ...(hasCommands
        ? {
            commands: {
              ...(commands.build.length > 0 ? { build: commands.build } : {}),
              ...(commands.test.length > 0 ? { test: commands.test } : {}),
              ...(commands.lint.length > 0 ? { lint: commands.lint } : {}),
            },
          }
        : {}),
    };
  },
});
