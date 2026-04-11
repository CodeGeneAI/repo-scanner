import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { findFiles, readTextFile, walkFiles } from "./fs";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("walkFiles", () => {
  it("finds files recursively", async () => {
    await mkdir(path.join(tmpDir, "sub"), { recursive: true });
    await writeFile(path.join(tmpDir, "a.ts"), "");
    await writeFile(path.join(tmpDir, "sub", "b.ts"), "");

    const files: string[] = [];
    for await (const f of walkFiles(tmpDir)) {
      files.push(path.relative(tmpDir, f));
    }

    expect(files.sort()).toEqual(["a.ts", "sub/b.ts"]);
  });

  it("filters by extension", async () => {
    await writeFile(path.join(tmpDir, "a.ts"), "");
    await writeFile(path.join(tmpDir, "b.js"), "");
    await writeFile(path.join(tmpDir, "c.py"), "");

    const files: string[] = [];
    for await (const f of walkFiles(tmpDir, new Set([".ts", ".js"]))) {
      files.push(path.basename(f));
    }

    expect(files.sort()).toEqual(["a.ts", "b.js"]);
  });

  it("skips node_modules", async () => {
    await mkdir(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
    await writeFile(path.join(tmpDir, "node_modules", "pkg", "index.js"), "");
    await writeFile(path.join(tmpDir, "app.js"), "");

    const files: string[] = [];
    for await (const f of walkFiles(tmpDir)) {
      files.push(path.relative(tmpDir, f));
    }

    expect(files).toEqual(["app.js"]);
  });

  it("skips .git directory", async () => {
    await mkdir(path.join(tmpDir, ".git", "objects"), { recursive: true });
    await writeFile(path.join(tmpDir, ".git", "objects", "x"), "");
    await writeFile(path.join(tmpDir, "file.ts"), "");

    const files: string[] = [];
    for await (const f of walkFiles(tmpDir)) {
      files.push(path.relative(tmpDir, f));
    }

    expect(files).toEqual(["file.ts"]);
  });

  it("skips vendor and __pycache__", async () => {
    await mkdir(path.join(tmpDir, "vendor", "pkg"), { recursive: true });
    await mkdir(path.join(tmpDir, "__pycache__"), { recursive: true });
    await writeFile(path.join(tmpDir, "vendor", "pkg", "a.go"), "");
    await writeFile(path.join(tmpDir, "__pycache__", "b.pyc"), "");
    await writeFile(path.join(tmpDir, "main.go"), "");

    const files: string[] = [];
    for await (const f of walkFiles(tmpDir)) {
      files.push(path.relative(tmpDir, f));
    }

    expect(files).toEqual(["main.go"]);
  });

  it("handles empty directory", async () => {
    const files: string[] = [];
    for await (const f of walkFiles(tmpDir)) {
      files.push(f);
    }

    expect(files).toEqual([]);
  });
});

describe("findFiles", () => {
  it("finds files by exact name", async () => {
    await mkdir(path.join(tmpDir, "sub"), { recursive: true });
    await writeFile(path.join(tmpDir, "package.json"), "{}");
    await writeFile(path.join(tmpDir, "sub", "package.json"), "{}");
    await writeFile(path.join(tmpDir, "other.txt"), "");

    const found = await findFiles(tmpDir, ["package.json"]);
    expect(found.map((f) => path.relative(tmpDir, f)).sort()).toEqual([
      "package.json",
      "sub/package.json",
    ]);
  });

  it("finds files by extension pattern", async () => {
    await writeFile(path.join(tmpDir, "app.csproj"), "<Project/>");
    await writeFile(path.join(tmpDir, "lib.fsproj"), "<Project/>");
    await writeFile(path.join(tmpDir, "other.txt"), "");

    const found = await findFiles(tmpDir, ["*.csproj", "*.fsproj"]);
    expect(found.map((f) => path.basename(f)).sort()).toEqual([
      "app.csproj",
      "lib.fsproj",
    ]);
  });

  it("returns empty for no matches", async () => {
    await writeFile(path.join(tmpDir, "foo.txt"), "");
    const found = await findFiles(tmpDir, ["go.mod"]);
    expect(found).toEqual([]);
  });
});

describe("readTextFile", () => {
  it("reads text file content", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await writeFile(filePath, "hello world");

    const content = await readTextFile(filePath);
    expect(content).toBe("hello world");
  });

  it("returns undefined for non-existent file", async () => {
    const content = await readTextFile(path.join(tmpDir, "nope.txt"));
    expect(content).toBeUndefined();
  });

  it("returns undefined for binary files", async () => {
    const filePath = path.join(tmpDir, "binary");
    await writeFile(filePath, Buffer.from([0x00, 0x01, 0x02]));

    const content = await readTextFile(filePath);
    expect(content).toBeUndefined();
  });
});
