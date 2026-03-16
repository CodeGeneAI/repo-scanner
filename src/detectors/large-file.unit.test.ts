import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { LargeFileInfo } from "../types";
import { FileIndex } from "../utils/file-index";
import "./init";
import { setLargeFileThreshold } from "./large-file";
import { getDetectors } from "./registry";

const tmpDir = () => mkdtemp(path.join(os.tmpdir(), "large-file-test-"));

const writeAt = async (root: string, relPath: string, content: string) => {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
};

const makeLinesContent = (lineCount: number): string =>
  Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`).join("\n") +
  "\n";

const runLargeFile = async (root: string) => {
  const idx = await FileIndex.build(root);
  const detector = getDetectors().find((d) => d.id === "large-file")!;
  return detector.detect(root, idx);
};

let root: string;

beforeEach(async () => {
  root = await tmpDir();
  // Reset to a low threshold for tests
  setLargeFileThreshold(10);
});

afterEach(async () => {
  await rm(root, { recursive: true });
  // Reset to default
  setLargeFileThreshold(500);
});

describe("large-file detector", () => {
  it("is registered", () => {
    const detector = getDetectors().find((d) => d.id === "large-file");
    expect(detector).toBeDefined();
  });

  it("detects code files above threshold", async () => {
    await writeAt(root, "big.ts", makeLinesContent(20));
    await writeAt(root, "small.ts", makeLinesContent(5));

    const result = await runLargeFile(root);

    expect(result.detectorId).toBe("large-file");
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.value).toBe("big.ts");

    const largeFiles = result.metadata!.largeFiles as LargeFileInfo[];
    expect(largeFiles.length).toBe(1);
    expect(largeFiles[0]!.relativePath).toBe("big.ts");
    expect(largeFiles[0]!.lineCount).toBe(20);
    expect(largeFiles[0]!.language).toBe("TypeScript");
  });

  it("ignores non-code files", async () => {
    await writeAt(root, "data.json", makeLinesContent(100));
    await writeAt(root, "readme.md", makeLinesContent(100));
    await writeAt(root, "small.ts", makeLinesContent(5));

    const result = await runLargeFile(root);
    expect(result.findings.length).toBe(0);
  });

  it("returns empty when no files exceed threshold", async () => {
    await writeAt(root, "a.ts", makeLinesContent(5));
    await writeAt(root, "b.py", makeLinesContent(8));

    const result = await runLargeFile(root);
    expect(result.findings.length).toBe(0);
    expect((result.metadata!.largeFiles as LargeFileInfo[]).length).toBe(0);
  });

  it("sorts results by line count descending", async () => {
    await writeAt(root, "medium.ts", makeLinesContent(15));
    await writeAt(root, "huge.py", makeLinesContent(50));
    await writeAt(root, "big.go", makeLinesContent(30));

    const result = await runLargeFile(root);
    const largeFiles = result.metadata!.largeFiles as LargeFileInfo[];

    expect(largeFiles.length).toBe(3);
    expect(largeFiles[0]!.relativePath).toBe("huge.py");
    expect(largeFiles[1]!.relativePath).toBe("big.go");
    expect(largeFiles[2]!.relativePath).toBe("medium.ts");
  });

  it("respects custom threshold via setLargeFileThreshold", async () => {
    setLargeFileThreshold(50);

    await writeAt(root, "a.ts", makeLinesContent(30));
    await writeAt(root, "b.ts", makeLinesContent(60));

    const result = await runLargeFile(root);
    const largeFiles = result.metadata!.largeFiles as LargeFileInfo[];

    expect(largeFiles.length).toBe(1);
    expect(largeFiles[0]!.relativePath).toBe("b.ts");
  });

  it("includes correct language for each file", async () => {
    await writeAt(root, "app.py", makeLinesContent(20));
    await writeAt(root, "main.go", makeLinesContent(20));
    await writeAt(root, "lib.rs", makeLinesContent(20));

    const result = await runLargeFile(root);
    const largeFiles = result.metadata!.largeFiles as LargeFileInfo[];

    const byPath = new Map(largeFiles.map((f) => [f.relativePath, f]));
    expect(byPath.get("app.py")!.language).toBe("Python");
    expect(byPath.get("main.go")!.language).toBe("Go");
    expect(byPath.get("lib.rs")!.language).toBe("Rust");
  });

  it("includes threshold in evidence", async () => {
    await writeAt(root, "big.ts", makeLinesContent(20));

    const result = await runLargeFile(root);
    expect(result.findings[0]!.evidence[0]).toContain("threshold:");
  });

  it("excludes test and spec files", async () => {
    await writeAt(root, "app.ts", makeLinesContent(20));
    await writeAt(root, "app.test.ts", makeLinesContent(100));
    await writeAt(root, "app.spec.ts", makeLinesContent(100));
    await writeAt(root, "app.unit.test.ts", makeLinesContent(100));
    await writeAt(root, "app.unit.spec.ts", makeLinesContent(100));
    await writeAt(root, "utils_test.go", makeLinesContent(100));
    await writeAt(root, "test_utils.py", makeLinesContent(100));
    await writeAt(root, "utils_test.py", makeLinesContent(100));

    const result = await runLargeFile(root);
    const largeFiles = result.metadata!.largeFiles as LargeFileInfo[];

    expect(largeFiles.length).toBe(1);
    expect(largeFiles[0]!.relativePath).toBe("app.ts");
  });
});
