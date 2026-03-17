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

  // Dedup
  it("deduplicates Spring Boot from Gradle and Maven", async () => {
    await writeFile(
      path.join(tmpDir, "build.gradle"),
      "implementation 'org.springframework.boot:spring-boot-starter'",
    );
    await writeFile(
      path.join(tmpDir, "pom.xml"),
      "<artifactId>spring-boot-starter</artifactId>",
    );
    const { values } = await runFrameworkDetector(tmpDir);
    expect(values.filter((v) => v === "Spring Boot").length).toBe(1);
  });
});
