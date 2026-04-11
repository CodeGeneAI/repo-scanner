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

describe("external-services detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-external-services-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function run(): Promise<{
    values: string[];
    result: DetectorResult;
  }> {
    const detector = findDetector("external-services");
    const index = await FileIndex.build(tmpDir);
    const result = await detector.detect(tmpDir, index);
    return { values: result.findings.map((f) => f.value), result };
  }

  it("detects Supabase from @supabase/supabase-js", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          dependencies: {
            "@supabase/supabase-js": "^2.0.0",
          },
        },
        null,
        2,
      ),
    );

    const { values, result } = await run();

    expect(values).toContain("Infrastructure: Supabase");
    expect(result.metadata?.externalServices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Supabase",
          category: "Infrastructure",
        }),
      ]),
    );
  });
});
