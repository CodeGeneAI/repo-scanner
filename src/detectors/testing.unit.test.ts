import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
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

async function runTestingDetector(
  tmpDir: string,
): Promise<{ values: string[]; result: DetectorResult }> {
  const detector = findDetector("testing");
  const index = await FileIndex.build(tmpDir);
  const result = await detector.detect(tmpDir, index);
  return { values: result.findings.map((f) => f.value), result };
}

describe("testing detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-testing-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // --- Existing frameworks (sanity checks) ---

  it("detects Vitest from config file", async () => {
    await writeFile(path.join(tmpDir, "vitest.config.ts"), "");
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Vitest");
  });

  it("detects Jest from npm devDependencies", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ devDependencies: { jest: "^29.0.0" } }),
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Jest");
  });

  it("detects Go testing from *_test.go files", async () => {
    await writeFile(path.join(tmpDir, "main_test.go"), "");
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Go testing");
  });

  // --- Bun Test ---

  it("detects Bun Test from bunfig.toml with [test] section", async () => {
    await writeFile(
      path.join(tmpDir, "bunfig.toml"),
      '[test]\npreload = ["./setup.ts"]',
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Bun Test");
  });

  it("detects Bun Test from bun:test import in test file", async () => {
    await writeFile(
      path.join(tmpDir, "app.test.ts"),
      'import { test, expect } from "bun:test";',
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Bun Test");
  });

  // --- Java / Kotlin / JVM ---

  it("detects JUnit 5 from build.gradle", async () => {
    await writeFile(
      path.join(tmpDir, "build.gradle"),
      "testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0'",
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("JUnit 5");
  });

  it("detects JUnit 4 from pom.xml", async () => {
    await writeFile(
      path.join(tmpDir, "pom.xml"),
      "<dependency><groupId>junit</groupId><artifactId>junit</artifactId></dependency>",
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("JUnit 4");
  });

  it("detects TestNG from build.gradle.kts", async () => {
    await writeFile(
      path.join(tmpDir, "build.gradle.kts"),
      'testImplementation("org.testng:testng:7.8.0")',
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("TestNG");
  });

  it("detects Kotest from build.gradle.kts", async () => {
    await writeFile(
      path.join(tmpDir, "build.gradle.kts"),
      'testImplementation("io.kotest:kotest-runner-junit5:5.7.0")',
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Kotest");
  });

  // --- Scala ---

  it("detects ScalaTest from build.sbt", async () => {
    await writeFile(
      path.join(tmpDir, "build.sbt"),
      'libraryDependencies += "org.scalatest" %% "scalatest" % "3.2.17" % Test',
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("ScalaTest");
  });

  it("detects specs2 from build.sbt", async () => {
    await writeFile(
      path.join(tmpDir, "build.sbt"),
      'libraryDependencies += "org.specs2" %% "specs2-core" % "4.20.0" % Test',
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("specs2");
  });

  // --- C/C++ ---

  it("detects Google Test from CMakeLists.txt", async () => {
    await writeFile(
      path.join(tmpDir, "CMakeLists.txt"),
      "find_package(GTest REQUIRED)",
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Google Test");
  });

  it("detects Catch2 from vcpkg.json", async () => {
    await writeFile(
      path.join(tmpDir, "vcpkg.json"),
      JSON.stringify({ dependencies: ["catch2"] }),
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Catch2");
  });

  it("detects Google Test from conanfile.txt", async () => {
    await writeFile(
      path.join(tmpDir, "conanfile.txt"),
      "[requires]\ngtest/1.14.0",
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Google Test");
  });

  // --- Ruby ---

  it("detects Cucumber from Gemfile", async () => {
    await writeFile(
      path.join(tmpDir, "Gemfile"),
      "gem 'cucumber'\ngem 'rspec'",
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Cucumber");
  });

  it("detects Minitest from Gemfile", async () => {
    await writeFile(path.join(tmpDir, "Gemfile"), 'gem "minitest"');
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Minitest");
  });

  it("detects Cucumber from .feature files", async () => {
    await mkdir(path.join(tmpDir, "features"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "features", "login.feature"),
      "Feature: Login",
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Cucumber");
  });

  // --- Rust ---

  it("detects Cargo Test from #[test] attribute", async () => {
    await writeFile(
      path.join(tmpDir, "lib.rs"),
      "#[cfg(test)]\nmod tests {\n  #[test]\n  fn it_works() {}\n}",
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Cargo Test");
  });

  // --- Swift ---

  it("detects XCTest from Package.swift with .testTarget", async () => {
    await writeFile(
      path.join(tmpDir, "Package.swift"),
      '.testTarget(name: "MyTests", dependencies: ["MyLib"])',
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("XCTest");
  });

  it("detects XCTest from *Tests.swift files", async () => {
    await writeFile(path.join(tmpDir, "MyAppTests.swift"), "import XCTest");
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("XCTest");
  });

  // --- Elixir ---

  it("detects ExUnit from *_test.exs files", async () => {
    await mkdir(path.join(tmpDir, "lib"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "lib", "my_app_test.exs"),
      "defmodule MyAppTest do",
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("ExUnit");
  });

  // --- npm extras ---

  it("detects Ava from npm devDependencies", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ devDependencies: { ava: "^6.0.0" } }),
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Ava");
  });

  it("detects Tap from npm devDependencies", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ devDependencies: { tap: "^18.0.0" } }),
    );
    const { values } = await runTestingDetector(tmpDir);
    expect(values).toContain("Tap");
  });

  // --- hasTests signal ---

  it("sets hasTests signal for Java test files", async () => {
    await writeFile(path.join(tmpDir, "FooTest.java"), "");
    const { result } = await runTestingDetector(tmpDir);
    expect(result.signals?.hasTests).toBe(true);
  });

  it("sets hasTests signal for Ruby spec files", async () => {
    await writeFile(path.join(tmpDir, "foo_spec.rb"), "");
    const { result } = await runTestingDetector(tmpDir);
    expect(result.signals?.hasTests).toBe(true);
  });

  it("sets hasTests signal for .feature files", async () => {
    await writeFile(path.join(tmpDir, "login.feature"), "");
    const { result } = await runTestingDetector(tmpDir);
    expect(result.signals?.hasTests).toBe(true);
  });

  it("sets hasTests signal for Elixir test files", async () => {
    await writeFile(path.join(tmpDir, "app_test.exs"), "");
    const { result } = await runTestingDetector(tmpDir);
    expect(result.signals?.hasTests).toBe(true);
  });

  // --- Dedup ---

  it("deduplicates findings when detected via multiple sources", async () => {
    await writeFile(
      path.join(tmpDir, "build.gradle"),
      "testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0'",
    );
    await writeFile(
      path.join(tmpDir, "pom.xml"),
      "<artifactId>junit-jupiter-api</artifactId>",
    );
    const { values } = await runTestingDetector(tmpDir);
    const junit5Count = values.filter((v) => v === "JUnit 5").length;
    expect(junit5Count).toBe(1);
  });
});
