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

const createBuildAndCiRepo = async (): Promise<string> => {
  const repoPath = await createTempRepo();
  await mkdir(path.join(repoPath, ".github", "workflows"), { recursive: true });
  await writeFile(
    path.join(repoPath, ".github", "workflows", "ci.yml"),
    "name: ci\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n",
  );
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        version: "1.0.0",
        scripts: {
          build: "tsc -p tsconfig.json",
          test: "vitest run",
          lint: "biome check .",
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
  it("returns baseline result when dependency scan is disabled", async () => {
    const repoPath = await createTempRepo();
    const result = await scanRepo(repoPath);

    expect(result.dependencies).toBeUndefined();
    expect(result.scanPath).toContain("repo-scanner-");
  });

  it("attaches dependency scan result when enabled", async () => {
    const repoPath = await createTempRepo();
    const result = await scanRepo(repoPath, {
      dependencies: {
        enabled: true,
        ecosystems: [],
        skipSecurity: true,
        skipUsage: true,
        concurrency: 1,
      },
    });

    expect(result.dependencies).toBeDefined();
    expect(result.dependencies?.totalDependencies).toBe(0);
    expect(result.dependencies?.totalVulnerabilities).toBe(0);
  });

  it("filters detectors when enabledDetectorIds are provided", async () => {
    const repoPath = await createBuildAndCiRepo();
    const result = await scanRepo(repoPath, {
      enabledDetectorIds: ["language"],
    });

    expect(result.buildAndTest.ciSystems).toEqual([]);
    expect(result.buildAndTest.buildCommands).toEqual([]);
    expect(result.buildAndTest.testCommands).toEqual([]);
    expect(result.buildAndTest.lintCommands).toEqual([]);
    expect(result.inventory.languages.length).toBeGreaterThanOrEqual(0);
  });

  it("includes selected detector results when enabledDetectorIds match", async () => {
    const repoPath = await createBuildAndCiRepo();
    const result = await scanRepo(repoPath, {
      enabledDetectorIds: ["build", "ci"],
    });

    expect(result.buildAndTest.ciSystems).toContain("GitHub Actions");
    expect(result.buildAndTest.buildCommands.length).toBeGreaterThan(0);
    expect(result.buildAndTest.testCommands.length).toBeGreaterThan(0);
    expect(result.buildAndTest.lintCommands.length).toBeGreaterThan(0);
  });
});
