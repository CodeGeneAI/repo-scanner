import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { scanRepo } from "./scanner";

const tempDirs: string[] = [];

const createTempRepo = async (): Promise<string> => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "repo-scanner-"));
  tempDirs.push(repoPath);
  await writeFile(path.join(repoPath, "README.md"), "# test repo\n");
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
});
