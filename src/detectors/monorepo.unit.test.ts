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

describe("monorepo detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-mono-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects monorepo from package.json workspaces", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ workspaces: ["packages/*"] }),
    );
    await mkdir(path.join(tmpDir, "packages", "alpha"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "packages", "alpha", "package.json"),
      JSON.stringify({ name: "alpha" }),
    );

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("npm/yarn workspaces");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("detects Turborepo from turbo.json", async () => {
    await writeFile(path.join(tmpDir, "turbo.json"), "{}");
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "root" }),
    );

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("Turborepo");
    const turborepo = result.findings.find((f) => f.value === "Turborepo");
    expect(turborepo!.confidence).toBe(1.0);
    expect(turborepo!.evidence).toContain("found turbo.json");
  });

  it("discovers components under workspace dirs", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ workspaces: ["packages/*"] }),
    );
    await mkdir(path.join(tmpDir, "packages", "foo"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "packages", "foo", "package.json"),
      JSON.stringify({ name: "foo" }),
    );
    await mkdir(path.join(tmpDir, "packages", "bar"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "packages", "bar", "package.json"),
      JSON.stringify({ name: "bar" }),
    );

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.componentHints).toBeDefined();
    const paths = result.componentHints!.map((h) => h.path);
    expect(paths).toContain("packages/foo");
    expect(paths).toContain("packages/bar");
  });

  it("discovers components from conventional dirs without workspaces", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "root" }),
    );
    await mkdir(path.join(tmpDir, "apps", "web"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "apps", "web", "package.json"),
      JSON.stringify({ name: "web" }),
    );
    await mkdir(path.join(tmpDir, "apps", "api"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "apps", "api", "package.json"),
      JSON.stringify({ name: "api" }),
    );

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.componentHints).toBeDefined();
    const paths = result.componentHints!.map((h) => h.path);
    expect(paths).toContain("apps/web");
    expect(paths).toContain("apps/api");
  });

  it("handles workspaces as object with packages field", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ workspaces: { packages: ["packages/*"] } }),
    );
    await mkdir(path.join(tmpDir, "packages", "lib"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "packages", "lib", "package.json"),
      JSON.stringify({ name: "lib" }),
    );

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("npm/yarn workspaces");
    const paths = result.componentHints!.map((h) => h.path);
    expect(paths).toContain("packages/lib");
  });

  it("returns detectorId 'monorepo'", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "solo" }),
    );

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.detectorId).toBe("monorepo");
  });

  it("detects Pants monorepo from pants.toml", async () => {
    await writeFile(
      path.join(tmpDir, "pants.toml"),
      "[GLOBAL]\npants_version = '2.18.0'\n",
    );

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("Pants");
  });

  it("detects Bazel monorepo from MODULE.bazel", async () => {
    await writeFile(
      path.join(tmpDir, "MODULE.bazel"),
      'module(name = "myproject")\n',
    );

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("Bazel");
  });

  it("detects Gradle multi-project from settings.gradle", async () => {
    await writeFile(
      path.join(tmpDir, "settings.gradle"),
      "rootProject.name = 'my-app'\ninclude ':module-a', ':module-b'\n",
    );
    await mkdir(path.join(tmpDir, "module-a"), { recursive: true });
    await writeFile(path.join(tmpDir, "module-a", "build.gradle"), "");
    await mkdir(path.join(tmpDir, "module-b"), { recursive: true });
    await writeFile(path.join(tmpDir, "module-b", "build.gradle"), "");

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("Gradle multi-project");
    const compPaths = result.componentHints!.map((h) => h.path);
    expect(compPaths).toContain("module-a");
    expect(compPaths).toContain("module-b");
  });

  it("detects Gradle multi-project from settings.gradle.kts (Kotlin DSL)", async () => {
    await writeFile(
      path.join(tmpDir, "settings.gradle.kts"),
      'rootProject.name = "my-app"\ninclude("core")\ninclude("api")\n',
    );

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("Gradle multi-project (Kotlin DSL)");
    const compPaths = result.componentHints!.map((h) => h.path);
    expect(compPaths).toContain("core");
    expect(compPaths).toContain("api");
  });

  it("detects Maven multi-module from pom.xml", async () => {
    await writeFile(
      path.join(tmpDir, "pom.xml"),
      `<project>
        <modules>
          <module>core</module>
          <module>web</module>
        </modules>
      </project>`,
    );
    await mkdir(path.join(tmpDir, "core"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "core", "pom.xml"),
      "<project></project>",
    );
    await mkdir(path.join(tmpDir, "web"), { recursive: true });
    await writeFile(path.join(tmpDir, "web", "pom.xml"), "<project></project>");

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("Maven multi-module");
    const compPaths = result.componentHints!.map((h) => h.path);
    expect(compPaths).toContain("core");
    expect(compPaths).toContain("web");
  });

  it("detects uv workspace from pyproject.toml", async () => {
    await writeFile(
      path.join(tmpDir, "pyproject.toml"),
      `[project]
name = "my-project"

[tool.uv.workspace]
members = ["packages/*"]
`,
    );
    await mkdir(path.join(tmpDir, "packages", "lib-a"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "packages", "lib-a", "pyproject.toml"),
      '[project]\nname = "lib-a"\n',
    );

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("uv workspace");
    const compPaths = result.componentHints!.map((h) => h.path);
    expect(compPaths).toContain("packages/lib-a");
  });

  it("returns no findings for a non-monorepo", async () => {
    await writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "solo-project" }),
    );
    await writeFile(path.join(tmpDir, "index.ts"), "");

    const detector = findDetector("monorepo");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.findings).toHaveLength(0);
  });
});
