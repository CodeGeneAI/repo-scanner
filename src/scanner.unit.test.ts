import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { scanRepo } from "./scanner";
import "./detectors/init";

const tempDirs: string[] = [];

const createTempRepo = async (): Promise<string> => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "repo-scanner-"));
  tempDirs.push(repoPath);
  await writeFile(path.join(repoPath, "README.md"), "# test repo\n");
  return repoPath;
};

const createReactFixtureRepo = async (): Promise<string> => {
  const repoPath = await createTempRepo();
  await mkdir(path.join(repoPath, "src"), { recursive: true });
  await writeFile(path.join(repoPath, "src", "App.tsx"), "export default 1;\n");
  await writeFile(
    path.join(repoPath, "src", "index.ts"),
    "export const x = 1;\n",
  );
  await writeFile(
    path.join(repoPath, "src", "util.ts"),
    "export const y = 2;\n",
  );
  await writeFile(path.join(repoPath, "tsconfig.json"), "{}\n");
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        version: "1.0.0",
        dependencies: {
          react: "^18.0.0",
        },
      },
      null,
      2,
    ),
  );
  return repoPath;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("scanRepo", () => {
  it("returns baseline result for a minimal repo", async () => {
    const repoPath = await createTempRepo();
    const result = await scanRepo(repoPath);

    expect(Array.isArray(result.inventory.languages)).toBe(true);
    expect(Array.isArray(result.architecture.components)).toBe(true);
    expect(result.languageStats).toBeDefined();
    expect(result.rootPath).toContain("repo-scanner-");
  });

  it("filters detectors when detectors option is provided", async () => {
    const repoPath = await createReactFixtureRepo();
    const result = await scanRepo(repoPath, {
      detectors: ["language"],
    });

    expect(result.inventory.frameworks).toEqual([]);
  });

  it("includes selected detector results when detectors option matches", async () => {
    const repoPath = await createReactFixtureRepo();
    const result = await scanRepo(repoPath, {
      detectors: ["language", "framework"],
    });

    expect(result.inventory.languages.length).toBeGreaterThan(0);
    expect(result.inventory.frameworks).toContain("React");
  });
});
