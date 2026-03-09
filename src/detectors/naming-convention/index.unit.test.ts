import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIndex } from "../../utils/file-index";
import "../init";
import { getDetectors } from "../registry";
import type { Detector, DetectorResult } from "../types";
import type { NamingPattern } from "./types";

function findDetector(id: string): Detector {
  const detector = getDetectors().find((d) => d.id === id);
  if (!detector) throw new Error(`Detector "${id}" not found in registry`);
  return detector;
}

describe("naming-convention detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-naming-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("is registered in the detector registry", () => {
    const detector = findDetector("naming-convention");
    expect(detector.id).toBe("naming-convention");
  });

  it("returns findings with correct confidence levels", async () => {
    await mkdir(path.join(tmpDir, "components"), { recursive: true });
    // Create many kebab-case files for high consistency
    for (let i = 0; i < 10; i++) {
      await writeFile(
        path.join(tmpDir, "components", `my-component-${i}.ts`),
        `function handleClick${i}() {}`,
      );
    }

    const detector = findDetector("naming-convention");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.detectorId).toBe("naming-convention");
    expect(result.findings.length).toBeGreaterThan(0);

    // File naming should be kebab-case with high confidence
    const fileFinding = result.findings.find((f) =>
      f.value.startsWith("file:"),
    );
    expect(fileFinding).toBeDefined();
    expect(fileFinding!.value).toBe("file: kebab-case");
    expect(fileFinding!.confidence).toBe(1.0);
  });

  it("includes namingPatterns in metadata", async () => {
    await writeFile(
      path.join(tmpDir, "service.ts"),
      "function getUserById() {}\nclass UserService {}",
    );

    const detector = findDetector("naming-convention");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.metadata).toBeDefined();
    const patterns = result.metadata!.namingPatterns as NamingPattern[];
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBeGreaterThan(0);

    for (const pattern of patterns) {
      expect(pattern.category).toBeDefined();
      expect(pattern.dominantStyle).toBeDefined();
      expect(pattern.percentage).toBeGreaterThanOrEqual(0);
      expect(pattern.sampleSize).toBeGreaterThan(0);
    }
  });

  it("returns empty findings for empty repo", async () => {
    const detector = findDetector("naming-convention");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.findings).toEqual([]);
  });

  it("combines file and code analysis results", async () => {
    await mkdir(path.join(tmpDir, "user-module"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "user-module", "user-service.ts"),
      [
        "function getUserById() {}",
        "class UserService {}",
        "const MAX_RETRIES = 3;",
      ].join("\n"),
    );

    const detector = findDetector("naming-convention");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const categories = result.findings.map((f) => f.value.split(":")[0]);
    expect(categories).toContain("file");
    expect(categories).toContain("function");
    expect(categories).toContain("class");
  });
});
