import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { CrossPackageDependencyGraph } from "../types";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";

const tmpDir = () => mkdtemp(path.join(os.tmpdir(), "cross-pkg-test-"));

const writeAt = async (root: string, relPath: string, content: string) => {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
};

const runCrossPackageDeps = async (root: string) => {
  const idx = await FileIndex.build(root);
  const detector = getDetectors().find((d) => d.id === "cross-package-deps")!;
  return detector.detect(root, idx);
};

describe("cross-package-deps detector", () => {
  it("is registered", () => {
    const detector = getDetectors().find((d) => d.id === "cross-package-deps");
    expect(detector).toBeDefined();
  });

  it("returns empty for non-monorepo", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "package.json",
        JSON.stringify({ name: "single-app" }),
      );
      await writeAt(root, "src/index.ts", "export const x = 1;\n");
      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;
      expect(graph.edges.length).toBe(0);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects npm cross-deps between packages", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "package.json",
        JSON.stringify({ workspaces: ["packages/*"] }),
      );
      await writeAt(
        root,
        "packages/foo/package.json",
        JSON.stringify({
          name: "@scope/foo",
          dependencies: { "@scope/bar": "workspace:*" },
        }),
      );
      await writeAt(
        root,
        "packages/bar/package.json",
        JSON.stringify({ name: "@scope/bar" }),
      );
      await writeAt(root, "packages/foo/index.ts", "");
      await writeAt(root, "packages/bar/index.ts", "");

      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;

      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0]!.from).toBe("packages/foo");
      expect(graph.edges[0]!.to).toBe("packages/bar");
      expect(graph.edges[0]!.fromName).toBe("@scope/foo");
      expect(graph.edges[0]!.toName).toBe("@scope/bar");
      expect(graph.edges[0]!.ecosystem).toBe("npm");
      expect(graph.edges[0]!.isDev).toBe(false);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects devDependency edges", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "package.json",
        JSON.stringify({ workspaces: ["packages/*"] }),
      );
      await writeAt(
        root,
        "packages/foo/package.json",
        JSON.stringify({
          name: "foo",
          devDependencies: { bar: "workspace:*" },
        }),
      );
      await writeAt(
        root,
        "packages/bar/package.json",
        JSON.stringify({ name: "bar" }),
      );
      await writeAt(root, "packages/foo/index.ts", "");
      await writeAt(root, "packages/bar/index.ts", "");

      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;

      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0]!.isDev).toBe(true);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("identifies orphan components", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "package.json",
        JSON.stringify({ workspaces: ["packages/*"] }),
      );
      await writeAt(
        root,
        "packages/foo/package.json",
        JSON.stringify({ name: "foo", dependencies: { bar: "workspace:*" } }),
      );
      await writeAt(
        root,
        "packages/bar/package.json",
        JSON.stringify({ name: "bar" }),
      );
      await writeAt(
        root,
        "packages/orphan/package.json",
        JSON.stringify({ name: "orphan" }),
      );
      await writeAt(root, "packages/foo/index.ts", "");
      await writeAt(root, "packages/bar/index.ts", "");
      await writeAt(root, "packages/orphan/index.ts", "");

      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;

      expect(graph.orphans).toContain("packages/orphan");
      expect(graph.orphans).not.toContain("packages/foo");
      expect(graph.orphans).not.toContain("packages/bar");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("handles circular deps gracefully", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "package.json",
        JSON.stringify({ workspaces: ["packages/*"] }),
      );
      await writeAt(
        root,
        "packages/a/package.json",
        JSON.stringify({ name: "a", dependencies: { b: "workspace:*" } }),
      );
      await writeAt(
        root,
        "packages/b/package.json",
        JSON.stringify({ name: "b", dependencies: { a: "workspace:*" } }),
      );
      await writeAt(root, "packages/a/index.ts", "");
      await writeAt(root, "packages/b/index.ts", "");

      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;

      expect(graph.edges.length).toBe(2);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("ignores external deps", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "package.json",
        JSON.stringify({ workspaces: ["packages/*"] }),
      );
      await writeAt(
        root,
        "packages/foo/package.json",
        JSON.stringify({
          name: "foo",
          dependencies: { lodash: "^4.0.0", bar: "workspace:*" },
        }),
      );
      await writeAt(
        root,
        "packages/bar/package.json",
        JSON.stringify({ name: "bar" }),
      );
      await writeAt(root, "packages/foo/index.ts", "");
      await writeAt(root, "packages/bar/index.ts", "");

      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;

      // Only bar edge, not lodash
      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0]!.toName).toBe("bar");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("nodes includes all components", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "package.json",
        JSON.stringify({ workspaces: ["packages/*"] }),
      );
      await writeAt(
        root,
        "packages/a/package.json",
        JSON.stringify({ name: "a" }),
      );
      await writeAt(
        root,
        "packages/b/package.json",
        JSON.stringify({ name: "b" }),
      );
      await writeAt(root, "packages/a/index.ts", "");
      await writeAt(root, "packages/b/index.ts", "");

      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;

      expect([...graph.nodes].sort()).toEqual(["packages/a", "packages/b"]);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects Go workspace cross-deps", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "go.work",
        "go 1.21\n\nuse (\n\t./packages/a\n\t./packages/b\n)\n",
      );
      await writeAt(
        root,
        "packages/a/go.mod",
        "module example.com/repo/packages/a\n\ngo 1.21\n\nrequire example.com/repo/packages/b v0.0.0\n",
      );
      await writeAt(
        root,
        "packages/b/go.mod",
        "module example.com/repo/packages/b\n\ngo 1.21\n",
      );
      await writeAt(root, "packages/a/main.go", "package main\n");
      await writeAt(root, "packages/b/lib.go", "package b\n");

      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;

      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0]!.from).toBe("packages/a");
      expect(graph.edges[0]!.to).toBe("packages/b");
      expect(graph.edges[0]!.ecosystem).toBe("go");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects Cargo workspace cross-deps", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "Cargo.toml",
        '[workspace]\nmembers = ["crates/*"]\n',
      );
      await writeAt(
        root,
        "crates/foo/Cargo.toml",
        '[package]\nname = "foo"\n\n[dependencies]\nbar = { path = "../bar" }\n',
      );
      await writeAt(root, "crates/bar/Cargo.toml", '[package]\nname = "bar"\n');
      await writeAt(root, "crates/foo/src/lib.rs", "");
      await writeAt(root, "crates/bar/src/lib.rs", "");

      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;

      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0]!.from).toBe("crates/foo");
      expect(graph.edges[0]!.to).toBe("crates/bar");
      expect(graph.edges[0]!.ecosystem).toBe("cargo");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("works with deeply nested components", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "package.json",
        JSON.stringify({ workspaces: ["packages/**"] }),
      );
      await writeAt(
        root,
        "packages/ai/sdk/package.json",
        JSON.stringify({
          name: "@repo/ai-sdk",
          dependencies: { "@repo/utils": "workspace:*" },
        }),
      );
      await writeAt(
        root,
        "packages/shared/utils/package.json",
        JSON.stringify({ name: "@repo/utils" }),
      );
      await writeAt(root, "packages/ai/sdk/index.ts", "");
      await writeAt(root, "packages/shared/utils/index.ts", "");

      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;

      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0]!.fromName).toBe("@repo/ai-sdk");
      expect(graph.edges[0]!.toName).toBe("@repo/utils");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects .NET ProjectReference cross-deps", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "src/App/App.csproj",
        '<Project Sdk="Microsoft.NET.Sdk">\n  <ItemGroup>\n    <ProjectReference Include="../Lib/Lib.csproj" />\n  </ItemGroup>\n</Project>\n',
      );
      await writeAt(
        root,
        "src/Lib/Lib.csproj",
        '<Project Sdk="Microsoft.NET.Sdk">\n</Project>\n',
      );
      await writeAt(root, "src/App/Program.cs", "class Program { }\n");
      await writeAt(root, "src/Lib/Helper.cs", "public class Helper { }\n");

      const result = await runCrossPackageDeps(root);
      const graph = result.metadata!
        .crossPackageDeps as CrossPackageDependencyGraph;

      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0]!.fromName).toBe("App");
      expect(graph.edges[0]!.toName).toBe("Lib");
      expect(graph.edges[0]!.ecosystem).toBe("nuget");
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
