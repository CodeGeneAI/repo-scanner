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
  const dir = await mkdtemp(path.join(tmpdir(), "rs-container-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  const det = getDetectors().find((d) => d.id === "containerization")!;
  const index = await FileIndex.build(dir);
  const result = await det.detect(dir, index);
  return result.findings.map((f) => f.value);
};

describe("containerization detector: file rules", () => {
  test.each([
    ["Dockerfile", "Docker"],
    ["Containerfile", "Podman"],
    ["docker-compose.yml", "Docker Compose"],
    ["docker-compose.yaml", "Docker Compose"],
    ["compose.yml", "Docker Compose"],
    ["compose.yaml", "Docker Compose"],
  ])("detects %s as %s", async (file, expected) => {
    const names = await detect({ [file]: "# container config\n" });
    expect(names).toContain(expected);
  });
});

describe("containerization detector: directory rules", () => {
  test("detects Dev Container from any file in .devcontainer/", async () => {
    const names = await detect({
      ".devcontainer/devcontainer.json": '{"name": "Dev Container"}\n',
    });
    expect(names).toContain("Dev Container");
  });

  test("detects Dev Container from nested file in .devcontainer/", async () => {
    const names = await detect({
      ".devcontainer/base/devcontainer.json": '{"name": "base"}\n',
    });
    expect(names).toContain("Dev Container");
  });
});

describe("containerization detector: dedup", () => {
  test("Dockerfile and Containerfile in same repo are both retained as separate values", async () => {
    const names = await detect({
      Dockerfile: "FROM alpine\n",
      Containerfile: "FROM fedora\n",
    });
    expect(names).toContain("Docker");
    expect(names).toContain("Podman");
  });

  test("multiple docker-compose variants collapse to one Docker Compose entry per file", async () => {
    const names = await detect({
      "docker-compose.yml": "version: '3'\n",
      "compose.yaml": "version: '3'\n",
    });
    // Two findings (one per file), both with value "Docker Compose"
    const dcFindings = names.filter((n) => n === "Docker Compose");
    expect(dcFindings.length).toBe(2);
  });

  test("same file matched only once", async () => {
    const names = await detect({ Dockerfile: "FROM alpine\n" });
    expect(names.filter((n) => n === "Docker")).toHaveLength(1);
  });
});

describe("containerization detector: edge cases", () => {
  test("no findings when repo has no container configs", async () => {
    const names = await detect({ "README.md": "# project\n" });
    expect(names).toEqual([]);
  });

  test("multiple containerization tools detected in same repo", async () => {
    const names = await detect({
      Dockerfile: "FROM alpine\n",
      "docker-compose.yml": "version: '3'\n",
      ".devcontainer/devcontainer.json": '{"name": "dev"}\n',
    });
    expect(names).toContain("Docker");
    expect(names).toContain("Docker Compose");
    expect(names).toContain("Dev Container");
  });
});
