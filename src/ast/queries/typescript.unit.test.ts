import { describe, expect, it } from "bun:test";
import { parseFile } from "../parser";
import { extractAll } from "./typescript";

/** Helper to parse TS source and extract analysis. */
const analyze = async (source: string) => {
  const result = await parseFile(source, ".ts");
  if (!result) throw new Error("Failed to parse TypeScript source");
  return extractAll(result.tree, result.lang);
};

describe("extractAll (TypeScript)", () => {
  it("extracts class name and method count", async () => {
    const source = `
class UserService {
  getUser() { return null; }
  createUser() { return null; }
  deleteUser() { return null; }
}`;
    const analysis = await analyze(source);

    expect(analysis.classes).toHaveLength(1);
    expect(analysis.classes[0]!.name).toBe("UserService");
    expect(analysis.classes[0]!.methods).toHaveLength(3);
    expect(analysis.classes[0]!.methods.map((m) => m.name)).toEqual([
      "getUser",
      "createUser",
      "deleteUser",
    ]);
  });

  it("computes cyclomatic complexity from if/for/while", async () => {
    const source = `
class Logic {
  process(items: any[]) {
    if (items.length === 0) return;
    for (const item of items) {
      if (item.valid) {
        while (item.retry) {
          item.retry = false;
        }
      }
    }
  }
}`;
    const analysis = await analyze(source);

    expect(analysis.classes).toHaveLength(1);
    const method = analysis.classes[0]!.methods[0]!;
    expect(method.name).toBe("process");
    // Base 1 + if + for_in + if + while = 5
    expect(method.complexity).toBe(5);
  });

  it("extracts imports with source and names", async () => {
    const source = `
import { readFile, writeFile } from "fs/promises";
import path from "path";
import type { Config } from "./types";
`;
    const analysis = await analyze(source);

    expect(analysis.imports.length).toBeGreaterThanOrEqual(3);

    const fsImport = analysis.imports.find((i) => i.source === "fs/promises");
    expect(fsImport).toBeDefined();
    expect(fsImport!.names).toContain("readFile");
    expect(fsImport!.names).toContain("writeFile");
    expect(fsImport!.isTypeOnly).toBe(false);

    const typeImport = analysis.imports.find((i) => i.source === "./types");
    expect(typeImport).toBeDefined();
    expect(typeImport!.isTypeOnly).toBe(true);
  });

  it("extracts interfaces with method counts", async () => {
    const source = `
interface Repository {
  findById(id: string): Promise<Entity>;
  save(entity: Entity): Promise<void>;
  delete(id: string): Promise<void>;
}

interface Logger {
  log(message: string): void;
}
`;
    const analysis = await analyze(source);

    expect(analysis.interfaces.length).toBeGreaterThanOrEqual(2);

    const repo = analysis.interfaces.find((i) => i.name === "Repository");
    expect(repo).toBeDefined();
    expect(repo!.methodCount).toBe(3);
    expect(repo!.methods).toContain("findById");
    expect(repo!.methods).toContain("save");
    expect(repo!.methods).toContain("delete");

    const logger = analysis.interfaces.find((i) => i.name === "Logger");
    expect(logger).toBeDefined();
    expect(logger!.methodCount).toBe(1);
  });

  it("detects new X() instantiations", async () => {
    const source = `
function createApp() {
  const db = new Database();
  const cache = new RedisClient();
  return new App(db, cache);
}
`;
    const analysis = await analyze(source);

    expect(analysis.instantiations.length).toBeGreaterThanOrEqual(3);
    const classNames = analysis.instantiations.map((i) => i.className);
    expect(classNames).toContain("Database");
    expect(classNames).toContain("RedisClient");
    expect(classNames).toContain("App");

    // Each instantiation should know it's inside createApp
    for (const inst of analysis.instantiations) {
      expect(inst.inFunction).toBe("createApp");
    }
  });

  it("detects instanceof type checks", async () => {
    const source = `
function handle(err: unknown) {
  if (err instanceof TypeError) {
    console.error("type error");
  }
  if (err instanceof RangeError) {
    console.error("range error");
  }
}
`;
    const analysis = await analyze(source);

    expect(analysis.typeChecks.length).toBeGreaterThanOrEqual(2);
    const types = analysis.typeChecks.map((tc) => tc.checkedType);
    expect(types).toContain("TypeError");
    expect(types).toContain("RangeError");

    // Each check should be inside the handle function
    for (const tc of analysis.typeChecks) {
      expect(tc.inFunction).toBe("handle");
    }
  });

  it("returns empty arrays for source with no classes/imports", async () => {
    const source = "const x = 42;";
    const analysis = await analyze(source);

    expect(analysis.classes).toHaveLength(0);
    expect(analysis.imports).toHaveLength(0);
    expect(analysis.interfaces).toHaveLength(0);
    expect(analysis.instantiations).toHaveLength(0);
    expect(analysis.typeChecks).toHaveLength(0);
  });

  it("extracts class LOC correctly", async () => {
    const source = `
class BigClass {
  a() {}
  b() {}
  c() {}
  d() {}
}`;
    const analysis = await analyze(source);

    expect(analysis.classes).toHaveLength(1);
    // The class body spans multiple lines
    expect(analysis.classes[0]!.loc).toBeGreaterThan(1);
  });
});
