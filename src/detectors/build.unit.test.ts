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

async function runBuildDetector(
  tmpDir: string,
): Promise<{ values: string[]; result: DetectorResult }> {
  const detector = findDetector("build");
  const index = await FileIndex.build(tmpDir);
  const result = await detector.detect(tmpDir, index);
  return { values: result.findings.map((f) => f.value), result };
}

describe("build detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-build-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects SBT from build.sbt", async () => {
    await writeFile(path.join(tmpDir, "build.sbt"), 'name := "myproject"');
    const { values } = await runBuildDetector(tmpDir);
    expect(values).toContain("SBT");
  });

  it("detects Cargo from Cargo.toml", async () => {
    await writeFile(
      path.join(tmpDir, "Cargo.toml"),
      '[package]\nname = "myapp"',
    );
    const { values } = await runBuildDetector(tmpDir);
    expect(values).toContain("Cargo");
  });

  it("detects Go Build from go.mod", async () => {
    await writeFile(
      path.join(tmpDir, "go.mod"),
      "module example.com/app\ngo 1.21",
    );
    const { values } = await runBuildDetector(tmpDir);
    expect(values).toContain("Go Build");
  });

  it("detects Meson from meson.build", async () => {
    await writeFile(path.join(tmpDir, "meson.build"), "project('myapp', 'c')");
    const { values } = await runBuildDetector(tmpDir);
    expect(values).toContain("Meson");
  });

  it("detects Mix from mix.exs", async () => {
    await writeFile(
      path.join(tmpDir, "mix.exs"),
      "defmodule MyApp.MixProject do",
    );
    const { values } = await runBuildDetector(tmpDir);
    expect(values).toContain("Mix");
  });

  it("detects Just from justfile", async () => {
    await writeFile(path.join(tmpDir, "justfile"), "build:\n  cargo build");
    const { values } = await runBuildDetector(tmpDir);
    expect(values).toContain("Just");
  });

  it("detects Ant from build.xml", async () => {
    await writeFile(path.join(tmpDir, "build.xml"), "<project/>");
    const { values } = await runBuildDetector(tmpDir);
    expect(values).toContain("Ant");
  });

  it("detects Composer from composer.json", async () => {
    await writeFile(path.join(tmpDir, "composer.json"), "{}");
    const { values } = await runBuildDetector(tmpDir);
    expect(values).toContain("Composer");
  });
});
