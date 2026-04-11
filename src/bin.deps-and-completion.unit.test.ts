import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  createCliFixtureRepo,
  createDuplicateDependencyFixtureRepo,
  decode,
  expectTopLevelKeys,
  runRepoScanner,
} from "./bin.unit.test.helpers";

describe("repo-scanner bin dependencies and completion", () => {
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
      expectTopLevelKeys(payload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "dependencies",
      ]);
      expect(payload.dependencies).toBeDefined();
      expect(payload.policyEvaluation).toBeUndefined();
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

  it("deduplicates --deps summary counts by package key", async () => {
    const repoPath = await createDuplicateDependencyFixtureRepo();

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
      expect(payload.dependencies.totalDependencies).toBe(1);
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
      expectTopLevelKeys(payload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "dependencies",
        "policyEvaluation",
      ]);
      expect(payload.dependencies).toBeDefined();
      expect(payload.policyEvaluation).toBeDefined();
      expect(payload.architecture).toBeUndefined();
      expect(payload.inventory).toBeUndefined();
      expect(payload.externalServices).toBeUndefined();
      expect(payload.buildAndTest).toBeUndefined();
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
      expectTopLevelKeys(payload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "policyEvaluation",
      ]);
      expect(payload.dependencies).toBeUndefined();
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
    expect(stdout).toContain('_repo_scanner "$@"');
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

  it("installs zsh completion into Homebrew site-functions when available", async () => {
    const homePath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-homebrew-home-"),
    );
    const homebrewPrefix = path.join(homePath, "homebrew");
    const siteFunctionsDir = path.join(
      homebrewPrefix,
      "share",
      "zsh",
      "site-functions",
    );
    await mkdir(siteFunctionsDir, { recursive: true });

    try {
      const result = runRepoScanner(["completion", "install", "zsh"], {
        HOME: homePath,
        HOMEBREW_PREFIX: homebrewPrefix,
      });
      const stdout = decode(result.stdout);
      const completionFile = path.join(siteFunctionsDir, "_repo-scanner");

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("Installed zsh completion:");
      const content = await Bun.file(completionFile).text();
      expect(content).toContain("#compdef repo-scanner");
      expect(content).toContain('_repo_scanner "$@"');
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
      expect(payload.dependencies).toBeUndefined();
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
      expect(payload.dependencies).toBeUndefined();
      expect(payload.policyEvaluation.deadDeps.count).toBe(1);
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
});
