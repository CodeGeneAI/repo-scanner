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
