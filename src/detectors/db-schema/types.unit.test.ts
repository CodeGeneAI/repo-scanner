import { describe, expect, it } from "bun:test";
import type {
  ColumnInfo,
  DatabaseSchema,
  RelationshipInfo,
  SchemaParserResult,
  SchemaSource,
  TableInfo,
} from "./types";

describe("db-schema types", () => {
  it("SchemaSource has required fields", () => {
    const source: SchemaSource = {
      file: "migrations/001.sql",
      line: 5,
      parser: "sql",
      confidence: 0.95,
    };
    expect(source.file).toBe("migrations/001.sql");
    expect(source.parser).toBe("sql");
    expect(source.confidence).toBe(0.95);
  });

  it("ColumnInfo supports all optional fields", () => {
    const col: ColumnInfo = {
      name: "user_id",
      type: "integer",
      nullable: false,
      isPrimaryKey: false,
      isForeignKey: true,
      references: { table: "users", column: "id" },
    };
    expect(col.name).toBe("user_id");
    expect(col.references?.table).toBe("users");
  });

  it("TableInfo holds columns and primary key", () => {
    const table: TableInfo = {
      name: "users",
      columns: [
        { name: "id", type: "integer", isPrimaryKey: true },
        { name: "email", type: "varchar" },
      ],
      primaryKey: ["id"],
      source: { file: "schema.prisma", parser: "prisma", confidence: 0.95 },
    };
    expect(table.columns).toHaveLength(2);
    expect(table.primaryKey).toEqual(["id"]);
  });

  it("RelationshipInfo captures from/to and type", () => {
    const rel: RelationshipInfo = {
      from: { table: "posts", column: "author_id" },
      to: { table: "users", column: "id" },
      type: "many-to-many",
      source: { file: "schema.prisma", parser: "prisma", confidence: 0.95 },
    };
    expect(rel.type).toBe("many-to-many");
  });

  it("DatabaseSchema includes summary", () => {
    const schema: DatabaseSchema = {
      tables: [],
      relationships: [],
      summary: {
        totalTables: 0,
        totalColumns: 0,
        totalRelationships: 0,
      },
    };
    expect(schema.summary.totalTables).toBe(0);
  });

  it("SchemaParserResult is returned by parsers", () => {
    const result: SchemaParserResult = {
      tables: [],
      relationships: [],
    };
    expect(result.tables).toEqual([]);
    expect(result.relationships).toEqual([]);
  });

  it("parser field accepts all valid parser types", () => {
    const parsers = [
      "sql",
      "prisma",
      "django",
      "sqlalchemy",
      "typeorm",
      "drizzle",
    ] as const;
    for (const parser of parsers) {
      const source: SchemaSource = {
        file: "test",
        parser,
        confidence: 0.9,
      };
      expect(source.parser).toBe(parser);
    }
  });
});
