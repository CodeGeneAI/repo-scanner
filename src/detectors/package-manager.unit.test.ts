import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";

describe("packageManager detector (scaffold)", () => {
  test("returns no findings yet (scaffold only)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rs-pm-"));
    await writeFile(path.join(dir, "package.json"), "{}");
    const det = getDetectors().find((d) => d.id === "packageManager");
    expect(det).toBeDefined();
    const result = await det!.detect(dir, await FileIndex.build(dir));
    expect(result.detectorId).toBe("packageManager");
    expect(result.findings).toEqual([]);
  });
});
