import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { DeadExport } from "../types";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";

const tmpDir = () => mkdtemp(path.join(os.tmpdir(), "dead-export-test-"));

const writeAt = async (root: string, relPath: string, content: string) => {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
};

const runDeadExport = async (root: string) => {
  const idx = await FileIndex.build(root);
  const detector = getDetectors().find((d) => d.id === "dead-export")!;
  return detector.detect(root, idx);
};

describe("dead-export detector", () => {
  it("is registered", () => {
    const detector = getDetectors().find((d) => d.id === "dead-export");
    expect(detector).toBeDefined();
  });

  it("detects unused TS export", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "a.ts", "export function foo() { return 1; }\n");
      await writeAt(root, "b.ts", "const x = 1;\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(dead.length).toBe(1);
      expect(dead[0]!.symbol).toBe("foo");
      expect(dead[0]!.file).toBe("a.ts");
      expect(dead[0]!.exportType).toBe("function");
      expect(dead[0]!.language).toBe("TypeScript");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("does NOT flag used TS export", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "a.ts", "export function foo() { return 1; }\n");
      await writeAt(root, "b.ts", "import { foo } from './a';\nfoo();\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      const fooExport = dead.find((d) => d.symbol === "foo");
      expect(fooExport).toBeUndefined();
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects unused Go exported function", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "foo.go", "package main\n\nfunc DoStuff() {\n}\n");
      await writeAt(root, "bar.go", "package main\n\nfunc main() {\n}\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(dead.some((d) => d.symbol === "DoStuff")).toBe(true);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("does NOT flag used Go export", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "foo.go", "package main\n\nfunc DoStuff() {\n}\n");
      await writeAt(
        root,
        "bar.go",
        "package main\n\nfunc main() {\n\tDoStuff()\n}\n",
      );

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(dead.some((d) => d.symbol === "DoStuff")).toBe(false);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects unused Rust pub fn", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "calc.rs", "pub fn calculate() -> i32 { 42 }\n");
      await writeAt(root, "main.rs", "fn main() {}\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(dead.some((d) => d.symbol === "calculate")).toBe(true);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects unused Python public function", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "utils.py", "def process_data():\n    pass\n");
      await writeAt(root, "main.py", "x = 1\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(dead.some((d) => d.symbol === "process_data")).toBe(true);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("does NOT flag _private Python funcs", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "utils.py", "def _internal():\n    pass\n");
      await writeAt(root, "main.py", "x = 1\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(dead.some((d) => d.symbol === "_internal")).toBe(false);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("handles re-exports", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "a.ts", "export function foo() { return 1; }\n");
      await writeAt(root, "index.ts", "export { foo } from './a';\n");
      await writeAt(root, "c.ts", "import { foo } from './index';\nfoo();\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      // foo is used via re-export, should not be dead
      expect(dead.some((d) => d.symbol === "foo")).toBe(false);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("returns empty for no code files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "data.json", '{"key": "value"}\n');

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(dead.length).toBe(0);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("ignores exports FROM test files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "foo.test.ts",
        "export function testHelper() { return 1; }\n",
      );
      await writeAt(root, "bar.ts", "const x = 1;\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      // testHelper should not show up — we don't track test file exports
      expect(dead.some((d) => d.symbol === "testHelper")).toBe(false);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("counts imports IN test files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "utils.ts",
        "export function helper() { return 1; }\n",
      );
      await writeAt(
        root,
        "utils.test.ts",
        "import { helper } from './utils';\nhelper();\n",
      );

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      // helper is imported in test, so NOT dead
      expect(dead.some((d) => d.symbol === "helper")).toBe(false);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("excludes entry point files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "index.ts", "export function main() { return 1; }\n");
      await writeAt(root, "other.ts", "const x = 1;\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      // index.ts exports should be excluded (public API surface)
      expect(dead.some((d) => d.symbol === "main")).toBe(false);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("caps at 200", async () => {
    const root = await tmpDir();
    try {
      const exports = Array.from(
        { length: 250 },
        (_, i) => `export function fn${i}() {}`,
      ).join("\n");
      await writeAt(root, "many.ts", exports + "\n");
      await writeAt(root, "other.ts", "const x = 1;\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(dead.length).toBe(200);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("confidence is low (heuristic)", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "a.ts", "export function foo() { return 1; }\n");
      await writeAt(root, "b.ts", "const x = 1;\n");

      const result = await runDeadExport(root);

      for (const f of result.findings) {
        expect(f.confidence).toBeLessThanOrEqual(0.7);
      }
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects unused TS const and class exports", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "lib.ts",
        "export const VALUE = 42;\nexport class MyClass {}\n",
      );
      await writeAt(root, "other.ts", "const x = 1;\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(
        dead.some((d) => d.symbol === "VALUE" && d.exportType === "const"),
      ).toBe(true);
      expect(
        dead.some((d) => d.symbol === "MyClass" && d.exportType === "class"),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects unused C# public class", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "Foo.cs",
        "namespace App;\n\npublic class Foo\n{\n}\n",
      );
      await writeAt(root, "Bar.cs", "namespace App;\n\nclass Bar { }\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(dead.some((d) => d.symbol === "Foo" && d.language === "C#")).toBe(
        true,
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("does NOT flag used C# class", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "Foo.cs", "namespace App;\n\npublic class Foo { }\n");
      await writeAt(
        root,
        "Bar.cs",
        "using App;\n\nclass Bar { Foo x = new Foo(); }\n",
      );

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(dead.some((d) => d.symbol === "Foo")).toBe(false);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects unused VB.NET class", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "MyModule.vb", "Public Class MyWidget\nEnd Class\n");
      await writeAt(root, "Other.vb", "Module Other\nEnd Module\n");

      const result = await runDeadExport(root);
      const dead = result.metadata!.deadExports as DeadExport[];

      expect(
        dead.some((d) => d.symbol === "MyWidget" && d.language === "VB.NET"),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
