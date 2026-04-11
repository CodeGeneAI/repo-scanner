import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  createCliFixtureRepo,
  createCoreProfileFixtureRepo,
  decode,
  expectTopLevelKeys,
  runRepoScanner,
} from "./bin.unit.test.helpers";

describe("repo-scanner bin topology", () => {
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
      expect(payload.policyEvaluation).toBeUndefined();
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

      expectTopLevelKeys(payload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "externalServices",
      ]);
      expect(payload.externalServices).toBeDefined();
      expect(payload.architecture).toBeUndefined();
      expect(payload.inventory).toBeUndefined();
      expect(payload.buildAndTest).toBeUndefined();
      expect(payload.vcs).toBeUndefined();
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
      expectTopLevelKeys(payload, [
        "scanPath",
        "timestamp",
        "durationMs",
        "inventory",
        "topology",
      ]);
      expect(payload.inventory).toBeDefined();
      expect(payload.topology).toBeDefined();
      expect(payload.architecture).toBeUndefined();
      expect(payload.externalServices).toBeUndefined();
      expect(payload.buildAndTest).toBeUndefined();
      expect(payload.vcs).toBeUndefined();
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
