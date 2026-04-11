import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { Dependency } from "../types";
import { scanUsages } from "./scanner";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-usage-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const makeDep = (name: string): Dependency => ({
  name,
  currentVersion: "1.0.0",
  ecosystem: "npm",
  manifestPath: "package.json",
  isDev: false,
  isOptional: false,
});

describe("scanUsages", () => {
  it("finds import statements in source files", async () => {
    await writeFile(
      path.join(tmpDir, "index.ts"),
      `import express from "express";\n\nconst app = express();\n`,
    );

    const patterns = new Map<string, RegExp>([
      [
        "express",
        /(?:import\s+.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]express(?:\/[^'"]*)?['"]/,
      ],
    ]);

    const result = await scanUsages(
      tmpDir,
      "npm",
      [makeDep("express")],
      patterns,
      4,
    );

    expect(result.size).toBe(1);
    const usages = result.get("express")!;
    expect(usages).toHaveLength(1);
    expect(usages[0]!.importStatement).toBe('import express from "express";');
  });

  it("returns correct file path, line number, and import statement", async () => {
    const content = [
      "// some comment",
      "import { useState } from 'react';",
      "",
      "import lodash from 'lodash';",
      "console.log('hello');",
    ].join("\n");

    await writeFile(path.join(tmpDir, "app.tsx"), content);

    const patterns = new Map<string, RegExp>([
      [
        "react",
        /(?:import\s+.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]react(?:\/[^'"]*)?['"]/,
      ],
      [
        "lodash",
        /(?:import\s+.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]lodash(?:\/[^'"]*)?['"]/,
      ],
    ]);

    const result = await scanUsages(
      tmpDir,
      "npm",
      [makeDep("react"), makeDep("lodash")],
      patterns,
      4,
    );

    const reactUsages = result.get("react")!;
    expect(reactUsages).toHaveLength(1);
    expect(reactUsages[0]!.filePath).toBe(path.join(tmpDir, "app.tsx"));
    expect(reactUsages[0]!.line).toBe(2);
    expect(reactUsages[0]!.importStatement).toBe(
      "import { useState } from 'react';",
    );

    const lodashUsages = result.get("lodash")!;
    expect(lodashUsages).toHaveLength(1);
    expect(lodashUsages[0]!.line).toBe(4);
  });

  it("only scans files with correct extensions for ecosystem", async () => {
    // Create a .ts file and a .py file in the same directory
    await writeFile(
      path.join(tmpDir, "code.ts"),
      `import lodash from "lodash";\n`,
    );
    await writeFile(path.join(tmpDir, "code.py"), "import lodash\n");

    const patterns = new Map<string, RegExp>([
      [
        "lodash",
        /(?:import\s+.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]lodash(?:\/[^'"]*)?['"]/,
      ],
    ]);

    // Scan as npm ecosystem - should only pick up .ts files
    const result = await scanUsages(
      tmpDir,
      "npm",
      [makeDep("lodash")],
      patterns,
      4,
    );

    const usages = result.get("lodash")!;
    expect(usages).toHaveLength(1);
    expect(usages[0]!.filePath).toMatch(/\.ts$/);
  });

  it("handles empty directories", async () => {
    const patterns = new Map<string, RegExp>([["express", /express/]]);

    const result = await scanUsages(
      tmpDir,
      "npm",
      [makeDep("express")],
      patterns,
      4,
    );

    expect(result.size).toBe(0);
  });

  it("returns empty map when importPatterns is empty", async () => {
    await writeFile(
      path.join(tmpDir, "index.ts"),
      `import express from "express";\n`,
    );

    const result = await scanUsages(
      tmpDir,
      "npm",
      [makeDep("express")],
      new Map(),
      4,
    );

    expect(result.size).toBe(0);
  });

  it("skips binary files (files with null bytes)", async () => {
    // Write a binary file with null bytes in the first 8KB
    const binaryContent = Buffer.concat([
      Buffer.from('import express from "express";\n'),
      Buffer.alloc(1, 0), // null byte
      Buffer.from("more content"),
    ]);
    await writeFile(path.join(tmpDir, "binary.js"), binaryContent);

    const patterns = new Map<string, RegExp>([
      [
        "express",
        /(?:import\s+.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]express(?:\/[^'"]*)?['"]/,
      ],
    ]);

    const result = await scanUsages(
      tmpDir,
      "npm",
      [makeDep("express")],
      patterns,
      4,
    );

    expect(result.size).toBe(0);
  });

  it("scans files in subdirectories", async () => {
    await mkdir(path.join(tmpDir, "src", "components"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "src", "components", "Button.tsx"),
      `import React from "react";\n\nexport const Button = () => <button />;\n`,
    );

    const patterns = new Map<string, RegExp>([
      [
        "react",
        /(?:import\s+.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]react(?:\/[^'"]*)?['"]/,
      ],
    ]);

    const result = await scanUsages(
      tmpDir,
      "npm",
      [makeDep("react")],
      patterns,
      4,
    );

    const usages = result.get("react")!;
    expect(usages).toHaveLength(1);
    expect(usages[0]!.filePath).toBe(
      path.join(tmpDir, "src", "components", "Button.tsx"),
    );
  });

  it("finds multiple usages across multiple files", async () => {
    await writeFile(
      path.join(tmpDir, "a.ts"),
      `import express from "express";\n`,
    );
    await writeFile(
      path.join(tmpDir, "b.ts"),
      `const app = require("express");\n`,
    );

    const patterns = new Map<string, RegExp>([
      [
        "express",
        /(?:import\s+.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]express(?:\/[^'"]*)?['"]/,
      ],
    ]);

    const result = await scanUsages(
      tmpDir,
      "npm",
      [makeDep("express")],
      patterns,
      4,
    );

    const usages = result.get("express")!;
    expect(usages).toHaveLength(2);
  });

  it("uses indexed usage files when provided", async () => {
    await writeFile(
      path.join(tmpDir, "included.ts"),
      `import react from "react";
`,
    );
    await writeFile(
      path.join(tmpDir, "excluded.ts"),
      `import react from "react";
`,
    );

    const patterns = new Map<string, RegExp>([
      [
        "react",
        /(?:import\s+.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]react(?:\/[^'"]*)?['"]/,
      ],
    ]);

    const result = await scanUsages(
      tmpDir,
      "npm",
      [makeDep("react")],
      patterns,
      4,
      [
        {
          path: path.join(tmpDir, "included.ts"),
          ext: ".ts",
        },
      ],
    );

    const usages = result.get("react")!;
    expect(usages).toHaveLength(1);
    expect(usages[0]!.filePath).toBe(path.join(tmpDir, "included.ts"));
  });
});
