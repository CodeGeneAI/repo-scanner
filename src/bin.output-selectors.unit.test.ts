import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  createAllDetectorsFixtureRepo,
  createCoreProfileFixtureRepo,
  decode,
  expectTopLevelKeys,
  runRepoScanner,
} from "./bin.unit.test.helpers";

describe("repo-scanner bin output selectors", () => {
  it("prints help output when no scan selectors are provided", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner(["--path", repoPath]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("Usage: repo-scanner [command] [options]");
      expect(stdout).toContain("Core output profile:");
      expect(stdout).not.toContain("repo-scanner — scanned");
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
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "todo",
      ]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("todoAnnotations");
      expect(stdout).not.toContain("Inventory");
      expect(stdout).not.toContain("Architecture");
      expect(stdout).not.toContain("Build & Test");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("outputs only requested detector field in json mode for explicit detector-only flags", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--detectors",
        "todo",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(decode(result.stdout));

      expectTopLevelKeys(payload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "todoAnnotations",
      ]);
      expect(payload.todoAnnotations).toBeArray();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("emits monorepo detector output via --detectors selector", async () => {
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
      expect(decode(allDetectors.stdout)).toContain('"signals"');
      expect(decode(fullScan.stdout)).toContain('"signals"');
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
