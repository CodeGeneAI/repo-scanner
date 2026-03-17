import { mkdtemp, rm, writeFile } from "fs/promises";
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

async function runDetector(tmpDir: string) {
  const detector = findDetector("code-quality");
  const index = await FileIndex.build(tmpDir);
  const result: DetectorResult = await detector.detect(tmpDir, index);
  const values = result.findings.map((f) => f.value);
  return { result, values };
}

describe("code-quality detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-codequal-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── Platform checks ──────────────────────────────────────────────────────

  it("detects SonarQube from sonar-project.properties", async () => {
    await writeFile(
      path.join(tmpDir, "sonar-project.properties"),
      "sonar.projectKey=my-app",
    );
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("SonarQube");
  });

  it("detects SonarCloud from sonarcloud.properties", async () => {
    await writeFile(
      path.join(tmpDir, "sonarcloud.properties"),
      "sonar.projectKey=my-app",
    );
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("SonarQube");
  });

  it("detects Code Climate from .codeclimate.yml", async () => {
    await writeFile(path.join(tmpDir, ".codeclimate.yml"), "version: 2");
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Code Climate");
  });

  it("detects Code Climate from .codeclimate.json", async () => {
    await writeFile(path.join(tmpDir, ".codeclimate.json"), "{}");
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Code Climate");
  });

  it("detects Codacy from .codacy.yml", async () => {
    await writeFile(path.join(tmpDir, ".codacy.yml"), "engines: []");
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Codacy");
  });

  it("detects Codacy from .codacy.yaml", async () => {
    await writeFile(path.join(tmpDir, ".codacy.yaml"), "engines: []");
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Codacy");
  });

  it("detects DeepSource from .deepsource.toml", async () => {
    await writeFile(path.join(tmpDir, ".deepsource.toml"), "version = 1");
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("DeepSource");
  });

  it("detects Semgrep from .semgrep.yml", async () => {
    await writeFile(path.join(tmpDir, ".semgrep.yml"), "rules: []");
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Semgrep");
  });

  it("detects Semgrep from .semgrep.yaml", async () => {
    await writeFile(path.join(tmpDir, ".semgrep.yaml"), "rules: []");
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Semgrep");
  });

  it("detects Snyk from .snyk", async () => {
    await writeFile(path.join(tmpDir, ".snyk"), "version: v1.5.0");
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Snyk");
  });

  it("detects Checkmarx from checkmarx.yml", async () => {
    await writeFile(path.join(tmpDir, "checkmarx.yml"), "scan: {}");
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Checkmarx");
  });

  it("detects Coveralls from .coveralls.yml", async () => {
    await writeFile(path.join(tmpDir, ".coveralls.yml"), "repo_token: xxx");
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Coveralls");
  });

  // ── Coverage threshold checks ────────────────────────────────────────────

  it("detects Jest Coverage Thresholds when coverageThreshold is configured", async () => {
    await writeFile(
      path.join(tmpDir, "jest.config.js"),
      "module.exports = { coverageThreshold: { global: { branches: 80 } } };",
    );
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Jest Coverage Thresholds");
  });

  it("does NOT detect Jest Coverage Thresholds without coverageThreshold", async () => {
    await writeFile(
      path.join(tmpDir, "jest.config.js"),
      `module.exports = { testEnvironment: "node" };`,
    );
    const { values } = await runDetector(tmpDir);
    expect(values).not.toContain("Jest Coverage Thresholds");
  });

  it("detects nyc Coverage Thresholds from .nycrc", async () => {
    await writeFile(
      path.join(tmpDir, ".nycrc"),
      JSON.stringify({ branches: 80, lines: 90 }),
    );
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("nyc Coverage Thresholds");
  });

  it("does NOT detect nyc Coverage Thresholds without threshold keys", async () => {
    await writeFile(
      path.join(tmpDir, ".nycrc"),
      JSON.stringify({ reporter: ["text"] }),
    );
    const { values } = await runDetector(tmpDir);
    expect(values).not.toContain("nyc Coverage Thresholds");
  });

  it("detects pytest Coverage Thresholds from pyproject.toml with fail_under", async () => {
    await writeFile(
      path.join(tmpDir, "pyproject.toml"),
      "[tool.coverage.report]\nfail_under = 90",
    );
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("pytest Coverage Thresholds");
  });

  it("detects pytest Coverage Thresholds from setup.cfg with --cov-fail-under", async () => {
    await writeFile(
      path.join(tmpDir, "setup.cfg"),
      "[tool:pytest]\naddopts = --cov-fail-under=80",
    );
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("pytest Coverage Thresholds");
  });

  it("detects Codecov Thresholds when threshold is configured", async () => {
    await writeFile(
      path.join(tmpDir, "codecov.yml"),
      "coverage:\n  status:\n    project:\n      default:\n        threshold: 1%",
    );
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Codecov Thresholds");
  });

  it("detects Codecov Thresholds when target is configured", async () => {
    await writeFile(
      path.join(tmpDir, ".codecov.yml"),
      "coverage:\n  status:\n    project:\n      default:\n        target: 90%",
    );
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Codecov Thresholds");
  });

  it("does NOT detect Codecov Thresholds without threshold/target", async () => {
    await writeFile(
      path.join(tmpDir, "codecov.yml"),
      "coverage:\n  status:\n    project: {}",
    );
    const { values } = await runDetector(tmpDir);
    expect(values).not.toContain("Codecov Thresholds");
  });

  it("detects Coverage.py Thresholds from .coveragerc with fail_under", async () => {
    await writeFile(
      path.join(tmpDir, ".coveragerc"),
      "[report]\nfail_under = 85",
    );
    const { values } = await runDetector(tmpDir);
    expect(values).toContain("Coverage.py Thresholds");
  });

  it("does NOT detect Coverage.py Thresholds without fail_under", async () => {
    await writeFile(
      path.join(tmpDir, ".coveragerc"),
      "[report]\nshow_missing = True",
    );
    const { values } = await runDetector(tmpDir);
    expect(values).not.toContain("Coverage.py Thresholds");
  });

  // ── Signals ──────────────────────────────────────────────────────────────

  it("sets hasQualityGates signal to true when tools are detected", async () => {
    await writeFile(path.join(tmpDir, ".snyk"), "version: v1.5.0");
    const { result } = await runDetector(tmpDir);
    expect(result.signals?.hasQualityGates).toBe(true);
  });

  it("sets hasQualityGates signal to false when nothing is detected", async () => {
    const { result } = await runDetector(tmpDir);
    expect(result.signals?.hasQualityGates).toBe(false);
  });

  // ── Multiple tools ───────────────────────────────────────────────────────

  it("detects multiple tools simultaneously", async () => {
    await writeFile(
      path.join(tmpDir, "sonar-project.properties"),
      "sonar.projectKey=my-app",
    );
    await writeFile(path.join(tmpDir, ".snyk"), "version: v1.5.0");
    await writeFile(path.join(tmpDir, ".codeclimate.yml"), "version: 2");
    const { values, result } = await runDetector(tmpDir);
    expect(values).toContain("SonarQube");
    expect(values).toContain("Snyk");
    expect(values).toContain("Code Climate");
    expect(result.signals?.hasQualityGates).toBe(true);
  });

  it("returns detectorId as code-quality", async () => {
    const { result } = await runDetector(tmpDir);
    expect(result.detectorId).toBe("code-quality");
  });

  it("returns empty findings for empty repo", async () => {
    const { result } = await runDetector(tmpDir);
    expect(result.findings).toHaveLength(0);
  });
});
