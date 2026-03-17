import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";
import type { Detector, DetectorResult } from "./types";

function findDetector(id: string): Detector {
  const detector = getDetectors().find((d) => d.id === id);
  if (!detector) throw new Error(`Detector "${id}" not found in registry`);
  return detector;
}

async function runDatastoreDetector(
  tmpDir: string,
): Promise<{ values: string[]; result: DetectorResult }> {
  const detector = findDetector("datastore");
  const index = await FileIndex.build(tmpDir);
  const result = await detector.detect(tmpDir, index);
  return { values: result.findings.map((f) => f.value), result };
}

describe("datastore detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-datastore-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Python
  it("detects PostgreSQL from Python psycopg2", async () => {
    await writeFile(path.join(tmpDir, "requirements.txt"), "psycopg2==2.9.9\n");
    const { values } = await runDatastoreDetector(tmpDir);
    expect(values).toContain("PostgreSQL");
  });

  it("detects SQLAlchemy from pyproject.toml", async () => {
    await writeFile(
      path.join(tmpDir, "pyproject.toml"),
      '[project]\ndependencies = ["sqlalchemy>=2.0"]',
    );
    const { values } = await runDatastoreDetector(tmpDir);
    expect(values).toContain("SQLAlchemy");
  });

  // Go
  it("detects PostgreSQL from Go pgx", async () => {
    await writeFile(
      path.join(tmpDir, "go.mod"),
      "require github.com/jackc/pgx v5.0.0",
    );
    const { values } = await runDatastoreDetector(tmpDir);
    expect(values).toContain("PostgreSQL");
  });

  it("detects GORM from go.mod", async () => {
    await writeFile(
      path.join(tmpDir, "go.mod"),
      "require gorm.io/gorm v1.25.0",
    );
    const { values } = await runDatastoreDetector(tmpDir);
    expect(values).toContain("GORM");
  });

  // Rust
  it("detects Diesel from Cargo.toml", async () => {
    await writeFile(
      path.join(tmpDir, "Cargo.toml"),
      '[dependencies]\ndiesel = "2.1.0"',
    );
    const { values } = await runDatastoreDetector(tmpDir);
    expect(values).toContain("Diesel");
  });

  // Ruby
  it("detects MongoDB from Gemfile via mongoid", async () => {
    await writeFile(path.join(tmpDir, "Gemfile"), "gem 'mongoid'");
    const { values } = await runDatastoreDetector(tmpDir);
    expect(values).toContain("MongoDB");
  });

  // Java / JVM
  it("detects Spring Data JPA from build.gradle", async () => {
    await writeFile(
      path.join(tmpDir, "build.gradle"),
      "implementation 'org.springframework.boot:spring-boot-starter-data-jpa'",
    );
    const { values } = await runDatastoreDetector(tmpDir);
    expect(values).toContain("Spring Data JPA");
  });

  // PHP
  it("detects Doctrine ORM from composer.json", async () => {
    await writeFile(
      path.join(tmpDir, "composer.json"),
      JSON.stringify({ require: { "doctrine/orm": "^2.15" } }),
    );
    const { values } = await runDatastoreDetector(tmpDir);
    expect(values).toContain("Doctrine ORM");
  });

  // npm extras
  it("detects DynamoDB from npm @aws-sdk/client-dynamodb", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: { "@aws-sdk/client-dynamodb": "^3.0.0" },
      }),
    );
    const { values } = await runDatastoreDetector(tmpDir);
    expect(values).toContain("DynamoDB");
  });
});
