import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { TodoAnnotation } from "../types";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";

const tmpDir = () => mkdtemp(path.join(os.tmpdir(), "todo-test-"));

const writeAt = async (root: string, relPath: string, content: string) => {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
};

const runTodo = async (root: string) => {
  const idx = await FileIndex.build(root);
  const detector = getDetectors().find((d) => d.id === "todo")!;
  return detector.detect(root, idx);
};

describe("todo detector", () => {
  it("is registered", () => {
    const detector = getDetectors().find((d) => d.id === "todo");
    expect(detector).toBeDefined();
  });

  it("detects TODO in single-line // comment", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "app.ts", "const x = 1;\n// TODO: fix this\n");
      const result = await runTodo(root);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations.length).toBe(1);
      expect(annotations[0]!.tag).toBe("TODO");
      expect(annotations[0]!.text).toBe("fix this");
      expect(annotations[0]!.line).toBe(2);
      expect(annotations[0]!.file).toBe("app.ts");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects FIXME in block comment", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "app.ts", "/* FIXME: broken */\n");
      const result = await runTodo(root);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations.length).toBe(1);
      expect(annotations[0]!.tag).toBe("FIXME");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects all 5 tag types", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "app.ts",
        [
          "// TODO: one",
          "// FIXME: two",
          "// HACK: three",
          "// BUG: four",
          "// XXX: five",
        ].join("\n") + "\n",
      );
      const result = await runTodo(root);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations.length).toBe(5);
      const tags = annotations.map((a) => a.tag).sort();
      expect(tags).toEqual(["BUG", "FIXME", "HACK", "TODO", "XXX"]);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("extracts author from TODO(username)", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "app.ts", "// TODO(jsmith): refactor this\n");
      const result = await runTodo(root);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations.length).toBe(1);
      expect(annotations[0]!.author).toBe("jsmith");
      expect(annotations[0]!.text).toBe("refactor this");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("works in Python # comments", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "app.py", "# TODO: implement this\nx = 1\n");
      const result = await runTodo(root);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations.length).toBe(1);
      expect(annotations[0]!.tag).toBe("TODO");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("works in Go // comments", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "main.go", "package main\n// HACK: workaround\n");
      const result = await runTodo(root);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations.length).toBe(1);
      expect(annotations[0]!.tag).toBe("HACK");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("ignores non-code files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "data.json", '{"TODO": "fix this"}\n');
      await writeAt(root, "readme.md", "# TODO: write docs\n");
      const result = await runTodo(root);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations.length).toBe(0);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("returns empty for clean files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "app.ts", "const x = 1;\nconst y = 2;\n");
      const result = await runTodo(root);
      expect(result.findings.length).toBe(0);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations.length).toBe(0);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("captures full text to end of line", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "app.ts",
        "// TODO: this is a long description of the problem\n",
      );
      const result = await runTodo(root);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations[0]!.text).toBe(
        "this is a long description of the problem",
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("sorts by file then line", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "b.ts", "// TODO: second file\n");
      await writeAt(
        root,
        "a.ts",
        "x\n// TODO: first file line 2\n// FIXME: first file line 3\n",
      );
      const result = await runTodo(root);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations.length).toBe(3);
      expect(annotations[0]!.file).toBe("a.ts");
      expect(annotations[0]!.line).toBe(2);
      expect(annotations[1]!.file).toBe("a.ts");
      expect(annotations[1]!.line).toBe(3);
      expect(annotations[2]!.file).toBe("b.ts");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("caps at 500 annotations", async () => {
    const root = await tmpDir();
    try {
      const lines = Array.from(
        { length: 600 },
        (_, i) => `// TODO: item ${i}`,
      ).join("\n");
      await writeAt(root, "big.ts", lines + "\n");
      const result = await runTodo(root);
      const annotations = result.metadata!.todoAnnotations as TodoAnnotation[];
      expect(annotations.length).toBe(500);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("populates findings with tag summary", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "app.ts",
        "// TODO: one\n// TODO: two\n// FIXME: three\n",
      );
      const result = await runTodo(root);
      expect(result.findings.length).toBeGreaterThan(0);
      const todoFinding = result.findings.find((f) => f.value === "TODO");
      expect(todoFinding).toBeDefined();
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
