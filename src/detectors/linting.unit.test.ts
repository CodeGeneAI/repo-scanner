import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";
import type { Detector, DetectorResult } from "./types";

function findDetector(id: string): Detector {
  const detector = getDetectors().find((d) => d.id === id);
  if (!detector) throw new Error(`Detector "${id}" not found in registry`);
  return detector;
}

async function runLintingDetector(
  tmpDir: string,
): Promise<{ values: string[]; result: DetectorResult }> {
  const detector = findDetector("linting");
  const index = await FileIndex.build(tmpDir);
  const result = await detector.detect(tmpDir, index);
  return { values: result.findings.map((f) => f.value), result };
}

describe("linting detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-linting-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Python
  it("detects flake8 from .flake8 config", async () => {
    await writeFile(
      path.join(tmpDir, ".flake8"),
      "[flake8]\nmax-line-length = 100",
    );
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("flake8");
  });

  it("detects black from pyproject.toml", async () => {
    await writeFile(
      path.join(tmpDir, "pyproject.toml"),
      "[tool.black]\nline-length = 88",
    );
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("black");
  });

  it("detects mypy from mypy.ini", async () => {
    await writeFile(path.join(tmpDir, "mypy.ini"), "[mypy]\nstrict = true");
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("mypy");
  });

  // Java / Kotlin
  it("detects Checkstyle from checkstyle.xml", async () => {
    await writeFile(path.join(tmpDir, "checkstyle.xml"), "<module/>");
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("Checkstyle");
  });

  it("detects Detekt from detekt.yml", async () => {
    await writeFile(path.join(tmpDir, "detekt.yml"), "build:\n  maxIssues: 0");
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("Detekt");
  });

  // Ruby
  it("detects RuboCop from .rubocop.yml", async () => {
    await writeFile(
      path.join(tmpDir, ".rubocop.yml"),
      "AllCops:\n  Enabled: true",
    );
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("RuboCop");
  });

  // PHP
  it("detects PHPStan from phpstan.neon", async () => {
    await writeFile(
      path.join(tmpDir, "phpstan.neon"),
      "parameters:\n  level: max",
    );
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("PHPStan");
  });

  // Rust
  it("detects Clippy from clippy.toml", async () => {
    await writeFile(
      path.join(tmpDir, "clippy.toml"),
      "cognitive-complexity-threshold = 30",
    );
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("Clippy");
  });

  // Shell
  it("detects ShellCheck from .shellcheckrc", async () => {
    await writeFile(path.join(tmpDir, ".shellcheckrc"), "disable=SC2034");
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("ShellCheck");
  });

  // Elixir
  it("detects Credo from .credo.exs", async () => {
    await writeFile(path.join(tmpDir, ".credo.exs"), "%{configs: []}");
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("Credo");
  });

  // Swift
  it("detects SwiftLint from .swiftlint.yml", async () => {
    await writeFile(path.join(tmpDir, ".swiftlint.yml"), "disabled_rules: []");
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("SwiftLint");
  });

  // Scala
  it("detects Scalafmt from .scalafmt.conf", async () => {
    await writeFile(path.join(tmpDir, ".scalafmt.conf"), "maxColumn = 100");
    const { values } = await runLintingDetector(tmpDir);
    expect(values).toContain("Scalafmt");
  });

  // Primary path filtering
  it("does NOT detect linter config inside test directories", async () => {
    await mkdir(path.join(tmpDir, "tests"), { recursive: true });
    await writeFile(path.join(tmpDir, "tests", ".rubocop.yml"), "AllCops: {}");
    const { values } = await runLintingDetector(tmpDir);
    expect(values).not.toContain("RuboCop");
  });
});
