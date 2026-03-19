import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIndex } from "./file-index";

describe("FileIndex", () => {
  let tmpDir: string;
  let index: FileIndex;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "file-index-test-"));

    await mkdir(path.join(tmpDir, "src", "utils"), { recursive: true });
    await mkdir(path.join(tmpDir, ".github", "workflows"), { recursive: true });
    await mkdir(path.join(tmpDir, "packages", "a"), { recursive: true });

    await writeFile(path.join(tmpDir, "package.json"), "{}");
    await writeFile(path.join(tmpDir, "src", "index.ts"), "");
    await writeFile(path.join(tmpDir, "src", "utils", "helper.ts"), "");
    await writeFile(path.join(tmpDir, ".github", "workflows", "ci.yml"), "");
    await writeFile(path.join(tmpDir, "README.md"), "");
    await writeFile(path.join(tmpDir, "main.py"), "");
    await writeFile(path.join(tmpDir, "go.mod"), "");
    await writeFile(path.join(tmpDir, "packages", "a", "package.json"), "{}");

    index = await FileIndex.build(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("build", () => {
    it("indexes all files including nested ones", () => {
      // 8 files total: package.json, index.ts, helper.ts, ci.yml, README.md, main.py, go.mod, packages/a/package.json
      expect(index.size).toBe(8);
      expect(index.all()).toHaveLength(8);
    });

    it("includes dot directories like .github", () => {
      const relativePaths = index.all().map((f) => f.relativePath);
      expect(relativePaths).toContain(".github/workflows/ci.yml");
    });

    it("sets correct properties on indexed files", () => {
      const helpers = index.getByName("helper.ts");
      expect(helpers).toHaveLength(1);
      const file = helpers[0]!;
      expect(file.name).toBe("helper.ts");
      expect(file.ext).toBe(".ts");
      expect(file.relativePath).toBe("src/utils/helper.ts");
      expect(file.path).toBe(path.join(tmpDir, "src/utils/helper.ts"));
    });

    it("exposes nested scoped .scanignore rules on ignoreMatcher", async () => {
      await mkdir(
        path.join(
          tmpDir,
          "packages",
          "repo-scanner",
          "src",
          "detectors",
          "api",
        ),
        { recursive: true },
      );
      await writeFile(
        path.join(tmpDir, "packages", "repo-scanner", ".scanignore"),
        "[api]\n/src/detectors/api/graphql-extractors.ts\n",
      );
      await writeFile(
        path.join(
          tmpDir,
          "packages",
          "repo-scanner",
          "src",
          "detectors",
          "api",
          "graphql-extractors.ts",
        ),
        "export const noop = true;\n",
      );

      const scopedIndex = await FileIndex.build(tmpDir);
      const relPath =
        "packages/repo-scanner/src/detectors/api/graphql-extractors.ts";

      // Scoped nested rule is visible to detector-level matching.
      expect(scopedIndex.ignoreMatcher?.ignores(relPath, false, "api")).toBe(
        true,
      );
      // Same rule should not apply without the matching scope.
      expect(scopedIndex.ignoreMatcher?.ignores(relPath, false)).toBe(false);
      // Scoped rules should not filter files out during the initial file walk.
      expect(scopedIndex.getByName("graphql-extractors.ts")).toHaveLength(1);
    });
  });

  describe("hasFile", () => {
    it("returns true for existing files", () => {
      expect(index.hasFile("package.json")).toBe(true);
      expect(index.hasFile("ci.yml")).toBe(true);
      expect(index.hasFile("helper.ts")).toBe(true);
    });

    it("returns false for non-existing files", () => {
      expect(index.hasFile("nonexistent.txt")).toBe(false);
    });
  });

  describe("getByName", () => {
    it("returns all files with the given name", () => {
      const results = index.getByName("package.json");
      expect(results).toHaveLength(2);
      for (const f of results) {
        expect(f.name).toBe("package.json");
      }
    });

    it("returns empty array for missing name", () => {
      expect(index.getByName("nonexistent.txt")).toHaveLength(0);
    });
  });

  describe("getByExtension", () => {
    it("returns files with matching extension", () => {
      const tsFiles = index.getByExtension(".ts");
      expect(tsFiles).toHaveLength(2);
      const names = tsFiles.map((f) => f.name).sort();
      expect(names).toEqual(["helper.ts", "index.ts"]);
    });

    it("returns empty array for unmatched extension", () => {
      expect(index.getByExtension(".rs")).toHaveLength(0);
    });

    it("is case-insensitive", () => {
      expect(index.getByExtension(".TS")).toHaveLength(2);
      expect(index.getByExtension(".Ts")).toHaveLength(2);
    });
  });

  describe("getUnderPath", () => {
    it("returns files under a prefix", () => {
      const srcFiles = index.getUnderPath("src");
      expect(srcFiles).toHaveLength(2);
      const relativePaths = srcFiles.map((f) => f.relativePath).sort();
      expect(relativePaths).toContain("src/index.ts");
      expect(relativePaths).toContain("src/utils/helper.ts");
    });

    it("returns files under nested prefix", () => {
      const workflowFiles = index.getUnderPath(".github/workflows");
      expect(workflowFiles).toHaveLength(1);
      expect(workflowFiles[0]!.relativePath).toBe(".github/workflows/ci.yml");
    });

    it("returns empty array for non-existing prefix", () => {
      expect(index.getUnderPath("nonexistent")).toHaveLength(0);
    });
  });

  describe("getByPattern", () => {
    it("delegates *.ext patterns to getByExtension", () => {
      const tsFiles = index.getByPattern("*.ts");
      expect(tsFiles).toHaveLength(2);
    });

    it("delegates exact names to getByName", () => {
      const results = index.getByPattern("package.json");
      expect(results).toHaveLength(2);
    });
  });

  describe("hasAny", () => {
    it("returns true when at least one pattern matches", () => {
      expect(index.hasAny(["*.ts", "*.rs"])).toBe(true);
      expect(index.hasAny(["package.json", "Cargo.toml"])).toBe(true);
    });

    it("returns false when no patterns match", () => {
      expect(index.hasAny(["*.rs", "Cargo.toml", "*.rb"])).toBe(false);
    });

    it("matches extension patterns", () => {
      expect(index.hasAny(["*.yml"])).toBe(true);
      expect(index.hasAny(["*.go"])).toBe(false);
    });

    it("matches exact name patterns", () => {
      expect(index.hasAny(["go.mod"])).toBe(true);
      expect(index.hasAny(["go.sum"])).toBe(false);
    });
  });
});
