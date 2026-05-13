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

  it("supports single-section output for --architecture", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner(["--path", repoPath, "--architecture"]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("Architecture");
      expect(stdout).not.toContain("Inventory");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("supports multi-section output for --architecture --inventory", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner([
        "--path",
        repoPath,
        "--architecture",
        "--inventory",
      ]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("Architecture");
      expect(stdout).toContain("Inventory");
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
        "framework",
      ]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("frameworks");
      expect(stdout).not.toContain("Inventory");
      expect(stdout).not.toContain("Architecture");
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
        "framework",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(decode(result.stdout));

      expectTopLevelKeys(payload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "frameworks",
      ]);
      expect(payload.frameworks).toBeArray();
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

  it("emits language selector output", async () => {
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
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
