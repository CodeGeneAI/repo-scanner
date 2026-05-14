import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { FileIndex } from "../utils/file-index";
import { createFindingAdder, scanFilesForIndicators } from "./shared";

describe("scanFilesForIndicators", () => {
  test("does not match a Go module directive line", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rs-shared-"));
    await writeFile(
      path.join(dir, "go.mod"),
      "module github.com/gin-gonic/gin\n\ngo 1.22\n",
    );
    const index = await FileIndex.build(dir);
    const findings: string[] = [];
    await scanFilesForIndicators(
      index,
      ["go.mod"],
      new Map([["github.com/gin-gonic/gin", "Gin"]]),
      (name) => findings.push(name),
      0.9,
      "Go dep",
      { excludeLinePrefixes: ["module "] },
    );
    expect(findings).toEqual([]);
  });

  test("still matches an actual require line", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rs-shared-"));
    await writeFile(
      path.join(dir, "go.mod"),
      "module example.com/x\n\nrequire github.com/gin-gonic/gin v1.10.0\n",
    );
    const index = await FileIndex.build(dir);
    const findings: string[] = [];
    await scanFilesForIndicators(
      index,
      ["go.mod"],
      new Map([["github.com/gin-gonic/gin", "Gin"]]),
      (name) => findings.push(name),
      0.9,
      "Go dep",
      { excludeLinePrefixes: ["module "] },
    );
    expect(findings).toEqual(["Gin"]);
  });
});

describe("createFindingAdder dedup", () => {
  test("dedupes when same name + same filePath emitted twice", () => {
    const { findings, addFinding } = createFindingAdder();
    addFinding("React", 0.9, "evidence-1", "apps/web/package.json");
    addFinding("React", 0.9, "evidence-2", "apps/web/package.json");
    expect(findings).toHaveLength(1);
  });

  test("keeps both when same name comes from different filePaths", () => {
    const { findings, addFinding } = createFindingAdder();
    addFinding("React", 0.9, "ev", "apps/web/package.json");
    addFinding("React", 0.9, "ev", "packages/shared/package.json");
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.filePath).sort()).toEqual([
      "apps/web/package.json",
      "packages/shared/package.json",
    ]);
  });

  test("dedupes by name when no filePath is provided (legacy behavior)", () => {
    const { findings, addFinding } = createFindingAdder();
    addFinding("React", 0.9, "ev");
    addFinding("React", 0.9, "ev");
    expect(findings).toHaveLength(1);
  });

  test("seen Set continues to expose bare names", () => {
    const { seen, addFinding } = createFindingAdder();
    addFinding("React", 0.9, "ev", "apps/web/package.json");
    addFinding("Vue", 0.9, "ev", "apps/other/package.json");
    expect([...seen].sort()).toEqual(["React", "Vue"]);
  });
});
