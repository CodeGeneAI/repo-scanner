import { describe, expect, it } from "bun:test";
import { parseSql } from "./sql";

describe("SQL migration parser", () => {
  describe("CREATE TABLE", () => {
    it("extracts a simple table with columns", () => {
      const sql = `
CREATE TABLE users (
  id INTEGER NOT NULL,
  name VARCHAR(255),
  email TEXT
);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0]!.name).toBe("users");
      expect(result.tables[0]!.columns).toHaveLength(3);
      expect(result.tables[0]!.columns[0]!.name).toBe("id");
      expect(result.tables[0]!.columns[0]!.type).toBe("INTEGER");
      expect(result.tables[0]!.columns[1]!.name).toBe("name");
      expect(result.tables[0]!.columns[1]!.type).toBe("VARCHAR(255)");
      expect(result.tables[0]!.columns[2]!.name).toBe("email");
      expect(result.tables[0]!.columns[2]!.type).toBe("TEXT");
    });

    it("detects PRIMARY KEY constraint", () => {
      const sql = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100)
);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
      expect(result.tables[0]!.primaryKey).toEqual(["id"]);
    });

    it("detects separate PRIMARY KEY clause", () => {
      const sql = `
CREATE TABLE users (
  id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(100),
  PRIMARY KEY (id, tenant_id)
);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.primaryKey).toEqual(["id", "tenant_id"]);
      expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
      expect(result.tables[0]!.columns[1]!.isPrimaryKey).toBe(true);
    });

    it("detects inline REFERENCES (foreign key)", () => {
      const sql = `
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  author_id INTEGER REFERENCES users(id),
  title TEXT
);`;
      const result = parseSql(sql, "migrations/001.sql");
      const authorCol = result.tables[0]!.columns[1]!;
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
      expect(result.relationships[0]!.type).toBe("one-to-many");
    });

    it("detects FOREIGN KEY constraint clause", () => {
      const sql = `
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id)
);`;
      const result = parseSql(sql, "migrations/001.sql");
      const authorCol = result.tables[0]!.columns.find(
        (c) => c.name === "author_id",
      )!;
      expect(authorCol.isForeignKey).toBe(true);
      expect(authorCol.references).toEqual({ table: "users", column: "id" });
      expect(result.relationships).toHaveLength(1);
    });

    it("handles CREATE TABLE IF NOT EXISTS", () => {
      const sql = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT
);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0]!.name).toBe("users");
    });

    it("handles quoted identifiers (double quotes)", () => {
      const sql = `
CREATE TABLE "user_profiles" (
  "id" SERIAL PRIMARY KEY,
  "full_name" VARCHAR(255)
);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.name).toBe("user_profiles");
      expect(result.tables[0]!.columns[0]!.name).toBe("id");
    });

    it("handles backtick-quoted identifiers", () => {
      const sql = `
CREATE TABLE \`user_profiles\` (
  \`id\` INT PRIMARY KEY AUTO_INCREMENT,
  \`full_name\` VARCHAR(255)
);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.name).toBe("user_profiles");
      expect(result.tables[0]!.columns[0]!.name).toBe("id");
    });

    it("handles schema-prefixed table names", () => {
      const sql = `
CREATE TABLE public.users (
  id SERIAL PRIMARY KEY,
  name TEXT
);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.name).toBe("users");
    });

    it("parses multiple tables in one file", () => {
      const sql = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT
);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables).toHaveLength(2);
      expect(result.tables[0]!.name).toBe("users");
      expect(result.tables[1]!.name).toBe("posts");
    });

    it("detects NOT NULL constraint", () => {
      const sql = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  bio TEXT
);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.columns[1]!.nullable).toBe(false);
      expect(result.tables[0]!.columns[2]!.nullable).toBe(true);
    });

    it("detects DEFAULT values", () => {
      const sql = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.columns[1]!.defaultValue).toBe("true");
      expect(result.tables[0]!.columns[2]!.defaultValue).toBe("NOW()");
    });
  });

  describe("ALTER TABLE", () => {
    it("handles ADD COLUMN", () => {
      const sql = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY
);

ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL;`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.columns).toHaveLength(2);
      expect(result.tables[0]!.columns[1]!.name).toBe("email");
      expect(result.tables[0]!.columns[1]!.type).toBe("VARCHAR(255)");
    });

    it("handles ADD without COLUMN keyword (PostgreSQL style)", () => {
      const sql = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY
);

ALTER TABLE users ADD email VARCHAR(255) NOT NULL;`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.columns).toHaveLength(2);
      expect(result.tables[0]!.columns[1]!.name).toBe("email");
    });

    it("handles ADD CONSTRAINT FOREIGN KEY", () => {
      const sql = `
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  author_id INTEGER
);

ALTER TABLE posts ADD CONSTRAINT fk_author FOREIGN KEY (author_id) REFERENCES users(id);`;
      const result = parseSql(sql, "migrations/001.sql");
      const authorCol = result.tables[0]!.columns.find(
        (c) => c.name === "author_id",
      )!;
      expect(authorCol.isForeignKey).toBe(true);
      expect(authorCol.references).toEqual({ table: "users", column: "id" });
      expect(result.relationships).toHaveLength(1);
    });

    it("handles ADD CONSTRAINT PRIMARY KEY (pg_dump format)", () => {
      const sql = `
CREATE TABLE users (
  id INTEGER NOT NULL,
  name VARCHAR(255)
);

ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.primaryKey).toEqual(["id"]);
      const idCol = result.tables[0]!.columns.find((c) => c.name === "id")!;
      expect(idCol.isPrimaryKey).toBe(true);
    });

    it("handles composite PRIMARY KEY via ALTER TABLE", () => {
      const sql = `
CREATE TABLE user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL
);

ALTER TABLE user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);`;
      const result = parseSql(sql, "migrations/001.sql");
      expect(result.tables[0]!.primaryKey).toEqual(["user_id", "role_id"]);
      expect(result.tables[0]!.columns.every((c) => c.isPrimaryKey)).toBe(true);
    });
  });

  describe("source tracking", () => {
    it("records file path and parser type", () => {
      const sql = "CREATE TABLE users (id SERIAL PRIMARY KEY);";
      const result = parseSql(sql, "db/migrations/001_create_users.sql");
      expect(result.tables[0]!.source.file).toBe(
        "db/migrations/001_create_users.sql",
      );
      expect(result.tables[0]!.source.parser).toBe("sql");
      expect(result.tables[0]!.source.confidence).toBe(0.95);
    });
  });

  describe("edge cases", () => {
    it("returns empty result for empty input", () => {
      const result = parseSql("", "empty.sql");
      expect(result.tables).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it("returns empty result for non-DDL SQL", () => {
      const result = parseSql(
        "SELECT * FROM users; INSERT INTO logs VALUES (1);",
        "query.sql",
      );
      expect(result.tables).toHaveLength(0);
    });

    it("handles truncated CREATE TABLE (no closing paren)", () => {
      const result = parseSql(
        "CREATE TABLE broken (\n  id INTEGER",
        "broken.sql",
      );
      expect(result.tables).toHaveLength(0);
    });

    it("handles DROP TABLE only", () => {
      const result = parseSql("DROP TABLE IF EXISTS users;", "drop.sql");
      expect(result.tables).toHaveLength(0);
    });
  });
});
