import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { FileIndex } from "../../utils/file-index";
import { analyzeCodeNaming } from "./code-analyzer";

describe("analyzeCodeNaming", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-naming-code-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("extracts TypeScript function and class names", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "src", "service.ts"),
      [
        "function getUserById(id: string) {}",
        "const fetchData = async (url: string) => {}",
        "class UserService {}",
        "class ApiClient {}",
        "const MAX_RETRIES = 3;",
        "const baseUrl = 'http://localhost';",
      ].join("\n"),
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    const fnPattern = patterns.find((p) => p.category === "function");
    expect(fnPattern).toBeDefined();
    expect(fnPattern!.dominantStyle).toBe("camelCase");
    expect(fnPattern!.sampleSize).toBe(2);

    const classPattern = patterns.find((p) => p.category === "class");
    expect(classPattern).toBeDefined();
    expect(classPattern!.dominantStyle).toBe("PascalCase");

    const constPattern = patterns.find((p) => p.category === "constant");
    expect(constPattern).toBeDefined();
    expect(constPattern!.dominantStyle).toBe("SCREAMING_SNAKE_CASE");
  });

  it("extracts Python function and class names", async () => {
    await writeFile(
      path.join(tmpDir, "app.py"),
      [
        "def get_user_by_id(user_id):",
        "    pass",
        "def fetch_data(url):",
        "    pass",
        "class UserService:",
        "    pass",
        "MAX_RETRIES = 3",
      ].join("\n"),
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    const fnPattern = patterns.find((p) => p.category === "function");
    expect(fnPattern).toBeDefined();
    expect(fnPattern!.dominantStyle).toBe("snake_case");

    const classPattern = patterns.find((p) => p.category === "class");
    expect(classPattern).toBeDefined();
    expect(classPattern!.dominantStyle).toBe("PascalCase");
  });

  it("extracts Go function and type names", async () => {
    await writeFile(
      path.join(tmpDir, "main.go"),
      [
        "func getUserByID(id string) {}",
        "func (s *Server) handleRequest(w http.ResponseWriter) {}",
        "type UserService struct {}",
        "type Handler interface {}",
        "const MaxRetries = 3",
      ].join("\n"),
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    const fnPattern = patterns.find((p) => p.category === "function");
    expect(fnPattern).toBeDefined();
    expect(fnPattern!.dominantStyle).toBe("camelCase");

    const classPattern = patterns.find((p) => p.category === "class");
    expect(classPattern).toBeDefined();
    expect(classPattern!.dominantStyle).toBe("PascalCase");
    expect(classPattern!.sampleSize).toBe(1);

    const ifacePattern = patterns.find((p) => p.category === "interface");
    expect(ifacePattern).toBeDefined();
    expect(ifacePattern!.dominantStyle).toBe("PascalCase");
    expect(ifacePattern!.sampleSize).toBe(1);
  });

  it("extracts Go const() block identifiers", async () => {
    await writeFile(
      path.join(tmpDir, "consts.go"),
      [
        "const (",
        "	MaxRetries = 3",
        "	DefaultTimeout = 30",
        '	API_VERSION = "v1"',
        ")",
        "",
        "const SingleConst = 42",
      ].join("\n"),
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    const varPattern = patterns.find((p) => p.category === "variable");
    expect(varPattern).toBeDefined();
    // MaxRetries, DefaultTimeout, SingleConst are PascalCase variables
    expect(varPattern!.dominantStyle).toBe("PascalCase");
    expect(varPattern!.sampleSize).toBe(3);

    const constPattern = patterns.find((p) => p.category === "constant");
    expect(constPattern).toBeDefined();
    expect(constPattern!.dominantStyle).toBe("SCREAMING_SNAKE_CASE");
    expect(constPattern!.sampleSize).toBe(1);
  });

  it("extracts Rust function and type names", async () => {
    await writeFile(
      path.join(tmpDir, "lib.rs"),
      [
        "fn get_user_by_id(id: &str) -> User {}",
        "fn parse_config<T>(path: &str) -> T {}",
        "struct UserService {}",
        "enum AppError {}",
        "const MAX_RETRIES: u32 = 3;",
      ].join("\n"),
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    const fnPattern = patterns.find((p) => p.category === "function");
    expect(fnPattern).toBeDefined();
    expect(fnPattern!.dominantStyle).toBe("snake_case");

    const classPattern = patterns.find((p) => p.category === "class");
    expect(classPattern).toBeDefined();
    expect(classPattern!.sampleSize).toBe(1);

    const enumPattern = patterns.find((p) => p.category === "enum");
    expect(enumPattern).toBeDefined();
    expect(enumPattern!.sampleSize).toBe(1);
  });

  it("skips files in secondary paths (tests, fixtures)", async () => {
    await mkdir(path.join(tmpDir, "__tests__"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "__tests__", "test.ts"),
      "function testHelper() {}",
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    expect(patterns).toEqual([]);
  });

  it("returns empty array for repo with no code files", async () => {
    await writeFile(path.join(tmpDir, "README.md"), "# Hello");
    await writeFile(path.join(tmpDir, "data.json"), "{}");

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    expect(patterns).toEqual([]);
  });

  it("extracts TypeScript interfaces, type aliases, and enums", async () => {
    await writeFile(
      path.join(tmpDir, "types.ts"),
      [
        "interface UserProfile {}",
        "interface IAuthService {}",
        "type UserId = string;",
        "type RequestConfig = { url: string };",
        "enum Status { Active, Inactive }",
        "enum UserRole { Admin, User }",
      ].join("\n"),
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    const ifacePattern = patterns.find((p) => p.category === "interface");
    expect(ifacePattern).toBeDefined();
    expect(ifacePattern!.dominantStyle).toBe("PascalCase");
    expect(ifacePattern!.sampleSize).toBe(2);

    const typePattern = patterns.find((p) => p.category === "type-alias");
    expect(typePattern).toBeDefined();
    expect(typePattern!.dominantStyle).toBe("PascalCase");
    expect(typePattern!.sampleSize).toBe(2);

    const enumPattern = patterns.find((p) => p.category === "enum");
    expect(enumPattern).toBeDefined();
    expect(enumPattern!.dominantStyle).toBe("PascalCase");
    expect(enumPattern!.sampleSize).toBe(2);
  });

  it("extracts Go interfaces separately from structs", async () => {
    await writeFile(
      path.join(tmpDir, "types.go"),
      [
        "type UserService struct {}",
        "type OrderService struct {}",
        "type Reader interface {}",
        "type Writer interface {}",
      ].join("\n"),
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    const classPattern = patterns.find((p) => p.category === "class");
    expect(classPattern).toBeDefined();
    expect(classPattern!.sampleSize).toBe(2);

    const ifacePattern = patterns.find((p) => p.category === "interface");
    expect(ifacePattern).toBeDefined();
    expect(ifacePattern!.sampleSize).toBe(2);
  });

  it("extracts Rust enums and traits separately from structs", async () => {
    await writeFile(
      path.join(tmpDir, "lib.rs"),
      ["struct MyStruct {}", "enum MyEnum {}", "trait MyTrait {}"].join("\n"),
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    const classPattern = patterns.find((p) => p.category === "class");
    expect(classPattern).toBeDefined();
    expect(classPattern!.sampleSize).toBe(1);

    const enumPattern = patterns.find((p) => p.category === "enum");
    expect(enumPattern).toBeDefined();
    expect(enumPattern!.sampleSize).toBe(1);

    const ifacePattern = patterns.find((p) => p.category === "interface");
    expect(ifacePattern).toBeDefined();
    expect(ifacePattern!.sampleSize).toBe(1);
  });

  it("skips single-word flatcase identifiers as ambiguous", async () => {
    await writeFile(
      path.join(tmpDir, "app.ts"),
      [
        "function app() {}",
        "function get() {}",
        "function send() {}",
        "function getUserById() {}",
        "function fetchData() {}",
      ].join("\n"),
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    const fnPattern = patterns.find((p) => p.category === "function");
    expect(fnPattern).toBeDefined();
    // Only getUserById and fetchData counted (camelCase); app/get/send are flatcase → skipped
    expect(fnPattern!.dominantStyle).toBe("camelCase");
    expect(fnPattern!.sampleSize).toBe(2);
  });

  it("handles mixed naming styles in a single file", async () => {
    await writeFile(
      path.join(tmpDir, "mixed.ts"),
      [
        "function camelFunc() {}",
        "function anotherCamelFunc() {}",
        "function snake_func() {}",
      ].join("\n"),
    );

    const index = await FileIndex.build(tmpDir);
    const patterns = await analyzeCodeNaming(tmpDir, index);

    const fnPattern = patterns.find((p) => p.category === "function");
    expect(fnPattern).toBeDefined();
    expect(fnPattern!.dominantStyle).toBe("camelCase");
    expect(fnPattern!.breakdown["camelCase"]).toBe(2);
    expect(fnPattern!.breakdown["snake_case"]).toBe(1);
  });
});
