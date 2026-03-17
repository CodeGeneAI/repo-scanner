import type { FileIndex } from "../utils/file-index";
import { isSecondaryPath } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import {
  createFindingAdder,
  type PackageJson,
  scanFilesForIndicators,
  scanGemfile,
} from "./shared";
import type { DetectorResult } from "./types";

/** Config file patterns → testing framework name. */
const CONFIG_PREFIXES: readonly { prefix: string; name: string }[] = [
  { prefix: "vitest.config.", name: "Vitest" },
  { prefix: "jest.config.", name: "Jest" },
  { prefix: "playwright.config.", name: "Playwright" },
  { prefix: "cypress.config.", name: "Cypress" },
  { prefix: ".mocharc.", name: "Mocha" },
];

/** Exact config file → testing framework name. */
const EXACT_CONFIG_MAP: ReadonlyMap<string, string> = new Map([
  ["conftest.py", "pytest"],
  [".rspec", "RSpec"],
  ["phpunit.xml", "PHPUnit"],
  ["phpunit.xml.dist", "PHPUnit"],
]);

/** npm devDependency → testing framework name. */
const NPM_TEST_MAP: ReadonlyMap<string, string> = new Map([
  ["vitest", "Vitest"],
  ["jest", "Jest"],
  ["playwright", "Playwright"],
  ["@playwright/test", "Playwright"],
  ["cypress", "Cypress"],
  ["mocha", "Mocha"],
  ["jasmine", "Jasmine"],
  ["ava", "Ava"],
  ["tap", "Tap"],
]);

/** .NET test framework indicators in .csproj files. */
const DOTNET_TEST_MAP: ReadonlyMap<string, string> = new Map([
  ["xunit", "xUnit"],
  ["nunit", "NUnit"],
  ["MSTest.TestAdapter", "MSTest"],
  ["MSTest.TestFramework", "MSTest"],
]);

/** Gradle/Maven dependency indicators → JVM test framework name. */
const JVM_TEST_MAP: ReadonlyMap<string, string> = new Map([
  ["junit-jupiter", "JUnit 5"],
  ["org.junit.jupiter", "JUnit 5"],
  ["junit-jupiter-api", "JUnit 5"],
  ["junit:junit", "JUnit 4"],
  ["junit</artifactId>", "JUnit 4"],
  ["org.testng", "TestNG"],
  ["io.kotest", "Kotest"],
  ["org.scalatest", "ScalaTest"],
  ["org.specs2", "specs2"],
]);

/** Scala build.sbt indicators → test framework name. */
const SBT_TEST_MAP: ReadonlyMap<string, string> = new Map([
  ["scalatest", "ScalaTest"],
  ["specs2", "specs2"],
]);

/** Ruby Gemfile gems → test framework name. */
const RUBY_TEST_MAP: ReadonlyMap<string, string> = new Map([
  ["cucumber", "Cucumber"],
  ["minitest", "Minitest"],
]);

/** CMake indicators → C/C++ test framework name. */
const CMAKE_TEST_MAP: ReadonlyMap<string, string> = new Map([
  ["GTest", "Google Test"],
  ["gtest", "Google Test"],
  ["Catch2", "Catch2"],
  ["CppUnit", "CppUnit"],
]);

/** vcpkg.json dependency name → C/C++ test framework name. */
const VCPKG_TEST_MAP: ReadonlyMap<string, string> = new Map([
  ["gtest", "Google Test"],
  ["googletest", "Google Test"],
  ["catch2", "Catch2"],
  ["cppunit", "CppUnit"],
]);

/** Conan dependency indicators → C/C++ test framework name. */
const CONAN_TEST_MAP: ReadonlyMap<string, string> = new Map([
  ["gtest", "Google Test"],
  ["googletest", "Google Test"],
  ["catch2", "Catch2"],
]);

/** Max test files to sample for bun:test import detection. */
const BUN_TEST_SAMPLE_LIMIT = 5;

/** Max .rs files to sample for #[test] attribute detection. */
const RUST_TEST_SAMPLE_LIMIT = 10;

registerDetector({
  id: "testing",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const { seen, findings, addFinding } = createFindingAdder();

    // Check config file prefixes (vitest.config.*, jest.config.*, etc.)
    const allFiles = index.all();
    for (const entry of CONFIG_PREFIXES) {
      for (const file of allFiles) {
        if (
          file.name.startsWith(entry.prefix) &&
          !isSecondaryPath(file.relativePath)
        ) {
          addFinding(entry.name, 1.0, `config file: ${file.name}`);
          break;
        }
      }
    }

    // Check exact config files
    for (const [fileName, framework] of EXACT_CONFIG_MAP) {
      if (index.hasFilePrimary(fileName)) {
        addFinding(framework, 1.0, `config file: ${fileName}`);
      }
    }

    // Check *_test.go files for Go testing
    const goFiles = index.getByExtensionPrimary(".go");
    if (goFiles.some((f) => f.name.endsWith("_test.go"))) {
      addFinding("Go testing", 1.0, "*_test.go files found");
    }

    // Check devDependencies in primary package.json files
    for (const pkgFile of index.getByNamePrimary("package.json")) {
      const pkg = await readJson<PackageJson>(pkgFile.path);
      if (!pkg?.devDependencies) continue;

      for (const depName of Object.keys(pkg.devDependencies)) {
        const framework = NPM_TEST_MAP.get(depName);
        if (framework) {
          addFinding(
            framework,
            0.95,
            `devDependency: ${depName} in ${pkgFile.relativePath}`,
          );
        }
      }
    }

    // Check .csproj files for .NET test frameworks (primary only)
    for (const csprojFile of index.getByExtensionPrimary(".csproj")) {
      const content = await readText(csprojFile.path);
      if (!content) continue;

      for (const [indicator, framework] of DOTNET_TEST_MAP) {
        if (content.includes(indicator)) {
          addFinding(
            framework,
            0.95,
            `.NET test framework: ${indicator} in ${csprojFile.relativePath}`,
          );
        }
      }
    }

    // Bun test runner
    for (const bunfig of index.getByNamePrimary("bunfig.toml")) {
      const content = await readText(bunfig.path);
      if (content?.includes("[test]")) {
        addFinding("Bun Test", 1.0, `[test] section in ${bunfig.relativePath}`);
      }
    }
    if (!seen.has("Bun Test")) {
      const testFiles = allFiles.filter(
        (f) =>
          (f.name.includes(".test.") || f.name.includes(".spec.")) &&
          (f.ext === ".ts" ||
            f.ext === ".js" ||
            f.ext === ".tsx" ||
            f.ext === ".jsx"),
      );
      for (const tf of testFiles.slice(0, BUN_TEST_SAMPLE_LIMIT)) {
        const content = await readText(tf.path);
        if (content?.includes("bun:test")) {
          addFinding(
            "Bun Test",
            0.95,
            `import from "bun:test" in ${tf.relativePath}`,
          );
          break;
        }
      }
    }

    // Check build.gradle / build.gradle.kts / pom.xml for JVM test frameworks
    await scanFilesForIndicators(
      index,
      ["build.gradle", "build.gradle.kts", "pom.xml"],
      JVM_TEST_MAP,
      addFinding,
      0.95,
      "JVM dep",
    );

    // Check build.sbt for Scala test frameworks
    await scanFilesForIndicators(
      index,
      ["build.sbt"],
      SBT_TEST_MAP,
      addFinding,
      0.95,
      "SBT dep",
    );

    // Check CMakeLists.txt for C/C++ test frameworks
    await scanFilesForIndicators(
      index,
      ["CMakeLists.txt"],
      CMAKE_TEST_MAP,
      addFinding,
      0.95,
      "CMake reference",
    );

    // Check vcpkg.json for C/C++ test deps
    for (const vcpkgFile of index.getByNamePrimary("vcpkg.json")) {
      const json = await readJson<{
        dependencies?: (string | { name: string })[];
      }>(vcpkgFile.path);
      if (!json?.dependencies) continue;
      for (const dep of json.dependencies) {
        const depName = typeof dep === "string" ? dep : dep.name;
        const framework = VCPKG_TEST_MAP.get(depName);
        if (framework) {
          addFinding(framework, 0.95, `vcpkg dep: ${depName}`);
        }
      }
    }

    // Check conanfile.txt / conanfile.py for C/C++ test deps
    await scanFilesForIndicators(
      index,
      ["conanfile.txt", "conanfile.py"],
      CONAN_TEST_MAP,
      addFinding,
      0.95,
      "Conan",
    );

    // Check Gemfile for Ruby test gems
    await scanGemfile(index, RUBY_TEST_MAP, addFinding, 0.95);

    // Check for Cucumber .feature files
    const featureFiles = index.getByExtensionPrimary(".feature");
    if (featureFiles.length > 0) {
      addFinding(
        "Cucumber",
        0.9,
        `${featureFiles.length} .feature file(s) found`,
      );
    }

    // Rust: built-in test framework via #[test] or #[cfg(test)]
    const rsFiles = index.getByExtensionPrimary(".rs");
    for (const rsFile of rsFiles.slice(0, RUST_TEST_SAMPLE_LIMIT)) {
      const content = await readText(rsFile.path);
      if (
        content &&
        (/#\[test\]/.test(content) || /#\[cfg\(test\)\]/.test(content))
      ) {
        addFinding(
          "Cargo Test",
          0.9,
          `#[test] or #[cfg(test)] in ${rsFile.relativePath}`,
        );
        break;
      }
    }

    // Swift: XCTest via Package.swift or *Tests.swift files
    for (const swiftPkg of index.getByNamePrimary("Package.swift")) {
      const content = await readText(swiftPkg.path);
      if (content?.includes(".testTarget")) {
        addFinding("XCTest", 0.95, `.testTarget in ${swiftPkg.relativePath}`);
      }
    }
    if (!seen.has("XCTest")) {
      const swiftFiles = index.getByExtensionPrimary(".swift");
      if (swiftFiles.some((f) => f.name.endsWith("Tests.swift"))) {
        addFinding("XCTest", 0.8, "*Tests.swift files found");
      }
    }

    // Elixir: ExUnit via *_test.exs files
    const exsFiles = index.getByExtensionPrimary(".exs");
    if (exsFiles.some((f) => f.name.endsWith("_test.exs"))) {
      addFinding("ExUnit", 0.9, "*_test.exs files found");
    }

    // Dart: flutter_test / test package via pubspec.yaml
    for (const pubspec of index.getByNamePrimary("pubspec.yaml")) {
      const content = await readText(pubspec.path);
      if (!content) continue;
      if (content.includes("flutter_test")) {
        addFinding(
          "Flutter Test",
          0.95,
          `flutter_test in ${pubspec.relativePath}`,
        );
      } else if (content.includes("test:") || content.includes("test_api:")) {
        addFinding("Dart Test", 0.9, `test package in ${pubspec.relativePath}`);
      }
    }

    // Check for test file patterns (for hasTests signal only)
    let hasTestFiles = false;
    for (const file of allFiles) {
      const name = file.name;
      if (
        name.includes(".test.") ||
        name.includes(".spec.") ||
        name.endsWith("_test.go") ||
        (name.startsWith("test_") && file.ext === ".py") ||
        name.endsWith("_test.py") ||
        name.endsWith("_test.exs") ||
        name.endsWith("Tests.swift") ||
        name.endsWith("Test.java") ||
        name.endsWith("Test.kt") ||
        name.endsWith("Test.scala") ||
        name.endsWith("Spec.scala") ||
        file.ext === ".feature" ||
        name.endsWith("_spec.rb") ||
        name.endsWith("_test.rb")
      ) {
        hasTestFiles = true;
        break;
      }
    }

    return {
      detectorId: "testing",
      findings,
      signals: { hasTests: findings.length > 0 || hasTestFiles },
    };
  },
});
