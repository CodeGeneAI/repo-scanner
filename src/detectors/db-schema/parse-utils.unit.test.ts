import { describe, expect, it } from "bun:test";
import {
  CONFIDENCE,
  collectParserResults,
  extractBalanced,
  splitAtTopLevel,
} from "./parse-utils";

describe("parse-utils", () => {
  describe("CONFIDENCE", () => {
    it("has correct values for all parsers", () => {
      expect(CONFIDENCE.sql).toBe(0.95);
      expect(CONFIDENCE.prisma).toBe(0.95);
      expect(CONFIDENCE.drizzle).toBe(0.9);
      expect(CONFIDENCE.typeorm).toBe(0.9);
      expect(CONFIDENCE.django).toBe(0.9);
      expect(CONFIDENCE.sqlalchemy).toBe(0.9);
    });
  });

  describe("splitAtTopLevel", () => {
    it("splits by comma at top level", () => {
      expect(splitAtTopLevel("a, b, c")).toEqual(["a", " b", " c"]);
    });

    it("respects parentheses depth", () => {
      const result = splitAtTopLevel("a(1,2), b");
      expect(result).toEqual(["a(1,2)", " b"]);
    });

    it("respects braces depth", () => {
      const result = splitAtTopLevel("a: {x,y}, b: z");
      expect(result).toEqual(["a: {x,y}", " b: z"]);
    });

    it("handles empty string", () => {
      expect(splitAtTopLevel("")).toEqual([]);
    });

    it("handles single item (no delimiter)", () => {
      expect(splitAtTopLevel("only_one")).toEqual(["only_one"]);
    });

    it("handles nested structures", () => {
      const result = splitAtTopLevel("f(g(1,2),3), h");
      expect(result).toEqual(["f(g(1,2),3)", " h"]);
    });
  });

  describe("extractBalanced", () => {
    it("extracts content between braces", () => {
      const content = "{ hello world }";
      expect(extractBalanced(content, 2, "{", "}")).toBe("hello world ");
    });

    it("handles nested braces", () => {
      const content = "{ a { b } c }";
      expect(extractBalanced(content, 2, "{", "}")).toBe("a { b } c ");
    });

    it("extracts content between parentheses", () => {
      const content = "( foo(bar) )";
      expect(extractBalanced(content, 2, "(", ")")).toBe("foo(bar) ");
    });

    it("handles empty balanced content", () => {
      const content = "{}";
      expect(extractBalanced(content, 1, "{", "}")).toBe("");
    });
  });

  describe("collectParserResults", () => {
    it("skips file when parser throws (per-file error isolation)", async () => {
      const throwingParser = (): never => {
        throw new Error("parse failure");
      };
      const files = [{ path: "/nonexistent/fake.ts", relativePath: "fake.ts" }];
      const result = await collectParserResults(files, null, throwingParser);
      expect(result.tables).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it("skips file when bail check returns false", async () => {
      const parser = (_c: string, _f: string) => ({
        tables: [
          {
            name: "t",
            columns: [],
            source: { file: "x", parser: "sql" as const, confidence: 0.9 },
          },
        ],
        relationships: [],
      });
      const files = [{ path: "/nonexistent/fake.ts", relativePath: "fake.ts" }];
      // bail check always returns false → parser never called
      const result = await collectParserResults(files, () => false, parser);
      expect(result.tables).toHaveLength(0);
    });
  });
});
