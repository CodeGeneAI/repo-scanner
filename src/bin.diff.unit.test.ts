import { describe, expect, it } from "bun:test";
import { rm } from "fs/promises";
import {
  createGitDiffFixtureRepo,
  decode,
  expectTopLevelKeys,
  runRepoScanner,
} from "./bin.unit.test.helpers";

describe("repo-scanner bin diff", () => {
  it("scopes --diff json output to diffScan payload", async () => {
    const result = runRepoScanner(["--diff", "HEAD~1", "--format", "json"]);

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(decode(result.stdout));
    expectTopLevelKeys(payload, [
      "scanPath",
      "timestamp",
      "durationMs",
      "diffScan",
    ]);
    expect(payload.diffScan).toBeDefined();
    expect(payload.architecture).toBeUndefined();
    expect(payload.inventory).toBeUndefined();
    expect(payload.buildAndTest).toBeUndefined();
    expect(payload.externalServices).toBeUndefined();
  });

  it("scopes --diff table output to diffScan payload", async () => {
    const result = runRepoScanner(["--diff", "HEAD~1"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("diffScan");
    expect(stdout).not.toContain("Architecture");
    expect(stdout).not.toContain("Inventory");
    expect(stdout).not.toContain("External Services");
    expect(stdout).not.toContain("Build & Test");
  });

  it("enables diff env-check when --fail-on-new-env-vars is provided", async () => {
    const repoPath = await createGitDiffFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--diff",
        "HEAD~1",
        "--fail-on-new-env-vars",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(decode(result.stdout));
      expect(payload.diffScan).toBeDefined();
      expect(Array.isArray(payload.diffScan.newEnvVars)).toBeTrue();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
