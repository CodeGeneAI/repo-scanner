import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
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

async function runDepManagerDetector(
  tmpDir: string,
): Promise<{ values: string[]; result: DetectorResult }> {
  const detector = findDetector("dependency-manager");
  const index = await FileIndex.build(tmpDir);
  const result = await detector.detect(tmpDir, index);
  return { values: result.findings.map((f) => f.value), result };
}

describe("dependency-manager detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-depmgr2-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects SBT from build.sbt", async () => {
    await writeFile(path.join(tmpDir, "build.sbt"), 'name := "app"');
    const { values } = await runDepManagerDetector(tmpDir);
    expect(values).toContain("SBT");
  });

  it("detects Conda from environment.yml", async () => {
    await writeFile(
      path.join(tmpDir, "environment.yml"),
      "name: myenv\ndependencies:",
    );
    const { values } = await runDepManagerDetector(tmpDir);
    expect(values).toContain("Conda");
  });

  it("detects vcpkg from vcpkg.json", async () => {
    await writeFile(
      path.join(tmpDir, "vcpkg.json"),
      JSON.stringify({ dependencies: ["fmt"] }),
    );
    const { values } = await runDepManagerDetector(tmpDir);
    expect(values).toContain("vcpkg");
  });

  it("detects Conan from conan.lock", async () => {
    await writeFile(path.join(tmpDir, "conan.lock"), "{}");
    const { values } = await runDepManagerDetector(tmpDir);
    expect(values).toContain("Conan");
  });

  it("detects Conan from conanfile.txt (manifest)", async () => {
    await writeFile(path.join(tmpDir, "conanfile.txt"), "[requires]\nfmt/10.0");
    const { values } = await runDepManagerDetector(tmpDir);
    expect(values).toContain("Conan");
  });

  it("enriches Gradle with wrapper evidence", async () => {
    await writeFile(path.join(tmpDir, "build.gradle"), "");
    await writeFile(path.join(tmpDir, "gradlew"), "#!/bin/sh");
    const detector = findDetector("dependency-manager");
    const index = await FileIndex.build(tmpDir);
    const result = await detector.detect(tmpDir, index);
    const gradle = result.findings.find((f) => f.value === "Gradle");
    expect(gradle).toBeDefined();
    expect(gradle!.evidence.join(" ")).toContain("Gradle Wrapper");
  });
});
