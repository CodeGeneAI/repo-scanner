import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";
import type { Detector, DetectorResult } from "./types";

function findDetector(id: string): Detector {
  const detector = getDetectors().find((d) => d.id === id);
  if (!detector) throw new Error(`Detector "${id}" not found in registry`);
  return detector;
}

async function runFrameworkDetector(
  tmpDir: string,
): Promise<{ values: string[]; result: DetectorResult }> {
  const detector = findDetector("framework");
  const index = await FileIndex.build(tmpDir);
  const result = await detector.detect(tmpDir, index);
  return { values: result.findings.map((f) => f.value), result };
}

describe("framework detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-framework-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Java / JVM
  it("detects Spring Boot from build.gradle", async () => {
    await writeFile(
      path.join(tmpDir, "build.gradle"),
      "implementation 'org.springframework.boot:spring-boot-starter-web'",
    );
    const { values } = await runFrameworkDetector(tmpDir);
    expect(values).toContain("Spring Boot");
  });

  it("detects Micronaut from pom.xml", async () => {
    await writeFile(
      path.join(tmpDir, "pom.xml"),
      "<groupId>io.micronaut</groupId>",
    );
    const { values } = await runFrameworkDetector(tmpDir);
    expect(values).toContain("Micronaut");
  });

  it("detects Ktor from build.gradle.kts", async () => {
    await writeFile(
      path.join(tmpDir, "build.gradle.kts"),
      'implementation("io.ktor:ktor-server-core:2.3.0")',
    );
    const { values } = await runFrameworkDetector(tmpDir);
    expect(values).toContain("Ktor");
  });

  // PHP
  it("detects Laravel from composer.json", async () => {
    await writeFile(
      path.join(tmpDir, "composer.json"),
      JSON.stringify({ require: { "laravel/framework": "^10.0" } }),
    );
    const { values } = await runFrameworkDetector(tmpDir);
    expect(values).toContain("Laravel");
  });

  it("detects Symfony from composer.json", async () => {
    await writeFile(
      path.join(tmpDir, "composer.json"),
      JSON.stringify({ require: { "symfony/framework-bundle": "^6.0" } }),
    );
    const { values } = await runFrameworkDetector(tmpDir);
    expect(values).toContain("Symfony");
  });

  // Scala
  it("detects Play Framework from build.sbt", async () => {
    await writeFile(
      path.join(tmpDir, "build.sbt"),
      '"com.typesafe.play" %% "play" % "2.9.0"',
    );
    const { values } = await runFrameworkDetector(tmpDir);
    expect(values).toContain("Play Framework");
  });

  it("detects ZIO from build.sbt", async () => {
    await writeFile(
      path.join(tmpDir, "build.sbt"),
      '"dev.zio" %% "zio" % "2.0.0"',
    );
    const { values } = await runFrameworkDetector(tmpDir);
    expect(values).toContain("ZIO");
  });

  // Python
  it("detects Werkzeug and Jinja2 from pyproject.toml deps", async () => {
    await writeFile(
      path.join(tmpDir, "pyproject.toml"),
      `[project]\nname = "myapp"\ndependencies = [\n  "werkzeug>=3",\n  "jinja2",\n  "markupsafe",\n]\n`,
    );
    const { result } = await runFrameworkDetector(tmpDir);
    const names = result.findings.map((f) => f.value);
    expect(names).toContain("Werkzeug");
    expect(names).toContain("Jinja2");
    expect(names).toContain("MarkupSafe");
  });

  // tRPC / Drizzle / Better Auth / TanStack
  it("detects tRPC, Drizzle, Better Auth, and TanStack Query from package.json deps", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: {
          "@trpc/server": "^11",
          "@trpc/client": "^11",
          "drizzle-orm": "^0.30",
          "better-auth": "^1",
          "@tanstack/react-query": "^5",
        },
      }),
    );
    const { result } = await runFrameworkDetector(tmpDir);
    const names = result.findings.map((f) => f.value);
    expect(names).toContain("tRPC");
    expect(names).toContain("Drizzle");
    expect(names).toContain("Better Auth");
    expect(names).toContain("TanStack Query");
  });

  // TanStack Start
  it("detects @tanstack/react-start as TanStack Start", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: { "@tanstack/react-start": "^1" },
      }),
    );
    const { values } = await runFrameworkDetector(tmpDir);
    expect(values).toContain("TanStack Start");
  });

  // Dedup — createFindingAdder dedupes by (name, filePath); same name from
  // different files produces one Finding per file. The aggregator uses a Set
  // so the framework still appears once in the final output per component.
  it("emits one Spring Boot finding per source file (build.gradle + pom.xml)", async () => {
    await writeFile(
      path.join(tmpDir, "build.gradle"),
      "implementation 'org.springframework.boot:spring-boot-starter'",
    );
    await writeFile(
      path.join(tmpDir, "pom.xml"),
      "<artifactId>spring-boot-starter</artifactId>",
    );
    const { values } = await runFrameworkDetector(tmpDir);
    expect(values.filter((v) => v === "Spring Boot").length).toBe(2);
  });

  it("emits Finding.filePath pointing at the source manifest", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "rs-fp-"));
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { next: "^15", react: "^19" } }),
    );
    const result = await runFrameworkDetector(dir);
    const nextFinding = result.result.findings.find(
      (f) => f.value === "Next.js",
    );
    expect(nextFinding?.filePath).toBe("package.json");
    const reactFinding = result.result.findings.find(
      (f) => f.value === "React",
    );
    expect(reactFinding?.filePath).toBe("package.json");
    await rm(dir, { recursive: true, force: true });
  });
});
