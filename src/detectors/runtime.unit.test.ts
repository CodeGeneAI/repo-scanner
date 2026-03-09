import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";

const tmpDir = () => mkdtemp(path.join(os.tmpdir(), "runtime-test-"));

const writeAt = async (root: string, relPath: string, content: string) => {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
};

const runRuntime = async (root: string) => {
  const idx = await FileIndex.build(root);
  const detector = getDetectors().find((d) => d.id === "runtime")!;
  return detector.detect(root, idx);
};

describe("runtime detector", () => {
  it("is registered", () => {
    const detector = getDetectors().find((d) => d.id === "runtime");
    expect(detector).toBeDefined();
  });

  it("detects .nvmrc", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, ".nvmrc", "v20.11.0\n");
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Node.js 20.11.0");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects .node-version", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, ".node-version", "18.17.0\n");
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Node.js 18.17.0");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects package.json engines.node", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "package.json",
        JSON.stringify({ engines: { node: ">=18.0.0" } }),
      );
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Node.js >=18.0.0");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects go.mod version", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "go.mod", "module example.com/app\n\ngo 1.21\n");
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Go 1.21");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects .python-version", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, ".python-version", "3.12.1\n");
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Python 3.12.1");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects pyproject.toml requires-python", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "pyproject.toml",
        '[project]\nrequires-python = ">=3.10"\n',
      );
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Python >=3.10");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects .ruby-version", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, ".ruby-version", "3.2.2\n");
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Ruby 3.2.2");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects Gemfile ruby version", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "Gemfile",
        'source "https://rubygems.org"\nruby "3.2.0"\n',
      );
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Ruby 3.2.0");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects rust-toolchain.toml", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "rust-toolchain.toml",
        '[toolchain]\nchannel = "1.75.0"\n',
      );
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Rust 1.75.0");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects Cargo.toml rust-version", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "Cargo.toml",
        '[package]\nname = "app"\nrust-version = "1.70"\n',
      );
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Rust 1.70");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects composer.json require.php", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "composer.json",
        JSON.stringify({ require: { php: ">=8.1" } }),
      );
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("PHP >=8.1");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects global.json sdk.version", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "global.json",
        JSON.stringify({ sdk: { version: "8.0.100" } }),
      );
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe(".NET 8.0.100");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects .csproj TargetFramework", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "App.csproj",
        "<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>",
      );
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe(".NET net8.0");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects .tool-versions", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, ".tool-versions", "nodejs 20.11.0\npython 3.12.1\n");
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(2);
      const values = result.findings.map((f) => f.value).sort();
      expect(values).toEqual(["Node.js 20.11.0", "Python 3.12.1"]);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("returns empty for no version files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "README.md", "# Hello\n");
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(0);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects pom.xml maven.compiler.source", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "pom.xml",
        "<project><properties><maven.compiler.source>17</maven.compiler.source></properties></project>",
      );
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Java 17");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects build.gradle sourceCompatibility", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "build.gradle",
        "plugins { id 'java' }\nsourceCompatibility = '17'\n",
      );
      const result = await runRuntime(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]!.value).toBe("Java 17");
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
