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

describe("language detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-lang-"));
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    await writeFile(path.join(tmpDir, "src", "app.ts"), "");
    await writeFile(path.join(tmpDir, "src", "helper.tsx"), "");
    await writeFile(path.join(tmpDir, "main.py"), "");
    await writeFile(path.join(tmpDir, "script.sh"), "");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects TypeScript, Python, and Shell", async () => {
    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("TypeScript");
    expect(values).toContain("Python");
    expect(values).toContain("Shell");
  });
});

describe("dependency-manager detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-depmgr-"));
    await writeFile(path.join(tmpDir, "bun.lock"), "");
    await writeFile(path.join(tmpDir, "package.json"), "{}");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects Bun", async () => {
    const detector = findDetector("dependency-manager");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("Bun");
  });
});

describe("ci detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-ci-"));
    await mkdir(path.join(tmpDir, ".github", "workflows"), { recursive: true });
    await writeFile(path.join(tmpDir, ".github", "workflows", "ci.yml"), "");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects GitHub Actions with hasCi signal", async () => {
    const detector = findDetector("ci");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("GitHub Actions");
    expect(result.signals?.hasCi).toBe(true);
  });
});

describe("monorepo detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-mono-"));
    await writeFile(path.join(tmpDir, "turbo.json"), "{}");
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ workspaces: ["packages/*"] }),
    );
    await mkdir(path.join(tmpDir, "packages", "foo"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "packages", "foo", "package.json"),
      JSON.stringify({ name: "foo" }),
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects Turborepo with component hints", async () => {
    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("Turborepo");
    expect(result.componentHints).toBeDefined();
    const paths = result.componentHints!.map((h) => h.path);
    expect(paths).toContain("packages/foo");
  });
});

describe("repo-tools detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-tools-"));
    await writeFile(path.join(tmpDir, "README.md"), "");
    await mkdir(path.join(tmpDir, ".husky"), { recursive: true });
    await writeFile(path.join(tmpDir, ".husky", "pre-commit"), "#!/bin/sh");
    await mkdir(path.join(tmpDir, ".changeset"), { recursive: true });
    await writeFile(path.join(tmpDir, ".changeset", "config.json"), "{}");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects Husky, Changesets, and hasReadme signal", async () => {
    const detector = findDetector("repo-tools");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("Husky");
    expect(values).toContain("Changesets");
    expect(result.signals?.hasReadme).toBe(true);
  });
});

describe("containerization detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-container-"));
    await writeFile(path.join(tmpDir, "Dockerfile"), "");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects Docker with hasContainerization signal", async () => {
    const detector = findDetector("containerization");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("Docker");
    expect(result.signals?.hasContainerization).toBe(true);
  });
});
