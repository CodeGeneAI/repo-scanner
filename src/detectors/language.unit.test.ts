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

describe("language detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-lang-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects TypeScript from .ts files", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    await writeFile(path.join(tmpDir, "src", "app.ts"), "");
    await writeFile(path.join(tmpDir, "src", "utils.ts"), "");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const ts = result.findings.find((f) => f.value === "TypeScript");

    expect(ts).toBeDefined();
    expect(ts!.confidence).toBeGreaterThan(0);
    expect(ts!.evidence[0]).toContain("file(s)");
  });

  it("detects multiple languages", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    await writeFile(path.join(tmpDir, "src", "app.ts"), "");
    await writeFile(path.join(tmpDir, "main.py"), "");
    await writeFile(path.join(tmpDir, "script.sh"), "");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("TypeScript");
    expect(values).toContain("Python");
    expect(values).toContain("Shell");
  });

  it("boosts confidence from manifest (tsconfig.json)", async () => {
    await writeFile(path.join(tmpDir, "index.ts"), "");
    await writeFile(path.join(tmpDir, "tsconfig.json"), "{}");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const ts = result.findings.find((f) => f.value === "TypeScript");

    expect(ts).toBeDefined();
    expect(ts!.confidence).toBe(1.0);
    expect(ts!.evidence).toContain("confirmed by tsconfig.json");
  });

  it("adds language from manifest even without source files", async () => {
    await writeFile(path.join(tmpDir, "tsconfig.json"), "{}");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const ts = result.findings.find((f) => f.value === "TypeScript");

    expect(ts).toBeDefined();
    expect(ts!.confidence).toBe(0.8);
    expect(ts!.evidence[0]).toContain("manifest file");
  });

  it("assigns higher confidence for more files", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    // 10+ files should get confidence 1.0
    for (let i = 0; i < 10; i++) {
      await writeFile(path.join(tmpDir, "src", `file${i}.ts`), "");
    }

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const ts = result.findings.find((f) => f.value === "TypeScript");

    expect(ts).toBeDefined();
    expect(ts!.confidence).toBe(1.0);
  });

  it("sorts findings by confidence descending", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    // Many TS files => high confidence
    for (let i = 0; i < 10; i++) {
      await writeFile(path.join(tmpDir, "src", `file${i}.ts`), "");
    }
    // One Python file => low confidence
    await writeFile(path.join(tmpDir, "main.py"), "");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < result.findings.length; i++) {
      expect(result.findings[i - 1]!.confidence).toBeGreaterThanOrEqual(
        result.findings[i]!.confidence,
      );
    }
  });

  it("returns detectorId 'language'", async () => {
    await writeFile(path.join(tmpDir, "main.py"), "");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.detectorId).toBe("language");
  });
});
