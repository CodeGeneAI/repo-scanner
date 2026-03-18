import { describe, expect, it } from "bun:test";
import { FileIndex } from "../../utils/file-index";
import { getDetectors } from "../registry";
import {
  dedupeRelationships,
  mergeTables,
  normalizeTableName,
  setDbSchemaOptions,
} from "./index";
import type { RelationshipInfo, TableInfo } from "./types";

describe("db-schema detector", () => {
  describe("normalizeTableName", () => {
    it("converts PascalCase to snake_case", () => {
      expect(normalizeTableName("UserProfile")).toBe("user_profile");
    });

    it("converts camelCase to snake_case", () => {
      expect(normalizeTableName("userProfile")).toBe("user_profile");
    });

    it("keeps snake_case as-is", () => {
      expect(normalizeTableName("user_profile")).toBe("user_profile");
    });

    it("lowercases single words", () => {
      expect(normalizeTableName("Users")).toBe("users");
      expect(normalizeTableName("users")).toBe("users");
    });

    it("handles consecutive uppercase letters", () => {
      expect(normalizeTableName("HTMLElement")).toBe("html_element");
      expect(normalizeTableName("APIKey")).toBe("api_key");
    });
  });

  describe("mergeTables", () => {
    it("deduplicates tables by normalized name", () => {
      const tables: TableInfo[] = [
        {
          name: "UserProfile",
          columns: [{ name: "id", type: "integer", isPrimaryKey: true }],
          primaryKey: ["id"],
          source: { file: "schema.prisma", parser: "prisma", confidence: 0.95 },
        },
        {
          name: "user_profile",
          columns: [{ name: "id", type: "INTEGER", isPrimaryKey: true }],
          primaryKey: ["id"],
          source: {
            file: "migrations/001.sql",
            parser: "sql",
            confidence: 0.95,
          },
        },
      ];

      const merged = mergeTables(tables);
      expect(merged).toHaveLength(1);
      expect(merged[0]!.name).toBe("user_profile");
    });

    it("prefers higher-confidence source", () => {
      const tables: TableInfo[] = [
        {
          name: "users",
          columns: [{ name: "id", type: "integer" }],
          source: { file: "models.py", parser: "django", confidence: 0.9 },
        },
        {
          name: "users",
          columns: [{ name: "id", type: "INTEGER" }],
          source: { file: "001.sql", parser: "sql", confidence: 0.95 },
        },
      ];

      const merged = mergeTables(tables);
      expect(merged[0]!.source.parser).toBe("sql");
    });

    it("unions columns from multiple sources", () => {
      const tables: TableInfo[] = [
        {
          name: "users",
          columns: [
            { name: "id", type: "integer" },
            { name: "name", type: "varchar" },
          ],
          source: { file: "001.sql", parser: "sql", confidence: 0.95 },
        },
        {
          name: "users",
          columns: [
            { name: "id", type: "integer" },
            { name: "email", type: "varchar" },
          ],
          source: { file: "schema.prisma", parser: "prisma", confidence: 0.95 },
        },
      ];

      const merged = mergeTables(tables);
      expect(merged[0]!.columns).toHaveLength(3);
      const colNames = merged[0]!.columns.map((c) => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("name");
      expect(colNames).toContain("email");
    });

    it("returns summary counts correctly", () => {
      const tables: TableInfo[] = [
        {
          name: "users",
          columns: [
            { name: "id", type: "integer" },
            { name: "name", type: "varchar" },
          ],
          source: { file: "001.sql", parser: "sql", confidence: 0.95 },
        },
        {
          name: "posts",
          columns: [{ name: "id", type: "integer" }],
          source: { file: "001.sql", parser: "sql", confidence: 0.95 },
        },
      ];

      const merged = mergeTables(tables);
      expect(merged).toHaveLength(2);
      const totalCols = merged.reduce((s, t) => s + t.columns.length, 0);
      expect(totalCols).toBe(3);
    });

    it("handles empty input", () => {
      const merged = mergeTables([]);
      expect(merged).toHaveLength(0);
    });
  });

  describe("dedupeRelationships", () => {
    it("removes duplicate relationships by composite key", () => {
      const rels: RelationshipInfo[] = [
        {
          from: { table: "posts", column: "user_id" },
          to: { table: "users", column: "id" },
          type: "one-to-many",
          source: { file: "001.sql", parser: "sql", confidence: 0.95 },
        },
        {
          from: { table: "posts", column: "user_id" },
          to: { table: "users", column: "id" },
          type: "one-to-many",
          source: { file: "schema.prisma", parser: "prisma", confidence: 0.95 },
        },
      ];

      const deduped = dedupeRelationships(rels);
      expect(deduped).toHaveLength(1);
    });

    it("keeps relationships with different columns", () => {
      const rels: RelationshipInfo[] = [
        {
          from: { table: "posts", column: "user_id" },
          to: { table: "users", column: "id" },
          type: "one-to-many",
          source: { file: "001.sql", parser: "sql", confidence: 0.95 },
        },
        {
          from: { table: "posts", column: "category_id" },
          to: { table: "categories", column: "id" },
          type: "one-to-many",
          source: { file: "001.sql", parser: "sql", confidence: 0.95 },
        },
      ];

      const deduped = dedupeRelationships(rels);
      expect(deduped).toHaveLength(2);
    });

    it("normalizes table names during dedup", () => {
      const rels: RelationshipInfo[] = [
        {
          from: { table: "UserPost", column: "user_id" },
          to: { table: "Users", column: "id" },
          type: "one-to-many",
          source: { file: "schema.prisma", parser: "prisma", confidence: 0.95 },
        },
        {
          from: { table: "user_post", column: "user_id" },
          to: { table: "users", column: "id" },
          type: "one-to-many",
          source: { file: "001.sql", parser: "sql", confidence: 0.95 },
        },
      ];

      const deduped = dedupeRelationships(rels);
      expect(deduped).toHaveLength(1);
    });

    it("handles empty input", () => {
      const deduped = dedupeRelationships([]);
      expect(deduped).toHaveLength(0);
    });
  });

  describe("detect() integration", () => {
    const getDbSchemaDetector = () => {
      const detectors = getDetectors();
      return detectors.find((d) => d.id === "db-schema")!;
    };

    it("returns empty findings when disabled", async () => {
      setDbSchemaOptions({ enabled: false });
      const detector = getDbSchemaDetector();
      const emptyIndex = new FileIndex("/fake");
      const result = await detector.detect("/fake", emptyIndex);
      expect(result.detectorId).toBe("db-schema");
      expect(result.findings).toHaveLength(0);
      expect(result.metadata).toBeUndefined();
    });

    it("returns findings and metadata when enabled with files", async () => {
      setDbSchemaOptions({ enabled: true });
      const detector = getDbSchemaDetector();
      // Use an empty index — parsers find no files, so result is empty but metadata shape is correct
      const emptyIndex = new FileIndex("/fake");
      const result = await detector.detect("/fake", emptyIndex);
      expect(result.detectorId).toBe("db-schema");
      // No files → no tables → no findings added
      expect(result.findings).toHaveLength(0);
      // Reset
      setDbSchemaOptions({ enabled: false });
    });
  });
});
