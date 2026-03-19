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

    it("detects CONSTRAINT ... PRIMARY KEY clause", () => {
      const sql = `
CREATE TABLE users (
  id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  CONSTRAINT users_pkey PRIMARY KEY (id, tenant_id)
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

    it("preserves multi-word and precision SQL types", () => {
      const sql = `
CREATE TABLE events (
  id BIGINT PRIMARY KEY,
  occurred_at timestamp with time zone NOT NULL,
  created_at timestamp without time zone NOT NULL,
  email character varying(255),
  title character varying (128)
);`;
      const result = parseSql(sql, "migrations/001.sql");
      const table = result.tables[0]!;
      expect(table.columns.find((c) => c.name === "occurred_at")!.type).toBe(
        "TIMESTAMP WITH TIME ZONE",
      );
      expect(table.columns.find((c) => c.name === "created_at")!.type).toBe(
        "TIMESTAMP WITHOUT TIME ZONE",
      );
      expect(table.columns.find((c) => c.name === "email")!.type).toBe(
        "CHARACTER VARYING(255)",
      );
      expect(table.columns.find((c) => c.name === "title")!.type).toBe(
        "CHARACTER VARYING (128)",
      );
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

    it("handles ADD COLUMN IF NOT EXISTS clauses in a single ALTER statement", () => {
      const sql = `
CREATE TABLE sessions (
  id TEXT PRIMARY KEY
);

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS app_id text,
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS browser_name text;`;
      const result = parseSql(sql, "migrations/001.sql");
      const columns = result.tables[0]!.columns.map((column) => column.name);
      expect(columns).toContain("app_id");
      expect(columns).toContain("device_type");
      expect(columns).toContain("browser_name");
    });

    it("preserves commas inside quoted defaults in ALTER TABLE ADD COLUMN", () => {
      const sql = `
CREATE TABLE labels (
  id SERIAL PRIMARY KEY
);

ALTER TABLE labels
  ADD COLUMN label TEXT DEFAULT 'alpha,beta';`;
      const result = parseSql(sql, "migrations/001.sql");
      const label = result.tables[0]!.columns.find((c) => c.name === "label")!;
      expect(label.defaultValue).toBe("'alpha,beta'");
    });

    it("preserves commas inside dollar-quoted defaults in ALTER TABLE ADD COLUMN", () => {
      const sql = `
CREATE TABLE labels (
  id SERIAL PRIMARY KEY
);

ALTER TABLE labels
  ADD COLUMN note TEXT DEFAULT $$alpha,beta$$;`;
      const result = parseSql(sql, "migrations/001.sql");
      const note = result.tables[0]!.columns.find((c) => c.name === "note")!;
      expect(note.defaultValue).toBe("$$alpha,beta$$");
    });

    it("handles ALTER COLUMN TYPE updates", () => {
      const sql = `
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY,
  agent_id UUID
);

ALTER TABLE public.ai_conversations
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN agent_id TYPE text USING agent_id::text;`;
      const result = parseSql(sql, "migrations/001.sql");
      const table = result.tables[0]!;
      expect(table.columns.find((column) => column.name === "id")!.type).toBe(
        "TEXT",
      );
      expect(
        table.columns.find((column) => column.name === "agent_id")!.type,
      ).toBe("TEXT");
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

    it("handles ALTER TABLE ONLY ... ADD CONSTRAINT FOREIGN KEY", () => {
      const sql = `
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  author_id INTEGER
);

ALTER TABLE ONLY public.posts
  ADD CONSTRAINT posts_author_fk FOREIGN KEY (author_id) REFERENCES public.users(id);`;
      const result = parseSql(sql, "migrations/001.sql");
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

    it("handles composite foreign keys in ALTER TABLE CONSTRAINT clauses", () => {
      const sql = `
CREATE TABLE project_workflow_trigger_schedules (
  project_id INTEGER NOT NULL,
  workflow_id INTEGER NOT NULL
);

ALTER TABLE project_workflow_trigger_schedules
  ADD CONSTRAINT project_workflow_trigger_schedules_setting_fkey
  FOREIGN KEY (project_id, workflow_id)
  REFERENCES project_workflow_settings(project_id, workflow_id);`;
      const result = parseSql(sql, "migrations/001.sql");
      const table = result.tables[0]!;
      const projectId = table.columns.find((c) => c.name === "project_id")!;
      const workflowId = table.columns.find((c) => c.name === "workflow_id")!;

      expect(projectId.isForeignKey).toBe(true);
      expect(projectId.references).toEqual({
        table: "project_workflow_settings",
        column: "project_id",
      });
      expect(workflowId.isForeignKey).toBe(true);
      expect(workflowId.references).toEqual({
        table: "project_workflow_settings",
        column: "workflow_id",
      });

      expect(result.relationships).toHaveLength(2);
      expect(result.relationships).toContainEqual(
        expect.objectContaining({
          from: {
            table: "project_workflow_trigger_schedules",
            column: "project_id",
          },
          to: { table: "project_workflow_settings", column: "project_id" },
        }),
      );
      expect(result.relationships).toContainEqual(
        expect.objectContaining({
          from: {
            table: "project_workflow_trigger_schedules",
            column: "workflow_id",
          },
          to: { table: "project_workflow_settings", column: "workflow_id" },
        }),
      );
    });

    it("emits ALTER TABLE FOREIGN KEY relationships even without same-file CREATE TABLE", () => {
      const sql = `
ALTER TABLE ONLY public.workspace_agent_thread_sandbox_sessions
  ADD CONSTRAINT workspace_agent_thread_sandbox_sessions_workspace_sandbox_lease_id_fkey
  FOREIGN KEY (workspace_sandbox_lease_id) REFERENCES public.workspace_sandbox_leases(id);`;
      const result = parseSql(sql, "migrations/002.sql");

      expect(result.tables).toHaveLength(0);
      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0]!.from).toEqual({
        table: "workspace_agent_thread_sandbox_sessions",
        column: "workspace_sandbox_lease_id",
      });
      expect(result.relationships[0]!.to).toEqual({
        table: "workspace_sandbox_leases",
        column: "id",
      });
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
