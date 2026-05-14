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
  const dir = await mkdtemp(path.join(tmpdir(), "rs-ci-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  const det = getDetectors().find((d) => d.id === "ciProvider")!;
  const index = await FileIndex.build(dir);
  const result = await det.detect(dir, index);
  return result.findings.map((f) => f.value);
};

describe("ciProvider detector: file rules", () => {
  test.each([
    [".gitlab-ci.yml", "GitLab CI"],
    [".travis.yml", "Travis CI"],
    ["Jenkinsfile", "Jenkins"],
    ["azure-pipelines.yml", "Azure Pipelines"],
    ["bitbucket-pipelines.yml", "Bitbucket Pipelines"],
    ["appveyor.yml", "AppVeyor"],
    [".appveyor.yml", "AppVeyor"],
    [".drone.yml", "Drone CI"],
    ["cloudbuild.yaml", "Google Cloud Build"],
    ["cloudbuild.yml", "Google Cloud Build"],
    ["codemagic.yaml", "Codemagic"],
    ["bitrise.yml", "Bitrise"],
  ])("detects %s as %s", async (file, expected) => {
    const names = await detect({ [file]: "stages: []\n" });
    expect(names).toContain(expected);
  });
});

describe("ciProvider detector: directory rules", () => {
  test("detects GitHub Actions from any file in .github/workflows/", async () => {
    const names = await detect({
      ".github/workflows/ci.yml": "name: ci\non: push\njobs: {}\n",
    });
    expect(names).toContain("GitHub Actions");
  });

  test("detects Buildkite from any file in .buildkite/", async () => {
    const names = await detect({ ".buildkite/pipeline.yml": "steps: []\n" });
    expect(names).toContain("Buildkite");
  });

  test("detects TeamCity from any file in .teamcity/", async () => {
    const names = await detect({ ".teamcity/settings.kts": "// kts\n" });
    expect(names).toContain("TeamCity");
  });

  test("detects Semaphore from any file in .semaphore/", async () => {
    const names = await detect({
      ".semaphore/semaphore.yml": "version: v1.0\n",
    });
    expect(names).toContain("Semaphore");
  });

  test("detects CircleCI from any file in .circleci/", async () => {
    const names = await detect({ ".circleci/config.yml": "version: 2.1\n" });
    expect(names).toContain("CircleCI");
  });
});

describe("ciProvider detector: edge cases", () => {
  test("no findings when repo has no CI configs", async () => {
    const names = await detect({ "README.md": "# project\n" });
    expect(names).toEqual([]);
  });

  test("multiple CI configs produce multiple findings", async () => {
    const names = await detect({
      ".github/workflows/ci.yml": "name: ci\n",
      ".travis.yml": "language: node_js\n",
    });
    expect([...names].sort()).toEqual(["GitHub Actions", "Travis CI"]);
  });

  test("Azure detected from azure-pipelines.yml at repo root", async () => {
    const names = await detect({ "azure-pipelines.yml": "stages: []\n" });
    expect(names).toContain("Azure Pipelines");
  });

  test("does not classify a bare .azure/ config dir as Azure Pipelines", async () => {
    const names = await detect({
      ".azure/config": "[defaults]\n",
    });
    expect(names).not.toContain("Azure Pipelines");
  });

  test("still detects Azure Pipelines via azure-pipelines.yml at root", async () => {
    const names = await detect({
      "azure-pipelines.yml": "stages: []\n",
    });
    expect(names).toContain("Azure Pipelines");
  });
});
