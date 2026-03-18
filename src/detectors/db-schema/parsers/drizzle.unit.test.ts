import { describe, expect, it } from "bun:test";
import { parseDrizzle } from "./drizzle";

describe("Drizzle schema parser", () => {
  it("extracts pgTable with basic columns", () => {
    const code = `
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  email: text("email"),
  active: boolean("active"),
});`;
    const result = parseDrizzle(code, "src/db/schema.ts");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.name).toBe("users");
    expect(result.tables[0]!.columns).toHaveLength(4);
    expect(result.tables[0]!.columns[0]!.name).toBe("id");
    expect(result.tables[0]!.columns[0]!.type).toBe("serial");
    expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
    expect(result.tables[0]!.columns[1]!.type).toBe("varchar");
    expect(result.tables[0]!.columns[2]!.type).toBe("text");
    expect(result.tables[0]!.columns[3]!.type).toBe("boolean");
  });

  it("extracts mysqlTable definition", () => {
    const code = `
export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }),
});`;
    const result = parseDrizzle(code, "src/db/schema.ts");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.name).toBe("users");
    expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
  });

  it("extracts sqliteTable definition", () => {
    const code = `
export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name"),
});`;
    const result = parseDrizzle(code, "src/db/schema.ts");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.name).toBe("users");
  });

  it("detects .references() for foreign keys", () => {
    const code = `
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").references(() => users.id),
  title: text("title"),
});`;
    const result = parseDrizzle(code, "src/db/schema.ts");
    const authorCol = result.tables[0]!.columns.find(
      (c) => c.name === "author_id",
    )!;
    expect(authorCol.isForeignKey).toBe(true);
    expect(authorCol.references).toEqual({ table: "users", column: "id" });
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.from).toEqual({
      table: "posts",
      column: "author_id",
    });
    expect(result.relationships[0]!.to).toEqual({
      table: "users",
      column: "id",
    });
  });

  it("detects .notNull()", () => {
    const code = `
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  bio: text("bio"),
});`;
    const result = parseDrizzle(code, "src/db/schema.ts");
    expect(result.tables[0]!.columns[1]!.nullable).toBe(false);
    expect(result.tables[0]!.columns[2]!.nullable).toBe(true);
  });

  it("detects .default()", () => {
    const code = `
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  active: boolean("active").default(true),
});`;
    const result = parseDrizzle(code, "src/db/schema.ts");
    expect(result.tables[0]!.columns[1]!.defaultValue).toBe("true");
  });

  it("records source info correctly", () => {
    const code = `
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
});`;
    const result = parseDrizzle(code, "src/db/schema.ts");
    expect(result.tables[0]!.source.file).toBe("src/db/schema.ts");
    expect(result.tables[0]!.source.parser).toBe("drizzle");
    expect(result.tables[0]!.source.confidence).toBe(0.9);
  });

  it("handles multiple tables in one file", () => {
    const code = `
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name"),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").references(() => users.id),
});`;
    const result = parseDrizzle(code, "src/db/schema.ts");
    expect(result.tables).toHaveLength(2);
    expect(result.tables[0]!.name).toBe("users");
    expect(result.tables[1]!.name).toBe("posts");
  });

  it("returns empty result for empty input", () => {
    const result = parseDrizzle("", "schema.ts");
    expect(result.tables).toHaveLength(0);
    expect(result.relationships).toHaveLength(0);
  });

  it("returns empty result for non-schema TypeScript", () => {
    const result = parseDrizzle(
      `export function getUser(id: number) { return db.query("SELECT * FROM users"); }`,
      "utils.ts",
    );
    expect(result.tables).toHaveLength(0);
  });
});
