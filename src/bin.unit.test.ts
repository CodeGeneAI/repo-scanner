import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";

const repoRootPath = path.resolve(import.meta.dir, "../../..");
const textDecoder = new TextDecoder();
const decode = (value: ArrayBufferLike | ArrayBufferView): string =>
  textDecoder.decode(value);

const createCliFixtureRepo = async (): Promise<string> => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "repo-scanner-cli-"));

  await writeFile(path.join(repoPath, "README.md"), "# fixture\n");
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        version: "1.0.0",
        dependencies: {
          lodash: "^4.17.21",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(repoPath, "index.ts"),
    "import lodash from 'lodash';\n",
  );

  return repoPath;
};

const createCoreProfileFixtureRepo = async (): Promise<string> => {
  const repoPath = await mkdtemp(
    path.join(os.tmpdir(), "repo-scanner-core-profile-"),
  );

  await mkdir(path.join(repoPath, ".github", "workflows"), { recursive: true });
  await writeFile(path.join(repoPath, "README.md"), "# core fixture\n");
  await writeFile(
    path.join(repoPath, ".github", "workflows", "ci.yml"),
    "name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
  );
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "fixture-core",
        version: "1.0.0",
        dependencies: {
          "@openrouter/ai-sdk-provider": "^2.0.0",
          ai: "^6.0.0",
        },
        scripts: {
          build: "tsc -p tsconfig.json",
          test: "vitest run",
          lint: "biome check --diagnostic-level=error",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(repoPath, "index.ts"), "export const ok = true;\n");

  return repoPath;
};

const runRepoScanner = (args: readonly string[]) =>
  Bun.spawnSync(
    [process.execPath, "packages/repo-scanner/src/bin.ts", ...args],
    {
      cwd: repoRootPath,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    },
  );

describe("repo-scanner bin", () => {
  it("returns dependency section for --deps json scan", async () => {
    const repoPath = await createCliFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--deps",
        "--no-security",
        "--no-usage",
        "--no-version-lookup",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);

      const payload = JSON.parse(new TextDecoder().decode(result.stdout));
      expect(payload.dependencies).toBeDefined();
      expect(payload.policyEvaluation).toBeDefined();
      expect(payload.dependencies.totalDependencies).toBeGreaterThanOrEqual(1);
      expect(
        Array.isArray(payload.dependencies.summary.topOutdated),
      ).toBeTrue();
      expect(
        Array.isArray(payload.dependencies.summary.topVulnerable),
      ).toBeTrue();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("supports --fail-on-vulns without findings", async () => {
    const repoPath = await createCliFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--deps",
        "--no-security",
        "--no-usage",
        "--no-version-lookup",
        "--fail-on-vulns",
        "--severity-threshold",
        "high",
      ]);

      expect(result.exitCode).toBe(0);
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("emits complete json when policy evaluation is enabled", async () => {
    const repoPath = await createCliFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--deps",
        "--no-security",
        "--no-usage",
        "--no-version-lookup",
        "--fail-on-outdated-count",
        "1",
        "--format",
        "json",
      ]);

      expect([0, 1]).toContain(result.exitCode);

      const output = new TextDecoder().decode(result.stdout);
      const payload = JSON.parse(output);
      expect(payload.dependencies).toBeDefined();
      expect(payload.policyEvaluation).toBeDefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("enables dependency scan when policy flags are used without --deps", async () => {
    const repoPath = await createCliFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--no-security",
        "--no-usage",
        "--no-version-lookup",
        "--fail-on-vulns",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);

      const payload = JSON.parse(new TextDecoder().decode(result.stdout));
      expect(payload.dependencies).toBeDefined();
      expect(payload.policyEvaluation).toBeDefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("fails for invalid --ecosystems input", () => {
    const result = runRepoScanner(["--deps", "--ecosystems", "npmm"]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      "invalid ecosystems",
    );
  });

  it("fails for missing --concurrency value", () => {
    const result = runRepoScanner([
      "--deps",
      "--concurrency",
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      "--concurrency requires a positive integer value",
    );
  });

  it("prints dependency debug stats when --deps-debug is enabled", async () => {
    const repoPath = await createCliFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--deps",
        "--deps-debug",
        "--no-security",
        "--no-usage",
        "--no-version-lookup",
      ]);

      expect(result.exitCode).toBe(0);
      expect(new TextDecoder().decode(result.stderr)).toContain(
        "[deps-debug] vulnerability keys:",
      );
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("emits dry-check compatibility json when --dry-check is enabled", async () => {
    const repoPath = await createCliFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--dry-check",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(new TextDecoder().decode(result.stdout));
      expect(payload.scanPath).toBeDefined();
      expect(payload.stats).toBeDefined();
      expect(Array.isArray(payload.groups)).toBeTrue();
      expect(payload.inventory).toBeUndefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("enables dependency scan when --fail-on-dead-deps is used without --deps", async () => {
    const repoPath = await createCliFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--no-security",
        "--no-version-lookup",
        "--fail-on-dead-deps",
        "--format",
        "json",
      ]);

      // lodash IS used in fixture, so may or may not have dead deps
      expect([0, 1]).toContain(result.exitCode);

      const payload = JSON.parse(new TextDecoder().decode(result.stdout));
      expect(payload.dependencies).toBeDefined();
      expect(payload.policyEvaluation).toBeDefined();
      expect(payload.policyEvaluation.deadDeps).toBeDefined();
      expect(typeof payload.policyEvaluation.deadDeps.count).toBe("number");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("forces usage scanning when --fail-on-dead-deps overrides --no-usage", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-dead-override-"),
    );

    try {
      await writeFile(path.join(repoPath, "README.md"), "# fixture\n");
      await writeFile(
        path.join(repoPath, "package.json"),
        JSON.stringify({
          name: "fixture",
          version: "1.0.0",
          dependencies: { "unused-pkg": "^1.0.0" },
        }),
      );

      const result = runRepoScanner([
        "--path",
        repoPath,
        "--no-security",
        "--no-version-lookup",
        "--no-usage",
        "--fail-on-dead-deps",
        "--format",
        "json",
      ]);

      // --fail-on-dead-deps overrides --no-usage, so unused-pkg detected as dead → exit 1
      expect(result.exitCode).toBe(1);

      const payload = JSON.parse(new TextDecoder().decode(result.stdout));
      expect(payload.dependencies.summary.deadDependencies).toBe(1);
      expect(payload.policyEvaluation.deadDeps.failed).toBeTrue();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("includes topDead and deadDependencies in JSON output", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-dead-json-"),
    );

    try {
      await writeFile(path.join(repoPath, "README.md"), "# fixture\n");
      await writeFile(
        path.join(repoPath, "package.json"),
        JSON.stringify({
          name: "fixture",
          version: "1.0.0",
          dependencies: { "dead-a": "^1.0.0", "dead-b": "^1.0.0" },
        }),
      );

      const result = runRepoScanner([
        "--path",
        repoPath,
        "--deps",
        "--no-security",
        "--no-version-lookup",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);

      const payload = JSON.parse(new TextDecoder().decode(result.stdout));
      expect(payload.dependencies.summary.deadDependencies).toBe(2);
      expect(payload.dependencies.summary.topDead).toHaveLength(2);
      expect(payload.dependencies.summary.topDead[0].name).toBe("dead-a");
      expect(payload.dependencies.summary.topDead[0].ecosystem).toBe("npm");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("defaults to core profile sections and omits signals in table output", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner(["--path", repoPath]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("Architecture");
      expect(stdout).toContain("Inventory");
      expect(stdout).toContain("External Services");
      expect(stdout).toContain("Build & Test");
      expect(stdout).not.toContain("Signals");
      expect(stdout).not.toContain("API Surface");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("supports single-section output for --external-services", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--external-services",
      ]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("External Services");
      expect(stdout).not.toContain("Architecture");
      expect(stdout).not.toContain("Inventory");
      expect(stdout).not.toContain("Build & Test");
      expect(stdout).not.toContain("Signals");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("supports multi-section output for --architecture --build-and-test", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--architecture",
        "--build-and-test",
      ]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("Architecture");
      expect(stdout).toContain("Build & Test");
      expect(stdout).not.toContain("Inventory");
      expect(stdout).not.toContain("External Services");
      expect(stdout).not.toContain("Signals");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("treats --full-scan as an alias for --all-detectors", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const allDetectors = runRepoScanner([
        "--path",
        repoPath,
        "--all-detectors",
        "--format",
        "json",
      ]);
      const fullScan = runRepoScanner([
        "--path",
        repoPath,
        "--full-scan",
        "--format",
        "json",
      ]);

      expect(allDetectors.exitCode).toBe(0);
      expect(fullScan.exitCode).toBe(0);

      const allPayload = JSON.parse(decode(allDetectors.stdout));
      const fullPayload = JSON.parse(decode(fullScan.stdout));

      const normalize = (payload: Record<string, unknown>) => ({
        ...payload,
        timestamp: "",
        durationMs: 0,
      });

      expect(normalize(fullPayload)).toEqual(normalize(allPayload));
      expect(decode(allDetectors.stdout)).toContain('"signals"');
      expect(decode(fullScan.stdout)).toContain('"signals"');
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("emits section-only json payload for section mode", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--external-services",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(decode(result.stdout));

      expect(payload.externalServices).toBeDefined();
      expect(payload.architecture).toBeUndefined();
      expect(payload.inventory).toBeUndefined();
      expect(payload.buildAndTest).toBeUndefined();
      expect(payload.scanPath).toBeDefined();
      expect(payload.timestamp).toBeDefined();
      expect(payload.durationMs).toBeDefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
