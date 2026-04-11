import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { FileIndex } from "../utils/file-index";
import { setSolidOptions } from "./solid-health";
import "./init";
import { getDetectors } from "./registry";
import type { Detector } from "./types";

function findDetector(id: string): Detector {
  const detector = getDetectors().find((d) => d.id === id);
  if (!detector) throw new Error(`Detector "${id}" not found in registry`);
  return detector;
}

describe("solid-health detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-solid-"));
    await writeFile(path.join(tmpDir, "index.ts"), "const x = 1;");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('is registered with id "solid-health"', () => {
    const detector = findDetector("solid-health");
    expect(detector).toBeDefined();
    expect(detector.id).toBe("solid-health");
  });

  it("returns empty findings when not enabled (opt-in gating)", async () => {
    const detector = findDetector("solid-health");
    const index = await FileIndex.build(tmpDir);
    const result = await detector.detect(tmpDir, index);

    expect(result.detectorId).toBe("solid-health");
    expect(result.findings).toHaveLength(0);
  });

  it("exports setSolidOptions as a callable function", () => {
    expect(typeof setSolidOptions).toBe("function");
    // Should not throw when called with valid options
    expect(() => setSolidOptions({ enabled: false })).not.toThrow();
    expect(() => setSolidOptions({})).not.toThrow();
  });
});
