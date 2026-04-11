import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { javascriptParser } from "./javascript";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-js-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("javascriptParser", () => {
  it("has correct ecosystem", () => {
    expect(javascriptParser.ecosystem).toBe("npm");
  });

  describe("detectFiles", () => {
    it("finds package.json files", async () => {
      await writeFile(path.join(tmpDir, "package.json"), "{}");
      await mkdir(path.join(tmpDir, "packages", "a"), { recursive: true });
      await writeFile(path.join(tmpDir, "packages", "a", "package.json"), "{}");

      const files = await javascriptParser.detectFiles(tmpDir);
      expect(files).toHaveLength(2);
    });

    it("skips node_modules", async () => {
      await writeFile(path.join(tmpDir, "package.json"), "{}");
      await mkdir(path.join(tmpDir, "node_modules", "foo"), {
        recursive: true,
      });
      await writeFile(
        path.join(tmpDir, "node_modules", "foo", "package.json"),
        "{}",
      );

      const files = await javascriptParser.detectFiles(tmpDir);
      expect(files).toHaveLength(1);
    });
  });

  describe("parseDependencies", () => {
    it("parses all dependency types", async () => {
      const pkg = {
        dependencies: { express: "^4.18.0" },
        devDependencies: { "bun-types": "^1.0.0" },
        optionalDependencies: { fsevents: "^2.3.0" },
        peerDependencies: { react: "^18.0.0" },
      };
      const manifestPath = path.join(tmpDir, "package.json");
      await writeFile(manifestPath, JSON.stringify(pkg));

      const deps = await javascriptParser.parseDependencies([manifestPath]);
      expect(deps).toHaveLength(4);

      const express = deps.find((d) => d.name === "express");
      expect(express?.isDev).toBe(false);
      expect(express?.isOptional).toBe(false);
      expect(express?.currentVersion).toBe("^4.18.0");

      const bunTypes = deps.find((d) => d.name === "bun-types");
      expect(bunTypes?.isDev).toBe(true);

      const fsevents = deps.find((d) => d.name === "fsevents");
      expect(fsevents?.isOptional).toBe(true);
    });

    it("deduplicates deps from same manifest", async () => {
      const pkg = {
        dependencies: { react: "^18.0.0" },
        peerDependencies: { react: "^18.0.0" },
      };
      const manifestPath = path.join(tmpDir, "package.json");
      await writeFile(manifestPath, JSON.stringify(pkg));

      const deps = await javascriptParser.parseDependencies([manifestPath]);
      // react appears in both deps and peerDeps, but should only appear once per manifest
      const reactDeps = deps.filter((d) => d.name === "react");
      expect(reactDeps).toHaveLength(1);
    });

    it("resolves versions from package-lock.json", async () => {
      const pkg = { dependencies: { express: "^4.18.0" } };
      const lock = {
        packages: { "node_modules/express": { version: "4.18.2" } },
      };

      await writeFile(path.join(tmpDir, "package.json"), JSON.stringify(pkg));
      await writeFile(
        path.join(tmpDir, "package-lock.json"),
        JSON.stringify(lock),
      );

      const deps = await javascriptParser.parseDependencies([
        path.join(tmpDir, "package.json"),
      ]);
      const express = deps.find((d) => d.name === "express");
      expect(express?.resolvedVersion).toBe("4.18.2");
    });

    it("resolves versions from yarn.lock", async () => {
      const pkg = { dependencies: { express: "^4.18.0", lodash: "^4.17.0" } };
      const yarnLock = `# yarn lockfile v1

express@^4.18.0:
  version "4.18.3"
  resolved "https://registry.yarnpkg.com/express/-/express-4.18.3.tgz#abc"
  integrity sha512-abc

lodash@^4.17.0:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz#def"
`;

      await writeFile(path.join(tmpDir, "package.json"), JSON.stringify(pkg));
      await writeFile(path.join(tmpDir, "yarn.lock"), yarnLock);

      const deps = await javascriptParser.parseDependencies([
        path.join(tmpDir, "package.json"),
      ]);
      expect(deps.find((d) => d.name === "express")?.resolvedVersion).toBe(
        "4.18.3",
      );
      expect(deps.find((d) => d.name === "lodash")?.resolvedVersion).toBe(
        "4.17.21",
      );
    });

    it("resolves versions from pnpm-lock.yaml", async () => {
      const pkg = {
        dependencies: { express: "^4.18.0", "@babel/core": "^7.0.0" },
      };
      const pnpmLock = `lockfileVersion: '9.0'

packages:
  express@4.21.0:
    resolution: {integrity: sha512-abc}
    engines: {node: '>= 0.10.0'}

  '@babel/core@7.24.0':
    resolution: {integrity: sha512-def}
    engines: {node: '>=6.9.0'}
`;

      await writeFile(path.join(tmpDir, "package.json"), JSON.stringify(pkg));
      await writeFile(path.join(tmpDir, "pnpm-lock.yaml"), pnpmLock);

      const deps = await javascriptParser.parseDependencies([
        path.join(tmpDir, "package.json"),
      ]);
      expect(deps.find((d) => d.name === "express")?.resolvedVersion).toBe(
        "4.21.0",
      );
      expect(deps.find((d) => d.name === "@babel/core")?.resolvedVersion).toBe(
        "7.24.0",
      );
    });

    it("resolves versions from bun.lock", async () => {
      const pkg = {
        dependencies: { express: "^4.18.0", "@babel/core": "^7.0.0" },
      };
      const bunLock = {
        lockfileVersion: 1,
        packages: {
          express: ["express@4.21.1", "", {}, "sha512-abc"],
          "@babel/core": ["@babel/core@7.25.0", "", {}, "sha512-def"],
        },
      };

      await writeFile(path.join(tmpDir, "package.json"), JSON.stringify(pkg));
      await writeFile(path.join(tmpDir, "bun.lock"), JSON.stringify(bunLock));

      const deps = await javascriptParser.parseDependencies([
        path.join(tmpDir, "package.json"),
      ]);
      expect(deps.find((d) => d.name === "express")?.resolvedVersion).toBe(
        "4.21.1",
      );
      expect(deps.find((d) => d.name === "@babel/core")?.resolvedVersion).toBe(
        "7.25.0",
      );
    });

    it("handles malformed JSON gracefully", async () => {
      const manifestPath = path.join(tmpDir, "package.json");
      await writeFile(manifestPath, "not json at all");

      const deps = await javascriptParser.parseDependencies([manifestPath]);
      expect(deps).toHaveLength(0);
    });

    it("handles empty dependencies", async () => {
      const manifestPath = path.join(tmpDir, "package.json");
      await writeFile(manifestPath, JSON.stringify({ name: "empty" }));

      const deps = await javascriptParser.parseDependencies([manifestPath]);
      expect(deps).toHaveLength(0);
    });

    it("parses scoped packages", async () => {
      const pkg = { dependencies: { "@babel/core": "^7.0.0" } };
      const manifestPath = path.join(tmpDir, "package.json");
      await writeFile(manifestPath, JSON.stringify(pkg));

      const deps = await javascriptParser.parseDependencies([manifestPath]);
      expect(deps[0]?.name).toBe("@babel/core");
    });

    it("resolves catalog: references from workspace root", async () => {
      // Create workspace root with catalogs
      const rootPkg = {
        workspaces: ["packages/*"],
        catalogs: {
          web: { react: "19.2.4", "react-dom": "19.2.4" },
          testing: { "bun-types": "4.0.18" },
        },
      };
      await writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify(rootPkg),
      );

      // Create child package with catalog refs
      await mkdir(path.join(tmpDir, "packages", "app"), { recursive: true });
      const childPkg = {
        name: "@test/app",
        dependencies: { react: "catalog:web", "react-dom": "catalog:web" },
        devDependencies: { "bun-types": "catalog:testing" },
      };
      const childPath = path.join(tmpDir, "packages", "app", "package.json");
      await writeFile(childPath, JSON.stringify(childPkg));

      const deps = await javascriptParser.parseDependencies([
        path.join(tmpDir, "package.json"),
        childPath,
      ]);

      const react = deps.find((d) => d.name === "react");
      expect(react?.currentVersion).toBe("19.2.4");

      const reactDom = deps.find((d) => d.name === "react-dom");
      expect(reactDom?.currentVersion).toBe("19.2.4");

      const bunTypes = deps.find((d) => d.name === "bun-types");
      expect(bunTypes?.currentVersion).toBe("4.0.18");
    });

    it("resolves workspace:* references to package versions", async () => {
      // Create workspace root
      const rootPkg = {
        workspaces: ["packages/*"],
        dependencies: { "@test/shared": "workspace:*" },
      };
      await writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify(rootPkg),
      );

      // Create workspace package
      await mkdir(path.join(tmpDir, "packages", "shared"), { recursive: true });
      const sharedPkg = { name: "@test/shared", version: "1.2.3" };
      const sharedPath = path.join(
        tmpDir,
        "packages",
        "shared",
        "package.json",
      );
      await writeFile(sharedPath, JSON.stringify(sharedPkg));

      const deps = await javascriptParser.parseDependencies([
        path.join(tmpDir, "package.json"),
        sharedPath,
      ]);

      const shared = deps.find((d) => d.name === "@test/shared");
      expect(shared?.currentVersion).toBe("1.2.3");
    });

    it("resolves workspace:^ references with caret prefix", async () => {
      const rootPkg = {
        workspaces: ["packages/*"],
        dependencies: { "@test/utils": "workspace:^" },
      };
      await writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify(rootPkg),
      );

      await mkdir(path.join(tmpDir, "packages", "utils"), { recursive: true });
      const utilsPkg = { name: "@test/utils", version: "2.0.0" };
      const utilsPath = path.join(tmpDir, "packages", "utils", "package.json");
      await writeFile(utilsPath, JSON.stringify(utilsPkg));

      const deps = await javascriptParser.parseDependencies([
        path.join(tmpDir, "package.json"),
        utilsPath,
      ]);

      const utils = deps.find((d) => d.name === "@test/utils");
      expect(utils?.currentVersion).toBe("^2.0.0");
    });

    it("falls back to workspace root lockfile for child packages", async () => {
      // Create workspace root with bun.lock
      const rootPkg = {
        workspaces: ["packages/*"],
      };
      const bunLock = {
        lockfileVersion: 1,
        packages: {
          express: ["express@4.21.1", "", {}, "sha512-abc"],
        },
      };
      await writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify(rootPkg),
      );
      await writeFile(path.join(tmpDir, "bun.lock"), JSON.stringify(bunLock));

      // Create child package (no local lockfile)
      await mkdir(path.join(tmpDir, "packages", "api"), { recursive: true });
      const childPkg = {
        name: "@test/api",
        dependencies: { express: "^4.18.0" },
      };
      const childPath = path.join(tmpDir, "packages", "api", "package.json");
      await writeFile(childPath, JSON.stringify(childPkg));

      const deps = await javascriptParser.parseDependencies([
        path.join(tmpDir, "package.json"),
        childPath,
      ]);

      const express = deps.find(
        (d) => d.name === "express" && d.manifestPath === childPath,
      );
      expect(express?.resolvedVersion).toBe("4.21.1");
    });
  });

  describe("getImportPatterns", () => {
    it("returns regex for each unique dependency", () => {
      const deps = [
        {
          name: "express",
          currentVersion: "4.18.0",
          ecosystem: "npm" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
        {
          name: "express",
          currentVersion: "4.18.0",
          ecosystem: "npm" as const,
          manifestPath: "other",
          isDev: false,
          isOptional: false,
        },
        {
          name: "react",
          currentVersion: "18.0.0",
          ecosystem: "npm" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = javascriptParser.getImportPatterns(deps);
      expect(patterns.size).toBe(2); // deduped
      expect(patterns.has("express")).toBe(true);
      expect(patterns.has("react")).toBe(true);
    });

    it("matches import statements", () => {
      const deps = [
        {
          name: "express",
          currentVersion: "4.18.0",
          ecosystem: "npm" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = javascriptParser.getImportPatterns(deps);
      const regex = patterns.get("express")!;

      expect(regex.test('import express from "express"')).toBe(true);
      expect(regex.test("const e = require('express')")).toBe(true);
      expect(regex.test('import { Router } from "express"')).toBe(true);
      expect(regex.test('import("express/lib/foo")')).toBe(true);
    });

    it("matches scoped package imports", () => {
      const deps = [
        {
          name: "@babel/core",
          currentVersion: "7.0.0",
          ecosystem: "npm" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = javascriptParser.getImportPatterns(deps);
      const regex = patterns.get("@babel/core")!;

      expect(regex.test('import babel from "@babel/core"')).toBe(true);
      expect(regex.test('require("@babel/core")')).toBe(true);
    });
  });
});
