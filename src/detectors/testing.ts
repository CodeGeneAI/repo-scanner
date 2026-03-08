import type { FileIndex } from "../utils/file-index";
import { isSecondaryPath } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface PackageJson {
  devDependencies?: Record<string, string>;
}

/** Config file patterns → testing framework name. */
const CONFIG_PREFIXES: readonly { prefix: string; name: string }[] = [
  { prefix: "vitest.config.", name: "Vitest" },
  { prefix: "jest.config.", name: "Jest" },
  { prefix: "playwright.config.", name: "Playwright" },
  { prefix: "cypress.config.", name: "Cypress" },
];

/** Exact config file → testing framework name. */
const EXACT_CONFIG_FILES: ReadonlyMap<string, string> = new Map([
  ["conftest.py", "pytest"],
  [".rspec", "RSpec"],
  ["phpunit.xml", "PHPUnit"],
]);

/** npm devDependency → testing framework name. */
const NPM_TEST_DEPS: ReadonlyMap<string, string> = new Map([
  ["vitest", "Vitest"],
  ["jest", "Jest"],
  ["playwright", "Playwright"],
  ["@playwright/test", "Playwright"],
  ["cypress", "Cypress"],
  ["mocha", "Mocha"],
  ["jasmine", "Jasmine"],
]);

/** .NET test framework indicators in .csproj files. */
const DOTNET_TEST_FRAMEWORKS: ReadonlyMap<string, string> = new Map([
  ["xunit", "xUnit"],
  ["nunit", "NUnit"],
  ["MSTest.TestAdapter", "MSTest"],
  ["MSTest.TestFramework", "MSTest"],
]);

registerDetector({
  id: "testing",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const seen = new Set<string>();
    const findings: Finding[] = [];

    const addFinding = (name: string, confidence: number, evidence: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      findings.push({ value: name, confidence, evidence: [evidence] });
    };

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
    for (const [fileName, framework] of EXACT_CONFIG_FILES) {
      if (index.hasFilePrimary(fileName)) {
        addFinding(framework, 1.0, `config file: ${fileName}`);
      }
    }

    // Check *_test.go files for Go testing
    const goFiles = index.getByExtension(".go");
    if (goFiles.some((f) => f.name.endsWith("_test.go"))) {
      addFinding("Go testing", 1.0, "*_test.go files found");
    }

    // Check devDependencies in primary package.json files
    for (const pkgFile of index.getByNamePrimary("package.json")) {
      const pkg = await readJson<PackageJson>(pkgFile.path);
      if (!pkg?.devDependencies) continue;

      for (const depName of Object.keys(pkg.devDependencies)) {
        const framework = NPM_TEST_DEPS.get(depName);
        if (framework) {
          addFinding(
            framework,
            0.95,
            `devDependency: ${depName} in ${pkgFile.relativePath}`,
          );
        }
      }
    }

    // Check .csproj files for .NET test frameworks
    for (const csprojFile of index.getByExtension(".csproj")) {
      const content = await readText(csprojFile.path);
      if (!content) continue;

      for (const [indicator, framework] of DOTNET_TEST_FRAMEWORKS) {
        if (content.includes(indicator)) {
          addFinding(
            framework,
            0.95,
            `.NET test framework: ${indicator} in ${csprojFile.relativePath}`,
          );
        }
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
        file.ext === ".tcl"
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
