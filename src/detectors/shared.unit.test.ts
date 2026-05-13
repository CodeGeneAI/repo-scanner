import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { FileIndex } from "../utils/file-index";
import { scanFilesForIndicators } from "./shared";

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
