import { describe, expect, it } from "vitest";
import { classifyCase } from "./case-classifier";

describe("classifyCase", () => {
  describe("camelCase", () => {
    it.each([
      "userName",
      "getItem",
      "parseHTML",
      "myXMLParser",
      "onClick",
    ])("classifies %s as camelCase", (name) => {
      expect(classifyCase(name)).toBe("camelCase");
    });
  });

  describe("PascalCase", () => {
    it.each([
      "UserName",
      "HttpClient",
      "HTMLParser",
      "MyComponent",
      "App",
    ])("classifies %s as PascalCase", (name) => {
      expect(classifyCase(name)).toBe("PascalCase");
    });
  });

  describe("snake_case", () => {
    it.each([
      "user_name",
      "get_item",
      "my_var_name",
      "parse_json_data",
    ])("classifies %s as snake_case", (name) => {
      expect(classifyCase(name)).toBe("snake_case");
    });
  });

  describe("kebab-case", () => {
    it.each([
      "user-name",
      "my-component",
      "api-client",
      "data-table",
    ])("classifies %s as kebab-case", (name) => {
      expect(classifyCase(name)).toBe("kebab-case");
    });
  });

  describe("SCREAMING_SNAKE_CASE", () => {
    it.each([
      "MAX_SIZE",
      "API_KEY",
      "DB_HOST",
      "NODE_ENV",
    ])("classifies %s as SCREAMING_SNAKE_CASE", (name) => {
      expect(classifyCase(name)).toBe("SCREAMING_SNAKE_CASE");
    });

    it("classifies 4+ char all-caps as SCREAMING_SNAKE_CASE", () => {
      expect(classifyCase("HTTP")).toBe("SCREAMING_SNAKE_CASE");
      expect(classifyCase("NODE")).toBe("SCREAMING_SNAKE_CASE");
    });

    it("returns undefined for short all-caps (2-3 chars) without underscore", () => {
      expect(classifyCase("FS")).toBeUndefined();
      expect(classifyCase("DB")).toBeUndefined();
      expect(classifyCase("API")).toBeUndefined();
    });
  });

  describe("flatcase", () => {
    it.each([
      "username",
      "config",
      "utils",
      "helpers",
    ])("classifies %s as flatcase", (name) => {
      expect(classifyCase(name)).toBe("flatcase");
    });
  });

  describe("edge cases", () => {
    it("returns undefined for single character", () => {
      expect(classifyCase("a")).toBeUndefined();
      expect(classifyCase("X")).toBeUndefined();
    });

    it("returns undefined for numeric-only names", () => {
      expect(classifyCase("123")).toBeUndefined();
      expect(classifyCase("42")).toBeUndefined();
    });

    it("strips file extension before classifying", () => {
      expect(classifyCase("my-component.ts")).toBe("kebab-case");
      expect(classifyCase("UserService.java")).toBe("PascalCase");
      expect(classifyCase("utils.py")).toBe("flatcase");
    });

    it("handles names with numbers", () => {
      expect(classifyCase("myVar2")).toBe("camelCase");
      expect(classifyCase("MAX_RETRY_3")).toBe("SCREAMING_SNAKE_CASE");
    });

    it("strips leading underscores before classifying", () => {
      expect(classifyCase("_private")).toBe("flatcase");
      expect(classifyCase("__dirname")).toBe("flatcase");
      expect(classifyCase("_userName")).toBe("camelCase");
      expect(classifyCase("__MyClass")).toBe("PascalCase");
      expect(classifyCase("_snake_var")).toBe("snake_case");
      expect(classifyCase("__MAX_SIZE")).toBe("SCREAMING_SNAKE_CASE");
    });

    it("returns undefined when only underscores remain after stripping", () => {
      expect(classifyCase("_")).toBeUndefined();
      expect(classifyCase("__")).toBeUndefined();
      expect(classifyCase("_a")).toBeUndefined();
    });
  });
});
