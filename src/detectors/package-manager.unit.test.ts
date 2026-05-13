import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";

const detect = async (
  files: Record<string, string>,
): Promise<readonly string[]> => {
  const dir = await mkdtemp(path.join(tmpdir(), "rs-pm-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  const det = getDetectors().find((d) => d.id === "packageManager")!;
  const index = await FileIndex.build(dir);
  const result = await det.detect(dir, index);
  return result.findings.map((f) => f.value);
};

describe("packageManager detector: lockfile rules", () => {
  test.each([
    ["package-lock.json", "{}", "npm"],
    ["npm-shrinkwrap.json", "{}", "npm"],
    ["pnpm-lock.yaml", "lockfileVersion: '9'\n", "pnpm"],
    ["yarn.lock", "# yarn\n", "Yarn"],
    ["bun.lock", "{}", "Bun"],
    ["bun.lockb", "binary", "Bun"],
    ["Pipfile.lock", "{}", "Pipenv"],
    ["poetry.lock", "[metadata]\n", "Poetry"],
    ["uv.lock", "version = 1\n", "uv"],
    ["Cargo.lock", "[package]\n", "Cargo"],
    ["go.sum", "example.com v1\n", "Go modules"],
    ["Gemfile.lock", "GEM\n", "Bundler"],
    ["composer.lock", "{}", "Composer"],
    ["packages.lock.json", "{}", "NuGet"],
    ["pubspec.lock", "packages:\n", "pub"],
    ["gradle.lockfile", "# lock\n", "Gradle"],
    ["mix.lock", "%{}\n", "Mix"],
    ["stack.yaml.lock", "snapshots: []\n", "Stack"],
    ["cabal.project.freeze", "constraints: foo\n", "Cabal"],
    ["Package.resolved", "{}", "Swift Package Manager"],
  ])("detects %s as %s", async (file, content, expectedName) => {
    const names = await detect({ [file]: content });
    expect(names).toContain(expectedName);
  });

  test("no findings when there are no lockfiles", async () => {
    const names = await detect({ "README.md": "# hello" });
    expect(names).toEqual([]);
  });

  test("multiple lockfiles report multiple PMs (no dedup conflation)", async () => {
    const names = await detect({
      "pnpm-lock.yaml": "lockfileVersion: '9'\n",
      "Cargo.lock": "[package]\n",
    });
    expect([...names].sort()).toEqual(["Cargo", "pnpm"]);
  });

  test("dedups when the same PM appears twice (e.g. monorepo subdirs)", async () => {
    const names = await detect({
      "pnpm-lock.yaml": "lockfileVersion: '9'\n",
      "apps/web/pnpm-lock.yaml": "lockfileVersion: '9'\n",
    });
    expect(names.filter((n) => n === "pnpm")).toHaveLength(1);
  });
});

describe("packageManager detector: manifest fallback", () => {
  test("pyproject.toml with [tool.poetry] → Poetry", async () => {
    const names = await detect({
      "pyproject.toml": '[tool.poetry]\nname = "x"\n',
    });
    expect(names).toContain("Poetry");
  });

  test("pyproject.toml with [tool.uv] → uv", async () => {
    const names = await detect({
      "pyproject.toml": "[tool.uv]\n",
    });
    expect(names).toContain("uv");
  });

  test("pyproject.toml with [tool.uv.workspace] → uv", async () => {
    const names = await detect({
      "pyproject.toml": "[tool.uv.workspace]\nmembers = []\n",
    });
    expect(names).toContain("uv");
  });

  test("pyproject.toml with [tool.pipenv] → Pipenv", async () => {
    const names = await detect({
      "pyproject.toml": "[tool.pipenv]\n",
    });
    expect(names).toContain("Pipenv");
  });

  test("bare pyproject.toml (PEP 621 only) → no Python PM", async () => {
    const names = await detect({
      "pyproject.toml":
        '[project]\nname = "x"\nversion = "0.1.0"\nrequires-python = ">=3.10"\n',
    });
    // None of Poetry/uv/Pipenv should fire on bare metadata.
    expect(names).not.toContain("Poetry");
    expect(names).not.toContain("uv");
    expect(names).not.toContain("Pipenv");
  });

  test("Pipfile alone → Pipenv", async () => {
    const names = await detect({ Pipfile: "[packages]\n" });
    expect(names).toContain("Pipenv");
  });

  test("requirements.txt + no other Python signal → pip", async () => {
    const names = await detect({ "requirements.txt": "requests==2.0\n" });
    expect(names).toContain("pip");
  });

  test("requirements.txt suppressed when Poetry/uv signal exists", async () => {
    const names = await detect({
      "requirements.txt": "requests==2.0\n",
      "pyproject.toml": "[tool.poetry]\n",
    });
    expect(names).toContain("Poetry");
    expect(names).not.toContain("pip");
  });

  test("requirements.txt suppressed when uv.lock exists (lockfile path)", async () => {
    const names = await detect({
      "requirements.txt": "requests==2.0\n",
      "uv.lock": "version = 1\n",
    });
    expect(names).toContain("uv");
    expect(names).not.toContain("pip");
  });

  test("Cargo.toml alone → Cargo", async () => {
    const names = await detect({ "Cargo.toml": '[package]\nname = "x"\n' });
    expect(names).toContain("Cargo");
  });

  test("go.mod alone (no go.sum) → Go modules", async () => {
    const names = await detect({ "go.mod": "module x\n" });
    expect(names).toContain("Go modules");
  });

  test("pubspec.yaml without pubspec.lock → pub", async () => {
    const names = await detect({ "pubspec.yaml": "name: x\n" });
    expect(names).toContain("pub");
  });

  test("Gemfile without Gemfile.lock → Bundler", async () => {
    const names = await detect({ Gemfile: "source 'https://rubygems.org'\n" });
    expect(names).toContain("Bundler");
  });

  test("composer.json without composer.lock → Composer", async () => {
    const names = await detect({ "composer.json": "{}" });
    expect(names).toContain("Composer");
  });

  test("pom.xml → Maven", async () => {
    const names = await detect({ "pom.xml": "<project></project>\n" });
    expect(names).toContain("Maven");
  });

  test("build.gradle without gradle.lockfile → Gradle", async () => {
    const names = await detect({ "build.gradle": "plugins {}\n" });
    expect(names).toContain("Gradle");
  });

  test("build.gradle.kts → Gradle", async () => {
    const names = await detect({ "build.gradle.kts": "plugins {}\n" });
    expect(names).toContain("Gradle");
  });

  test("build.sbt → sbt", async () => {
    const names = await detect({ "build.sbt": 'name := "x"\n' });
    expect(names).toContain("sbt");
  });

  test("mix.exs without mix.lock → Mix", async () => {
    const names = await detect({
      "mix.exs": "defmodule X.MixProject do\nend\n",
    });
    expect(names).toContain("Mix");
  });

  test("stack.yaml without stack.yaml.lock → Stack", async () => {
    const names = await detect({ "stack.yaml": "resolver: lts-22.0\n" });
    expect(names).toContain("Stack");
  });

  test("cabal.project → Cabal", async () => {
    const names = await detect({ "cabal.project": "packages: .\n" });
    expect(names).toContain("Cabal");
  });

  test("foo.cabal → Cabal", async () => {
    const names = await detect({ "foo.cabal": "name: foo\nversion: 0.1\n" });
    expect(names).toContain("Cabal");
  });

  test("Package.swift without Package.resolved → Swift Package Manager", async () => {
    const names = await detect({
      "Package.swift": "// swift-tools-version:5.9\n",
    });
    expect(names).toContain("Swift Package Manager");
  });

  test("*.csproj without packages.lock.json → NuGet", async () => {
    const names = await detect({ "app.csproj": "<Project></Project>\n" });
    expect(names).toContain("NuGet");
  });

  test("packages.config → NuGet", async () => {
    const names = await detect({
      "packages.config": "<packages></packages>\n",
    });
    expect(names).toContain("NuGet");
  });

  test("manifest suppressed when its lockfile is present (no duplicate)", async () => {
    const names = await detect({
      "Cargo.toml": "[package]\n",
      "Cargo.lock": "[package]\n",
    });
    expect(names.filter((n) => n === "Cargo")).toHaveLength(1);
  });
});
