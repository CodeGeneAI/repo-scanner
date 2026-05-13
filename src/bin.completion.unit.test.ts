import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import {
  createCliFixtureRepo,
  decode,
  runRepoScanner,
} from "./bin.unit.test.helpers";

describe("repo-scanner bin completion", () => {
  it("prints detector catalog for detectors subcommand", () => {
    const result = runRepoScanner(["detectors"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Supported detectors");
    expect(stdout).toContain("language");
    expect(stdout).toContain("repo-scanner --detectors");
  });

  it("prints detector catalog as JSON for detectors --format json", () => {
    const result = runRepoScanner(["detectors", "--format", "json"]);
    const payload = JSON.parse(decode(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(payload.detectors.length).toBe(3);
    expect(payload.presets).toBeUndefined();
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
        "language,framework,language",
      ]);
      const stderr = decode(result.stderr);

      expect(result.exitCode).toBe(0);
      expect(stderr).toContain('[detectors] warning: detector "language"');
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
