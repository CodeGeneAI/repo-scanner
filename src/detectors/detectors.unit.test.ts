import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { FileIndex } from "../utils/file-index";
import { DETECTOR_IDS } from "./catalog";
import "./init";
import { getDetectors } from "./registry";
import type { Detector, DetectorResult } from "./types";

function findDetector(id: string): Detector {
  const detector = getDetectors().find((d) => d.id === id);
  if (!detector) throw new Error(`Detector "${id}" not found in registry`);
  return detector;
}

describe("detector catalog", () => {
  it("exposes exactly five detector ids", () => {
    expect([...DETECTOR_IDS].sort()).toEqual([
      "ciProvider",
      "framework",
      "language",
      "monorepo",
      "packageManager",
    ]);
  });

  it("registers exactly four detectors via init", () => {
    const registeredIds = getDetectors()
      .map((detector) => detector.id)
      .sort();
    expect(registeredIds).toEqual([
      "framework",
      "language",
      "monorepo",
      "packageManager",
    ]);
  });
});

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
