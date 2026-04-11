import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { FileIndex } from "../../utils/file-index";
import { analyzeFileNaming } from "./file-analyzer";

describe("analyzeFileNaming", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-naming-file-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects kebab-case file naming", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    await writeFile(path.join(tmpDir, "src", "my-component.ts"), "");
    await writeFile(path.join(tmpDir, "src", "api-client.ts"), "");
    await writeFile(path.join(tmpDir, "src", "data-table.ts"), "");

    const index = await FileIndex.build(tmpDir);
    const patterns = analyzeFileNaming(index);
    const filePattern = patterns.find((p) => p.category === "file");

    expect(filePattern).toBeDefined();
    expect(filePattern!.dominantStyle).toBe("kebab-case");
    expect(filePattern!.percentage).toBe(100);
    expect(filePattern!.sampleSize).toBe(3);
  });

  it("detects PascalCase file naming", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    await writeFile(path.join(tmpDir, "src", "UserService.ts"), "");
    await writeFile(path.join(tmpDir, "src", "ApiClient.ts"), "");
    await writeFile(path.join(tmpDir, "src", "DataTable.ts"), "");

    const index = await FileIndex.build(tmpDir);
    const patterns = analyzeFileNaming(index);
    const filePattern = patterns.find((p) => p.category === "file");

    expect(filePattern).toBeDefined();
    expect(filePattern!.dominantStyle).toBe("PascalCase");
  });

  it("filters out dotfiles", async () => {
    await writeFile(path.join(tmpDir, ".eslintrc.js"), "");
    await writeFile(path.join(tmpDir, ".prettierrc"), "");
    await writeFile(path.join(tmpDir, "my-component.ts"), "");

    const index = await FileIndex.build(tmpDir);
    const patterns = analyzeFileNaming(index);
    const filePattern = patterns.find((p) => p.category === "file");

    expect(filePattern).toBeDefined();
    expect(filePattern!.sampleSize).toBe(1);
  });

  it("filters out generic file names like index and main", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    await writeFile(path.join(tmpDir, "src", "index.ts"), "");
    await writeFile(path.join(tmpDir, "src", "main.ts"), "");
    await writeFile(path.join(tmpDir, "src", "my-module.ts"), "");

    const index = await FileIndex.build(tmpDir);
    const patterns = analyzeFileNaming(index);
    const filePattern = patterns.find((p) => p.category === "file");

    expect(filePattern).toBeDefined();
    expect(filePattern!.sampleSize).toBe(1);
  });

  it("classifies directory names", async () => {
    await mkdir(path.join(tmpDir, "user-management"), { recursive: true });
    await mkdir(path.join(tmpDir, "api-gateway"), { recursive: true });
    await mkdir(path.join(tmpDir, "data-layer"), { recursive: true });
    await writeFile(path.join(tmpDir, "user-management", "a.ts"), "");
    await writeFile(path.join(tmpDir, "api-gateway", "b.ts"), "");
    await writeFile(path.join(tmpDir, "data-layer", "c.ts"), "");

    const index = await FileIndex.build(tmpDir);
    const patterns = analyzeFileNaming(index);
    const dirPattern = patterns.find((p) => p.category === "directory");

    expect(dirPattern).toBeDefined();
    expect(dirPattern!.dominantStyle).toBe("kebab-case");
    expect(dirPattern!.sampleSize).toBe(3);
  });

  it("skips ignored directories like node_modules and dist", async () => {
    await mkdir(path.join(tmpDir, "components"), { recursive: true });
    await writeFile(path.join(tmpDir, "components", "a.ts"), "");

    const index = await FileIndex.build(tmpDir);
    const patterns = analyzeFileNaming(index);
    const dirPattern = patterns.find((p) => p.category === "directory");

    // "src" and "dist" are in SKIP_DIR_NAMES, "components" is not
    expect(dirPattern).toBeDefined();
    expect(dirPattern!.sampleSize).toBe(1);
  });

  it("returns empty array for empty repo", async () => {
    const index = await FileIndex.build(tmpDir);
    const patterns = analyzeFileNaming(index);
    expect(patterns).toEqual([]);
  });

  it("classifies double-dot filenames by their delimiter pattern", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    // auth.config.ts → "auth-config" → kebab-case
    await writeFile(path.join(tmpDir, "src", "auth.config.ts"), "");
    // app.module.ts → "app-module" → kebab-case
    await writeFile(path.join(tmpDir, "src", "app.module.ts"), "");
    // data.factory.ts → "data-factory" → kebab-case
    await writeFile(path.join(tmpDir, "src", "data.factory.ts"), "");

    const index = await FileIndex.build(tmpDir);
    const patterns = analyzeFileNaming(index);
    const filePattern = patterns.find((p) => p.category === "file");

    expect(filePattern).toBeDefined();
    expect(filePattern!.dominantStyle).toBe("kebab-case");
    expect(filePattern!.sampleSize).toBe(3);
  });

  it("reports correct breakdown counts", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    await writeFile(path.join(tmpDir, "src", "my-component.ts"), "");
    await writeFile(path.join(tmpDir, "src", "api-client.ts"), "");
    await writeFile(path.join(tmpDir, "src", "UserService.ts"), "");

    const index = await FileIndex.build(tmpDir);
    const patterns = analyzeFileNaming(index);
    const filePattern = patterns.find((p) => p.category === "file");

    expect(filePattern).toBeDefined();
    expect(filePattern!.breakdown["kebab-case"]).toBe(2);
    expect(filePattern!.breakdown["PascalCase"]).toBe(1);
  });
});
