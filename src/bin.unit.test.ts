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

const createAllDetectorsFixtureRepo = async (): Promise<string> => {
  const repoPath = await createCoreProfileFixtureRepo();
  await mkdir(path.join(repoPath, "db"), { recursive: true });
  await writeFile(
    path.join(repoPath, "db", "schema.sql"),
    "CREATE TABLE users (id INT PRIMARY KEY, email TEXT);\n",
  );
  await writeFile(
    path.join(repoPath, "solid.ts"),
    "export class Service { run(): number { return 1; } }\n",
  );
  return repoPath;
};

const createEnvFixtureRepo = async (): Promise<string> => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "repo-scanner-env-"));
  await writeFile(path.join(repoPath, "README.md"), "# env fixture\n");
  await writeFile(
    path.join(repoPath, "index.ts"),
    "export const apiKey = process.env.OPENAI_API_KEY;\n",
  );
  return repoPath;
};

const runRepoScanner = (
  args: readonly string[],
  envOverrides?: Record<string, string>,
) =>
  Bun.spawnSync(
    [process.execPath, "packages/repo-scanner/src/bin.ts", ...args],
    {
      cwd: repoRootPath,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...envOverrides },
    },
  );

const expectTopLevelKeys = (
  payload: Record<string, unknown>,
  expectedKeys: readonly string[],
): void => {
  const keys = Object.keys(payload).sort();
  expect(keys).toEqual([...expectedKeys].sort());
};

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

  it("prints detector catalog for detectors subcommand", () => {
    const result = runRepoScanner(["detectors"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Supported detectors");
    expect(stdout).toContain("language");
    expect(stdout).toContain("repo-scanner --detectors");
  });

  it("prints detector schema for detectors --format json --schema", () => {
    const result = runRepoScanner([
      "detectors",
      "--format",
      "json",
      "--schema",
    ]);
    const payload = JSON.parse(decode(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(payload.$schema).toContain("detectors-v1.schema.json");
    expect(payload.detectors.length).toBeGreaterThan(0);
    expect(payload.presets["@inventory"].length).toBeGreaterThan(0);
  });

  it("prints bash completion script for completion subcommand", () => {
    const result = runRepoScanner(["completion", "bash"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("complete -F _repo_scanner repo-scanner");
    expect(stdout).toContain("--detectors");
  });

  it("prints zsh completion script without eager invocation", () => {
    const result = runRepoScanner(["completion", "zsh"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("#compdef repo-scanner");
    expect(stdout).toContain("compdef _repo_scanner repo-scanner");
    expect(stdout).not.toContain('_repo_scanner "$@"');
  });

  it("installs bash completion script in the user bash-completion path", async () => {
    const homePath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-home-"),
    );
    const xdgDataHome = path.join(homePath, ".xdg-data");

    try {
      const result = runRepoScanner(["completion", "install", "bash"], {
        HOME: homePath,
        XDG_DATA_HOME: xdgDataHome,
      });
      const stdout = decode(result.stdout);
      const completionFile = path.join(
        xdgDataHome,
        "bash-completion",
        "completions",
        "repo-scanner",
      );

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("Installed bash completion:");
      const content = await Bun.file(completionFile).text();
      expect(content).toContain("# bash completion for repo-scanner");
    } finally {
      await rm(homePath, { recursive: true, force: true });
    }
  });

  it("installs completion script for completion install subcommand", async () => {
    const homePath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-home-"),
    );

    try {
      const result = runRepoScanner(["completion", "install", "fish"], {
        HOME: homePath,
      });
      const stdout = decode(result.stdout);
      const completionFile = path.join(
        homePath,
        ".config",
        "fish",
        "completions",
        "repo-scanner.fish",
      );

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("Installed fish completion:");
      const content = await Bun.file(completionFile).text();
      expect(content).toContain("# fish completion for repo-scanner");
    } finally {
      await rm(homePath, { recursive: true, force: true });
    }
  });

  it("uninstalls completion script for completion uninstall subcommand", async () => {
    const homePath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-home-"),
    );

    try {
      const installResult = runRepoScanner(["completion", "install", "fish"], {
        HOME: homePath,
      });
      expect(installResult.exitCode).toBe(0);

      const uninstallResult = runRepoScanner(
        ["completion", "uninstall", "fish"],
        {
          HOME: homePath,
        },
      );
      const stdout = decode(uninstallResult.stdout);
      const completionFile = path.join(
        homePath,
        ".config",
        "fish",
        "completions",
        "repo-scanner.fish",
      );

      expect(uninstallResult.exitCode).toBe(0);
      expect(stdout).toContain("Removed fish completion:");
      expect(await Bun.file(completionFile).exists()).toBeFalse();
    } finally {
      await rm(homePath, { recursive: true, force: true });
    }
  });

  it("prints duplicate detector composition warnings to stderr", async () => {
    const repoPath = await createCliFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "@inventory,language,@quality,code-quality",
      ]);
      const stderr = decode(result.stderr);

      expect(result.exitCode).toBe(0);
      expect(stderr).toContain('[detectors] warning: detector "language"');
      expect(stderr).toContain('[detectors] warning: detector "code-quality"');
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

  it("shows detector-scoped output in table mode for explicit detector-only flags", async () => {
    const repoPath = await createEnvFixtureRepo();

    try {
      const result = runRepoScanner(["--path", repoPath, "--detectors", "env"]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("envVars");
      expect(stdout).toContain("OPENAI_API_KEY");
      expect(stdout).not.toContain("Inventory");
      expect(stdout).not.toContain("Architecture");
      expect(stdout).not.toContain("Build & Test");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("outputs only requested detector field in json mode for explicit detector-only flags", async () => {
    const repoPath = await createEnvFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "env",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(decode(result.stdout));

      expectTopLevelKeys(payload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "envVars",
      ]);
      expect(payload.envVars).toBeArray();
      expect(payload.envVars[0].name).toBe("OPENAI_API_KEY");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("splits monorepo and components outputs into separate selectors", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const monorepoOnly = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "monorepo",
        "--format",
        "json",
      ]);
      expect(monorepoOnly.exitCode).toBe(0);
      const monorepoPayload = JSON.parse(decode(monorepoOnly.stdout));
      expectTopLevelKeys(monorepoPayload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "monorepo",
      ]);
      expect(typeof monorepoPayload.monorepo).toBe("boolean");

      const componentsOnly = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "components",
        "--format",
        "json",
      ]);
      expect(componentsOnly.exitCode).toBe(0);
      const componentsPayload = JSON.parse(decode(componentsOnly.stdout));
      expectTopLevelKeys(componentsPayload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "components",
      ]);
      expect(componentsPayload.components).toBeArray();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("splits language outputs into language, language-stats, and codebase-size selectors", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const language = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "language",
        "--format",
        "json",
      ]);
      expect(language.exitCode).toBe(0);
      const languagePayload = JSON.parse(decode(language.stdout));
      expectTopLevelKeys(languagePayload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "languages",
      ]);

      const languageStats = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "language-stats",
        "--format",
        "json",
      ]);
      expect(languageStats.exitCode).toBe(0);
      const statsPayload = JSON.parse(decode(languageStats.stdout));
      expectTopLevelKeys(statsPayload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "languageStats",
      ]);

      const codebaseSize = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "codebase-size",
        "--format",
        "json",
      ]);
      expect(codebaseSize.exitCode).toBe(0);
      const sizePayload = JSON.parse(decode(codebaseSize.stdout));
      expectTopLevelKeys(sizePayload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "codebaseSize",
      ]);
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("falls back to language-stats names when confidence-filtered language list is empty", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-lang-"),
    );

    try {
      await writeFile(path.join(repoPath, "index.ts"), "export const x = 1;\n");

      const language = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "language",
        "--format",
        "json",
      ]);

      expect(language.exitCode).toBe(0);
      const payload = JSON.parse(decode(language.stdout));
      expectTopLevelKeys(payload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "languages",
      ]);
      expect(payload.languages).toContain("TypeScript");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("splits build outputs into tools and command selectors", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const build = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "build",
        "--format",
        "json",
      ]);
      expect(build.exitCode).toBe(0);
      const buildPayload = JSON.parse(decode(build.stdout));
      expectTopLevelKeys(buildPayload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "buildTools",
      ]);

      const commandSelectors = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "build-commands,test-commands,lint-commands",
        "--format",
        "json",
      ]);
      expect(commandSelectors.exitCode).toBe(0);
      const commandsPayload = JSON.parse(decode(commandSelectors.stdout));
      expectTopLevelKeys(commandsPayload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "buildCommands",
        "testCommands",
        "lintCommands",
      ]);
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("splits architecture graph and derived analysis selectors", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const graph = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "cross-package-deps",
        "--format",
        "json",
      ]);
      expect(graph.exitCode).toBe(0);
      const graphPayload = JSON.parse(decode(graph.stdout));
      expectTopLevelKeys(graphPayload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "crossPackageDeps",
      ]);

      const derived = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "circular-deps,layer-violations,high-impact-components",
        "--format",
        "json",
      ]);
      expect(derived.exitCode).toBe(0);
      const derivedPayload = JSON.parse(decode(derived.stdout));
      expectTopLevelKeys(derivedPayload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "circularDeps",
        "layerViolations",
        "highImpactComponents",
      ]);
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("composes vcs with other detector outputs", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "vcs,language",
        "--format",
        "json",
      ]);
      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(decode(result.stdout));
      expectTopLevelKeys(payload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "vcs",
        "languages",
      ]);
      expect(payload.languages).toBeArray();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("emits explicit union for mixed section and detector selectors", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--inventory",
        "--detectors",
        "monorepo",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(decode(result.stdout));
      expect(payload.inventory).toBeDefined();
      expect(payload.monorepo).toBeDefined();
      expect(payload.architecture).toBeUndefined();
      expect(payload.buildAndTest).toBeUndefined();
      expect(payload.externalServices).toBeUndefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("treats --full-scan as an alias for --all-detectors", async () => {
    const repoPath = await createAllDetectorsFixtureRepo();

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
      expect(allPayload.inventory.solidHealth).toBeDefined();
      expect(fullPayload.inventory.solidHealth).toBeDefined();
      expect(allPayload.inventory.databaseSchema).toBeDefined();
      expect(fullPayload.inventory.databaseSchema).toBeDefined();
      expect(decode(allDetectors.stdout)).toContain('"signals"');
      expect(decode(fullScan.stdout)).toContain('"signals"');
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("generates erd diagram via --topology-diagrams erd with sql fixture", async () => {
    const repoPath = await mkdtemp(path.join(os.tmpdir(), "repo-scanner-erd-"));

    try {
      await writeFile(path.join(repoPath, "README.md"), "# fixture\n");
      await mkdir(path.join(repoPath, "db"), { recursive: true });
      await writeFile(
        path.join(repoPath, "db", "schema.sql"),
        `CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  user_id INT NOT NULL,
  total DECIMAL(10,2),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
      );

      const result = runRepoScanner([
        "--path",
        repoPath,
        "--topology-diagrams",
        "erd",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);

      const payload = JSON.parse(decode(result.stdout));
      expect(payload.topology).toBeDefined();
      expect(payload.topology.diagrams).toBeArrayOfSize(1);
      expect(payload.topology.diagrams[0].kind).toBe("erd");
      expect(payload.topology.diagrams[0].mermaid).toContain("erDiagram");
      expect(payload.topology.diagrams[0].mermaid).toContain("users");
      expect(payload.topology.diagrams[0].mermaid).toContain("orders");
      expect(payload.scanPath).toBeUndefined();
      expect(payload.architecture).toBeUndefined();
      expect(payload.inventory).toBeUndefined();
      expect(payload.buildAndTest).toBeUndefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("emits topology-only output for --topology-diagrams erd in table mode", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-erd-table-only-"),
    );

    try {
      await writeFile(path.join(repoPath, "README.md"), "# fixture\n");
      await mkdir(path.join(repoPath, "db"), { recursive: true });
      await writeFile(
        path.join(repoPath, "db", "schema.sql"),
        "CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));",
      );

      const result = runRepoScanner([
        "--path",
        repoPath,
        "--topology-diagrams",
        "erd",
      ]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("# Topology");
      expect(stdout).toContain("Entity-Relationship Diagram");
      expect(stdout).not.toContain("Architecture");
      expect(stdout).not.toContain("Inventory");
      expect(stdout).not.toContain("Build & Test");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("writes erd diagram to file via --topology-output", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-erd-file-"),
    );
    const outputPath = path.join(repoPath, "erd-output.md");

    try {
      await writeFile(path.join(repoPath, "README.md"), "# fixture\n");
      await mkdir(path.join(repoPath, "db"), { recursive: true });
      await writeFile(
        path.join(repoPath, "db", "schema.sql"),
        "CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));",
      );

      const result = runRepoScanner([
        "--path",
        repoPath,
        "--topology-diagrams",
        "erd",
        "--topology-output",
        outputPath,
      ]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);

      const fileContent = await Bun.file(outputPath).text();
      expect(fileContent).toContain("erDiagram");
      expect(fileContent).toContain("users");
      expect(stdout).not.toContain("Architecture");
      expect(stdout).not.toContain("Inventory");
      expect(stdout).not.toContain("Build & Test");
      expect(stdout).not.toContain("# Topology");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("emits explicit union output for --topology-diagrams erd + --deps in json mode", async () => {
    const repoPath = await createCliFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--deps",
        "--no-security",
        "--no-usage",
        "--no-version-lookup",
        "--topology-diagrams",
        "erd",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);

      const payload = JSON.parse(decode(result.stdout));
      expect(payload.topology).toBeDefined();
      expect(payload.dependencies).toBeDefined();
      expect(payload.policyEvaluation).toBeDefined();
      expect(payload.architecture).toBeUndefined();
      expect(payload.inventory).toBeUndefined();
      expect(payload.buildAndTest).toBeUndefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("gracefully skips erd when no schema files exist", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-erd-empty-"),
    );

    try {
      await writeFile(path.join(repoPath, "README.md"), "# fixture\n");
      await writeFile(
        path.join(repoPath, "index.ts"),
        "export const ok = true;\n",
      );

      const result = runRepoScanner([
        "--path",
        repoPath,
        "--topology-diagrams",
        "erd",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);

      const payload = JSON.parse(decode(result.stdout));
      expect(payload.topology).toBeDefined();
      expect(payload.topology.diagrams).toBeArrayOfSize(0);
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

  it("emits explicit union output for mixed section + topology flags (table)", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-mixed-topology-table-"),
    );

    try {
      await writeFile(path.join(repoPath, "README.md"), "# fixture\n");
      await writeFile(
        path.join(repoPath, "package.json"),
        JSON.stringify({ name: "fixture", version: "1.0.0" }),
      );
      await mkdir(path.join(repoPath, "db"), { recursive: true });
      await writeFile(
        path.join(repoPath, "db", "schema.sql"),
        "CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));",
      );

      const result = runRepoScanner([
        "--path",
        repoPath,
        "--inventory",
        "--topology-diagrams",
        "erd",
      ]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("Inventory");
      expect(stdout).toContain("# Topology");
      expect(stdout).not.toContain("Architecture");
      expect(stdout).not.toContain("Build & Test");
      expect(stdout).not.toContain("External Services");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("emits explicit union output for mixed section + topology flags (json)", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-mixed-topology-json-"),
    );

    try {
      await writeFile(path.join(repoPath, "README.md"), "# fixture\n");
      await writeFile(
        path.join(repoPath, "package.json"),
        JSON.stringify({ name: "fixture", version: "1.0.0" }),
      );
      await mkdir(path.join(repoPath, "db"), { recursive: true });
      await writeFile(
        path.join(repoPath, "db", "schema.sql"),
        "CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));",
      );

      const result = runRepoScanner([
        "--path",
        repoPath,
        "--inventory",
        "--topology-diagrams",
        "erd",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);

      const payload = JSON.parse(decode(result.stdout));
      expect(payload.scanPath).toBeDefined();
      expect(payload.timestamp).toBeDefined();
      expect(payload.durationMs).toBeDefined();
      expect(payload.inventory).toBeDefined();
      expect(payload.topology).toBeDefined();
      expect(payload.architecture).toBeUndefined();
      expect(payload.externalServices).toBeUndefined();
      expect(payload.buildAndTest).toBeUndefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
