/**
 * Dead dependency false-positive exclusion heuristics.
 *
 * When a dependency has zero import usages in source code, it may still be
 * legitimately used via tooling configs, CLI binaries, or type augmentation.
 * This module classifies such dependencies to reduce false positives in dead
 * dependency reporting.
 *
 * Design principles:
 * - Conservative: prefer reporting a false positive over hiding a genuinely dead dep.
 * - `@types/*` packages (npm) are ALWAYS excluded — they are never imported directly.
 * - All other exclusions require `isDev === true` — production deps with zero usages
 *   are always reported as dead regardless of name patterns.
 * - The `includeDevDeadDeps` flag bypasses ALL exclusions for full transparency.
 *
 * Coverage: all 11 ecosystems have heuristics. Ecosystems with fewer well-known
 * dev tooling packages have smaller exclusion sets.
 */
import type { Dependency, Ecosystem } from "../types";

export interface DeadDepExclusionResult {
  readonly excluded: boolean;
  readonly reason?:
    | "dev-tooling"
    | "types-package"
    | "plugin-preset"
    | "bin-only";
}

const NOT_EXCLUDED: DeadDepExclusionResult = { excluded: false };

// --- npm ---

const NPM_DEV_TOOLING = new Set([
  "typescript",
  "vitest",
  "jest",
  "mocha",
  "prettier",
  "eslint",
  "biome",
  "tsx",
  "ts-node",
  "nodemon",
  "husky",
  "lint-staged",
  "turbo",
  "lerna",
  "np",
  "semantic-release",
  "commitlint",
]);

const NPM_BIN_ONLY = new Set([
  "rimraf",
  "cross-env",
  "concurrently",
  "wait-on",
  "npm-run-all",
  "npm-run-all2",
  "shx",
]);

const NPM_PLUGIN_PREFIXES = [
  "@typescript-eslint/",
  "@babel/plugin-",
  "@babel/preset-",
  "eslint-plugin-",
  "eslint-config-",
  "babel-plugin-",
  "babel-preset-",
  "prettier-plugin-",
  "postcss-",
  "stylelint-",
  "webpack-plugin-",
  "webpack-loader-",
];

// --- pypi ---

const PYPI_DEV_TOOLING = new Set([
  "pytest",
  "flake8",
  "mypy",
  "black",
  "isort",
  "pylint",
  "tox",
  "nox",
  "sphinx",
  "setuptools",
  "wheel",
  "twine",
  "build",
  "ruff",
]);

const PYPI_PLUGIN_PREFIXES = [
  "pytest-",
  "flake8-",
  "pylint-",
  "sphinx-",
  "mypy-",
];

// --- cargo ---

const CARGO_DEV_TOOLING = new Set(["clippy", "rustfmt"]);

// --- rubygems ---

const RUBYGEMS_DEV_TOOLING = new Set([
  "rspec",
  "rubocop",
  "bundler",
  "rake",
  "minitest",
  "simplecov",
  "yard",
]);

const RUBYGEMS_PLUGIN_PREFIXES = ["rubocop-"];

// --- go ---

const GO_DEV_TOOLING = new Set([
  "golang.org/x/lint",
  "golang.org/x/tools",
  "honnef.co/go/tools",
]);

const GO_PLUGIN_PREFIXES = [
  "github.com/golangci/",
  "github.com/stretchr/testify",
];

// --- maven ---

const MAVEN_DEV_TOOLING = new Set([
  "junit",
  "org.junit.jupiter",
  "org.testng",
  "org.mockito",
  "org.assertj",
  "org.hamcrest",
  "org.jacoco",
  "com.google.errorprone",
  "org.projectlombok",
  "org.springframework.boot:spring-boot-devtools",
]);

const MAVEN_PLUGIN_PREFIXES = [
  "org.apache.maven.plugins:",
  "org.codehaus.mojo:",
];

// --- nuget ---

const NUGET_DEV_TOOLING = new Set([
  "xunit",
  "xunit.runner.visualstudio",
  "NUnit",
  "NUnit3TestAdapter",
  "MSTest.TestFramework",
  "MSTest.TestAdapter",
  "Moq",
  "FluentAssertions",
  "coverlet.collector",
  "Microsoft.NET.Test.Sdk",
]);

// --- packagist ---

const PACKAGIST_DEV_TOOLING = new Set([
  "phpunit/phpunit",
  "phpstan/phpstan",
  "squizlabs/php_codesniffer",
  "friendsofphp/php-cs-fixer",
  "vimeo/psalm",
  "mockery/mockery",
]);

const PACKAGIST_PLUGIN_PREFIXES = ["phpstan/", "slevomat/coding-standard"];

// --- cocoapods ---

const COCOAPODS_DEV_TOOLING = new Set([
  "Quick",
  "Nimble",
  "OHHTTPStubs",
  "SwiftLint",
]);

// --- pub (dart) ---

const PUB_DEV_TOOLING = new Set([
  "test",
  "flutter_test",
  "mockito",
  "build_runner",
  "flutter_lints",
  "lints",
  "very_good_analysis",
]);

// --- conan (C/C++) ---

const CONAN_DEV_TOOLING = new Set(["gtest", "catch2", "benchmark", "doctest"]);

// --- Per-ecosystem classifiers ---

const classifyNpm = (dep: Dependency): DeadDepExclusionResult => {
  // @types/* are always excluded (they're never imported directly)
  if (dep.name.startsWith("@types/")) {
    return { excluded: true, reason: "types-package" };
  }

  // Everything below requires isDev
  if (!dep.isDev) return NOT_EXCLUDED;

  for (const prefix of NPM_PLUGIN_PREFIXES) {
    if (dep.name.startsWith(prefix)) {
      return { excluded: true, reason: "plugin-preset" };
    }
  }

  if (NPM_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  if (NPM_BIN_ONLY.has(dep.name)) {
    return { excluded: true, reason: "bin-only" };
  }

  return NOT_EXCLUDED;
};

const classifyPypi = (dep: Dependency): DeadDepExclusionResult => {
  if (!dep.isDev) return NOT_EXCLUDED;

  for (const prefix of PYPI_PLUGIN_PREFIXES) {
    if (dep.name.startsWith(prefix)) {
      return { excluded: true, reason: "plugin-preset" };
    }
  }

  if (PYPI_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  return NOT_EXCLUDED;
};

const classifyCargo = (dep: Dependency): DeadDepExclusionResult => {
  if (!dep.isDev) return NOT_EXCLUDED;

  if (CARGO_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  return NOT_EXCLUDED;
};

const classifyRubygems = (dep: Dependency): DeadDepExclusionResult => {
  if (!dep.isDev) return NOT_EXCLUDED;

  for (const prefix of RUBYGEMS_PLUGIN_PREFIXES) {
    if (dep.name.startsWith(prefix)) {
      return { excluded: true, reason: "plugin-preset" };
    }
  }

  if (RUBYGEMS_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  return NOT_EXCLUDED;
};

const classifyGo = (dep: Dependency): DeadDepExclusionResult => {
  if (!dep.isDev) return NOT_EXCLUDED;

  for (const prefix of GO_PLUGIN_PREFIXES) {
    if (dep.name.startsWith(prefix)) {
      return { excluded: true, reason: "plugin-preset" };
    }
  }

  if (GO_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  return NOT_EXCLUDED;
};

const classifyMaven = (dep: Dependency): DeadDepExclusionResult => {
  if (!dep.isDev) return NOT_EXCLUDED;

  for (const prefix of MAVEN_PLUGIN_PREFIXES) {
    if (dep.name.startsWith(prefix)) {
      return { excluded: true, reason: "plugin-preset" };
    }
  }

  if (MAVEN_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  return NOT_EXCLUDED;
};

const classifyNuget = (dep: Dependency): DeadDepExclusionResult => {
  if (!dep.isDev) return NOT_EXCLUDED;

  if (NUGET_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  return NOT_EXCLUDED;
};

const classifyPackagist = (dep: Dependency): DeadDepExclusionResult => {
  if (!dep.isDev) return NOT_EXCLUDED;

  for (const prefix of PACKAGIST_PLUGIN_PREFIXES) {
    if (dep.name.startsWith(prefix)) {
      return { excluded: true, reason: "plugin-preset" };
    }
  }

  if (PACKAGIST_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  return NOT_EXCLUDED;
};

const classifyCocoapods = (dep: Dependency): DeadDepExclusionResult => {
  if (!dep.isDev) return NOT_EXCLUDED;

  if (COCOAPODS_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  return NOT_EXCLUDED;
};

const classifyPub = (dep: Dependency): DeadDepExclusionResult => {
  if (!dep.isDev) return NOT_EXCLUDED;

  if (PUB_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  return NOT_EXCLUDED;
};

const classifyConan = (dep: Dependency): DeadDepExclusionResult => {
  if (!dep.isDev) return NOT_EXCLUDED;

  if (CONAN_DEV_TOOLING.has(dep.name)) {
    return { excluded: true, reason: "dev-tooling" };
  }

  return NOT_EXCLUDED;
};

/**
 * Classify whether a dependency with zero import usages should be excluded
 * from dead dependency reporting (i.e., it's an expected false positive).
 *
 * When `includeDevDeadDeps` is true, all exclusions are bypassed.
 */
export const classifyExclusion = (
  dependency: Dependency,
  ecosystem: Ecosystem,
  includeDevDeadDeps: boolean,
): DeadDepExclusionResult => {
  if (includeDevDeadDeps) return NOT_EXCLUDED;

  switch (ecosystem) {
    case "npm":
      return classifyNpm(dependency);
    case "pypi":
      return classifyPypi(dependency);
    case "cargo":
      return classifyCargo(dependency);
    case "rubygems":
      return classifyRubygems(dependency);
    case "go":
      return classifyGo(dependency);
    case "maven":
      return classifyMaven(dependency);
    case "nuget":
      return classifyNuget(dependency);
    case "packagist":
      return classifyPackagist(dependency);
    case "cocoapods":
      return classifyCocoapods(dependency);
    case "pub":
      return classifyPub(dependency);
    case "conan":
      return classifyConan(dependency);
  }
};
