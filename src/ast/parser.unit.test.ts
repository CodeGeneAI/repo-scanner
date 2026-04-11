import { describe, expect, it } from "bun:test";
import { parseFile, SUPPORTED_EXTENSIONS } from "./parser";

describe("parseFile", () => {
  it("returns a ParseResult for a .ts file with valid source", async () => {
    const source = "const x: number = 42;";
    const result = await parseFile(source, ".ts");

    expect(result).not.toBeNull();
    expect(result!.tree).toBeDefined();
    expect(result!.lang).toBeDefined();
  });

  it("returns a ParseResult for a .py file with valid source", async () => {
    const source = `def hello():\n    return "world"`;
    const result = await parseFile(source, ".py");

    expect(result).not.toBeNull();
    expect(result!.tree).toBeDefined();
    expect(result!.lang).toBeDefined();
  });

  it("returns null for unsupported extension", async () => {
    const source = "some plain text content";
    const result = await parseFile(source, ".txt");

    expect(result).toBeNull();
  });

  it("returns a valid tree for empty source", async () => {
    const result = await parseFile("", ".ts");

    // tree-sitter parses empty strings into a tree with just a "program" root
    expect(result).not.toBeNull();
    expect(result!.tree).toBeDefined();
    expect(result!.tree.rootNode.type).toBe("program");
    expect(result!.tree.rootNode.childCount).toBe(0);
  });

  it("tree has correct root node type for TypeScript", async () => {
    const source = "class Foo { bar() {} }";
    const result = await parseFile(source, ".ts");

    expect(result).not.toBeNull();
    expect(result!.tree.rootNode.type).toBe("program");
    // The program should contain at least one child (the class declaration)
    expect(result!.tree.rootNode.childCount).toBeGreaterThan(0);
  });

  it("tree has correct root node type for Python", async () => {
    const source = "class Foo:\n    pass";
    const result = await parseFile(source, ".py");

    expect(result).not.toBeNull();
    expect(result!.tree.rootNode.type).toBe("module");
  });

  it("SUPPORTED_EXTENSIONS includes expected languages", () => {
    expect(SUPPORTED_EXTENSIONS.has(".ts")).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has(".py")).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has(".go")).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has(".rs")).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has(".java")).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has(".txt")).toBe(false);
  });
});
