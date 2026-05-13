import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  createCoreProfileFixtureRepo,
  decode,
  runRepoScanner,
} from "./bin.unit.test.helpers";

describe("repo-scanner bin output selectors", () => {
  it("renders full table output when no --detectors is provided", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner(["--path", repoPath]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("repo-scanner");
      expect(stdout).toContain("Languages");
      expect(stdout).toContain("Frameworks");
      expect(stdout).toContain("Components");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("renders full JSON output when no --detectors is provided", async () => {
    const repoPath = await createCoreProfileFixtureRepo();

    try {
      const result = runRepoScanner(["--path", repoPath, "--format", "json"]);

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(decode(result.stdout));
      expect(payload.architecture).toBeDefined();
      expect(payload.inventory).toBeDefined();
      expect(payload.rootPath).toBeDefined();
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
      expect(stdout).toContain("Frameworks");
      expect(stdout).toContain("repo-scanner");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("outputs canonical schema in json mode for explicit detector-only flags", async () => {
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

      expect(payload.architecture).toBeDefined();
      expect(payload.inventory).toBeDefined();
      expect(payload.inventory.frameworks).toBeArray();
      expect(payload.rootPath).toBeDefined();
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
      expect(monorepoPayload.architecture).toBeDefined();
      expect(monorepoPayload.architecture).toHaveProperty("monorepo");
      expect(typeof monorepoPayload.architecture.monorepo).toBe("boolean");
      expect(monorepoPayload.rootPath).toBeDefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("emits language selector output in canonical schema", async () => {
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
      expect(languagePayload.inventory).toBeDefined();
      expect(languagePayload.inventory.languages).toBeDefined();
      expect(languagePayload.rootPath).toBeDefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("emits language stats when confidence-filtered language list is empty", async () => {
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
      expect(payload.inventory).toBeDefined();
      expect(payload.languageStats).toBeDefined();
      expect(payload.rootPath).toBeDefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
