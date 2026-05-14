import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { RuntimeInfo } from "../types";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";
import type { Finding } from "./types";

const parse = (f: Finding): RuntimeInfo => JSON.parse(f.value) as RuntimeInfo;

const detect = async (files: Record<string, string>): Promise<Finding[]> => {
  const dir = await mkdtemp(path.join(tmpdir(), "rs-runtime-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  const det = getDetectors().find((d) => d.id === "runtime")!;
  const index = await FileIndex.build(dir);
  const result = await det.detect(dir, index);
  return result.findings;
};

const detectRuntimes = async (
  files: Record<string, string>,
): Promise<RuntimeInfo[]> => {
  const findings = await detect(files);
  return findings.map(parse);
};

describe("runtime detector: single-version files", () => {
  test(".nvmrc emits Node runtime", async () => {
    const runtimes = await detectRuntimes({ ".nvmrc": "20.11.0\n" });
    expect(runtimes).toContainEqual({
      language: "Node",
      version: "20.11.0",
      source: ".nvmrc",
    });
  });

  test(".node-version emits Node runtime", async () => {
    const runtimes = await detectRuntimes({ ".node-version": "18.19.0\n" });
    expect(runtimes).toContainEqual({
      language: "Node",
      version: "18.19.0",
      source: ".node-version",
    });
  });

  test(".python-version emits Python runtime", async () => {
    const runtimes = await detectRuntimes({ ".python-version": "3.11.4\n" });
    expect(runtimes).toContainEqual({
      language: "Python",
      version: "3.11.4",
      source: ".python-version",
    });
  });

  test(".ruby-version emits Ruby runtime", async () => {
    const runtimes = await detectRuntimes({ ".ruby-version": "3.2.2\n" });
    expect(runtimes).toContainEqual({
      language: "Ruby",
      version: "3.2.2",
      source: ".ruby-version",
    });
  });

  test(".terraform-version emits Terraform runtime", async () => {
    const runtimes = await detectRuntimes({
      ".terraform-version": "1.5.7\n",
    });
    expect(runtimes).toContainEqual({
      language: "Terraform",
      version: "1.5.7",
      source: ".terraform-version",
    });
  });

  test(".crystal-version emits Crystal runtime", async () => {
    const runtimes = await detectRuntimes({ ".crystal-version": "1.11.2\n" });
    expect(runtimes).toContainEqual({
      language: "Crystal",
      version: "1.11.2",
      source: ".crystal-version",
    });
  });

  test("strips whitespace and newlines from version", async () => {
    const runtimes = await detectRuntimes({ ".nvmrc": "  20.11.0  \n" });
    expect(runtimes[0]?.version).toBe("20.11.0");
  });

  test("ignores empty .nvmrc", async () => {
    const runtimes = await detectRuntimes({ ".nvmrc": "\n" });
    expect(runtimes).toHaveLength(0);
  });
});

describe("runtime detector: go.mod", () => {
  test("detects Go version from go directive", async () => {
    const runtimes = await detectRuntimes({
      "go.mod": "module example.com/foo\n\ngo 1.21\n",
    });
    expect(runtimes).toContainEqual({
      language: "Go",
      version: "1.21",
      source: "go.mod",
    });
  });

  test("ignores go.mod without go directive", async () => {
    const runtimes = await detectRuntimes({
      "go.mod": "module example.com/foo\n",
    });
    const goRuntimes = runtimes.filter((r) => r.language === "Go");
    expect(goRuntimes).toHaveLength(0);
  });
});

describe("runtime detector: Gemfile", () => {
  test("detects Ruby version from ruby directive", async () => {
    const runtimes = await detectRuntimes({
      Gemfile: "source 'https://rubygems.org'\nruby '3.2.2'\ngem 'rails'\n",
    });
    expect(runtimes).toContainEqual({
      language: "Ruby",
      version: "3.2.2",
      source: "Gemfile#ruby",
    });
  });

  test("ignores Gemfile without ruby directive", async () => {
    const runtimes = await detectRuntimes({
      Gemfile: "source 'https://rubygems.org'\ngem 'rails'\n",
    });
    const gemfileRubys = runtimes.filter((r) => r.source === "Gemfile#ruby");
    expect(gemfileRubys).toHaveLength(0);
  });

  test("uses double quotes in Gemfile ruby directive", async () => {
    const runtimes = await detectRuntimes({
      Gemfile: 'source "https://rubygems.org"\nruby "3.3.0"\n',
    });
    expect(runtimes).toContainEqual({
      language: "Ruby",
      version: "3.3.0",
      source: "Gemfile#ruby",
    });
  });
});

describe("runtime detector: dedup", () => {
  test("same file emitting same lang+version only produces one finding", async () => {
    const findings = await detect({ ".nvmrc": "20.11.0\n" });
    const nodeFindings = findings.filter((f) => {
      const info = parse(f);
      return info.language === "Node" && info.version === "20.11.0";
    });
    expect(nodeFindings).toHaveLength(1);
  });

  test("no findings when repo has no runtime configs", async () => {
    const runtimes = await detectRuntimes({ "README.md": "# hello\n" });
    expect(runtimes).toHaveLength(0);
  });
});
