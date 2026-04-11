import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";
import type { Detector, DetectorResult } from "./types";

function findDetector(id: string): Detector {
  const detector = getDetectors().find((d) => d.id === id);
  if (!detector) throw new Error(`Detector "${id}" not found in registry`);
  return detector;
}

describe("ci detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-ci-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects GitHub Actions from .github/workflows/*.yml", async () => {
    await mkdir(path.join(tmpDir, ".github", "workflows"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".github", "workflows", "ci.yml"),
      "name: CI",
    );

    const detector = findDetector("ci");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("GitHub Actions");
    expect(result.findings[0]!.confidence).toBe(1.0);
    expect(result.findings[0]!.evidence).toContain(
      ".github/workflows/ YAML files",
    );
  });

  it("detects GitHub Actions from .yaml files too", async () => {
    await mkdir(path.join(tmpDir, ".github", "workflows"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".github", "workflows", "deploy.yaml"),
      "name: Deploy",
    );

    const detector = findDetector("ci");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("GitHub Actions");
  });

  it("detects GitLab CI from .gitlab-ci.yml", async () => {
    await writeFile(path.join(tmpDir, ".gitlab-ci.yml"), "stages: [build]");

    const detector = findDetector("ci");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("GitLab CI");
  });

  it("sets hasCi signal when CI is detected", async () => {
    await mkdir(path.join(tmpDir, ".github", "workflows"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".github", "workflows", "ci.yml"),
      "name: CI",
    );

    const detector = findDetector("ci");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.signals?.hasCi).toBe(true);
  });

  it("sets hasCi to false when no CI is detected", async () => {
    await writeFile(path.join(tmpDir, "index.ts"), "");

    const detector = findDetector("ci");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.signals?.hasCi).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it("detects multiple CI systems simultaneously", async () => {
    await mkdir(path.join(tmpDir, ".github", "workflows"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".github", "workflows", "ci.yml"),
      "name: CI",
    );
    await writeFile(path.join(tmpDir, ".gitlab-ci.yml"), "stages: [build]");

    const detector = findDetector("ci");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("GitHub Actions");
    expect(values).toContain("GitLab CI");
    expect(result.findings).toHaveLength(2);
  });

  it("returns detectorId 'ci'", async () => {
    await writeFile(path.join(tmpDir, "index.ts"), "");

    const detector = findDetector("ci");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.detectorId).toBe("ci");
  });
});
