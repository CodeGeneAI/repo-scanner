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

const detect = async (
  files: Record<string, string>,
): Promise<readonly Finding[]> => {
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

describe("runtime detector: package.json engines", () => {
  test("detects node version from package.json engines.node", async () => {
    const runtimes = await detectRuntimes({
      "package.json": JSON.stringify({ engines: { node: ">=20.0.0" } }),
    });
    expect(runtimes).toContainEqual({
      language: "Node",
      version: ">=20.0.0",
      source: "package.json#engines.node",
    });
  });

  test("detects npm version from package.json engines.npm", async () => {
    const runtimes = await detectRuntimes({
      "package.json": JSON.stringify({ engines: { npm: ">=10.0.0" } }),
    });
    expect(runtimes).toContainEqual({
      language: "npm",
      version: ">=10.0.0",
      source: "package.json#engines.npm",
    });
  });

  test("detects pnpm version from package.json engines.pnpm", async () => {
    const runtimes = await detectRuntimes({
      "package.json": JSON.stringify({ engines: { pnpm: ">=8.0.0" } }),
    });
    expect(runtimes).toContainEqual({
      language: "pnpm",
      version: ">=8.0.0",
      source: "package.json#engines.pnpm",
    });
  });

  test("detects bun version from package.json engines.bun", async () => {
    const runtimes = await detectRuntimes({
      "package.json": JSON.stringify({ engines: { bun: ">=1.0.0" } }),
    });
    expect(runtimes).toContainEqual({
      language: "Bun",
      version: ">=1.0.0",
      source: "package.json#engines.bun",
    });
  });

  test("ignores package.json without engines", async () => {
    const runtimes = await detectRuntimes({
      "package.json": JSON.stringify({ name: "foo", version: "1.0.0" }),
    });
    const fromPkg = runtimes.filter((r) =>
      r.source.startsWith("package.json#engines"),
    );
    expect(fromPkg).toHaveLength(0);
  });
});

describe("runtime detector: pyproject.toml", () => {
  test("detects Python version from requires-python", async () => {
    const runtimes = await detectRuntimes({
      "pyproject.toml":
        '[project]\nname = "myapp"\nrequires-python = ">=3.11"\n',
    });
    expect(runtimes).toContainEqual({
      language: "Python",
      version: ">=3.11",
      source: "pyproject.toml#requires-python",
    });
  });

  test("ignores pyproject.toml without requires-python", async () => {
    const runtimes = await detectRuntimes({
      "pyproject.toml": '[project]\nname = "myapp"\n',
    });
    const fromPyproject = runtimes.filter(
      (r) => r.source === "pyproject.toml#requires-python",
    );
    expect(fromPyproject).toHaveLength(0);
  });
});

describe("runtime detector: Cargo.toml", () => {
  test("detects Rust version from rust-version", async () => {
    const runtimes = await detectRuntimes({
      "Cargo.toml": '[package]\nname = "myapp"\nrust-version = "1.70"\n',
    });
    expect(runtimes).toContainEqual({
      language: "Rust",
      version: "1.70",
      source: "Cargo.toml#rust-version",
    });
  });

  test("ignores Cargo.toml without rust-version", async () => {
    const runtimes = await detectRuntimes({
      "Cargo.toml": '[package]\nname = "myapp"\nversion = "0.1.0"\n',
    });
    const fromCargo = runtimes.filter(
      (r) => r.source === "Cargo.toml#rust-version",
    );
    expect(fromCargo).toHaveLength(0);
  });
});

describe("runtime detector: .tool-versions", () => {
  test("detects multiple tools from .tool-versions", async () => {
    const runtimes = await detectRuntimes({
      ".tool-versions": "nodejs 20.11.0\npython 3.11.4\nruby 3.2.2\n",
    });
    expect(runtimes).toContainEqual({
      language: "Node",
      version: "20.11.0",
      source: ".tool-versions",
    });
    expect(runtimes).toContainEqual({
      language: "Python",
      version: "3.11.4",
      source: ".tool-versions",
    });
    expect(runtimes).toContainEqual({
      language: "Ruby",
      version: "3.2.2",
      source: ".tool-versions",
    });
  });

  test("handles node alias in .tool-versions", async () => {
    const runtimes = await detectRuntimes({
      ".tool-versions": "node 18.0.0\n",
    });
    expect(runtimes).toContainEqual({
      language: "Node",
      version: "18.0.0",
      source: ".tool-versions",
    });
  });

  test("handles golang alias in .tool-versions", async () => {
    const runtimes = await detectRuntimes({
      ".tool-versions": "golang 1.21.0\n",
    });
    expect(runtimes).toContainEqual({
      language: "Go",
      version: "1.21.0",
      source: ".tool-versions",
    });
  });

  test("strips comments from .tool-versions lines", async () => {
    const runtimes = await detectRuntimes({
      ".tool-versions": "nodejs 20.0.0 # lts version\n",
    });
    const nodeRuntime = runtimes.find(
      (r) => r.language === "Node" && r.source === ".tool-versions",
    );
    expect(nodeRuntime).toBeDefined();
    // version should not include the comment
    expect(nodeRuntime?.version).not.toContain("#");
  });

  test("ignores empty lines and comment-only lines in .tool-versions", async () => {
    const runtimes = await detectRuntimes({
      ".tool-versions": "# This is a comment\n\nnodejs 20.0.0\n",
    });
    const nodeRuntimes = runtimes.filter(
      (r) => r.language === "Node" && r.source === ".tool-versions",
    );
    expect(nodeRuntimes).toHaveLength(1);
  });
});

describe("runtime detector: mise.toml", () => {
  test("detects tools from mise.toml [tools] section", async () => {
    const runtimes = await detectRuntimes({
      "mise.toml": '[tools]\nnodejs = "20.11.0"\npython = "3.11.4"\n',
    });
    expect(runtimes).toContainEqual({
      language: "Node",
      version: "20.11.0",
      source: "mise.toml#tools.nodejs",
    });
    expect(runtimes).toContainEqual({
      language: "Python",
      version: "3.11.4",
      source: "mise.toml#tools.python",
    });
  });

  test("detects tools from .mise.toml [tools] section", async () => {
    const runtimes = await detectRuntimes({
      ".mise.toml": '[tools]\nruby = "3.2.2"\n',
    });
    expect(runtimes).toContainEqual({
      language: "Ruby",
      version: "3.2.2",
      source: ".mise.toml#tools.ruby",
    });
  });

  test("ignores mise.toml without [tools] section", async () => {
    const runtimes = await detectRuntimes({
      "mise.toml": "[settings]\nverbose = true\n",
    });
    const fromMise = runtimes.filter((r) => r.source.startsWith("mise.toml#"));
    expect(fromMise).toHaveLength(0);
  });

  test("stops reading [tools] at next section header", async () => {
    const runtimes = await detectRuntimes({
      "mise.toml": '[tools]\nnodejs = "20.0.0"\n\n[settings]\nverbose = true\n',
    });
    const fromMise = runtimes.filter((r) => r.source.startsWith("mise.toml#"));
    expect(fromMise).toHaveLength(1);
    expect(fromMise[0]?.language).toBe("Node");
  });
});

describe("runtime detector: conflicting versions", () => {
  test("different versions from different sources both surface as separate findings", async () => {
    const runtimes = await detectRuntimes({
      ".nvmrc": "20.11.0\n",
      "package.json": JSON.stringify({ engines: { node: ">=18.0.0" } }),
    });
    const nodeRuntimes = runtimes.filter((r) => r.language === "Node");
    // Both should be present since they have different versions
    expect(nodeRuntimes.length).toBeGreaterThanOrEqual(2);
    const versions = nodeRuntimes.map((r) => r.version);
    expect(versions).toContain("20.11.0");
    expect(versions).toContain(">=18.0.0");
  });
});
