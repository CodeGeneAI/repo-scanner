import { describe, expect, it } from "bun:test";
import { assignDatabaseGroups, inferDatabaseGroup } from "./group-utils";
import type { TableInfo } from "./types";

const makeTable = (name: string, file: string): TableInfo => ({
  name,
  columns: [{ name: "id", type: "int", isPrimaryKey: true }],
  source: { file, parser: "sql", confidence: 0.95 },
});

describe("inferDatabaseGroup", () => {
  it("extracts service name before migrations directory", () => {
    expect(inferDatabaseGroup("services/auth/migrations/001.sql")).toBe("auth");
  });

  it("extracts package name before prisma directory", () => {
    expect(inferDatabaseGroup("packages/core/prisma/schema.prisma")).toBe(
      "core",
    );
  });

  it("extracts name before models directory", () => {
    expect(inferDatabaseGroup("apps/backend/src/models/user.py")).toBe(
      "backend",
    );
  });

  it("skips generic src directory to find meaningful name", () => {
    expect(inferDatabaseGroup("services/billing/src/db/schema.ts")).toBe(
      "billing",
    );
  });

  it("skips generic app directory to find meaningful name", () => {
    expect(inferDatabaseGroup("myproject/app/models/user.rb")).toBe(
      "myproject",
    );
  });

  it("returns default for shallow paths with no predecessor", () => {
    expect(inferDatabaseGroup("migrations/001.sql")).toBe("default");
  });

  it("returns default for single-segment paths", () => {
    expect(inferDatabaseGroup("schema.sql")).toBe("default");
  });

  it("returns default for empty string", () => {
    expect(inferDatabaseGroup("")).toBe("default");
  });

  it("handles db boundary directory", () => {
    expect(inferDatabaseGroup("services/auth/db/schema.sql")).toBe("auth");
  });

  it("handles sql boundary directory", () => {
    expect(inferDatabaseGroup("services/billing/sql/views.sql")).toBe(
      "billing",
    );
  });

  it("handles schema boundary directory", () => {
    expect(inferDatabaseGroup("services/core/schema/tables.sql")).toBe("core");
  });

  it("handles database boundary directory", () => {
    expect(inferDatabaseGroup("apps/store/database/seeds.sql")).toBe("store");
  });

  it("handles migrate boundary directory", () => {
    expect(inferDatabaseGroup("services/auth/migrate/001.rb")).toBe("auth");
  });

  it("handles nested migrations path", () => {
    expect(
      inferDatabaseGroup(
        "services/project-management/migrations/20240101_init.sql",
      ),
    ).toBe("project-management");
  });

  it("handles Windows-style backslash paths", () => {
    expect(inferDatabaseGroup("services\\auth\\migrations\\001.sql")).toBe(
      "auth",
    );
  });

  it("handles entities boundary directory", () => {
    expect(inferDatabaseGroup("modules/users/src/entities/User.ts")).toBe(
      "users",
    );
  });

  it("returns default when only generic dirs precede boundary", () => {
    expect(inferDatabaseGroup("src/models/user.py")).toBe("default");
  });

  it("returns default when only boundary dirs precede boundary", () => {
    expect(inferDatabaseGroup("db/migrations/001.sql")).toBe("default");
  });

  it("returns default for multiple consecutive boundary dirs with no meaningful predecessor", () => {
    expect(inferDatabaseGroup("db/migrations/sql/schema.sql")).toBe("default");
  });

  it("handles mixed-case boundary directory names", () => {
    expect(inferDatabaseGroup("services/auth/Migrations/001.sql")).toBe("auth");
  });

  it("handles monorepo apps/api/src/db pattern", () => {
    expect(inferDatabaseGroup("apps/api/src/db/migrations/001.sql")).toBe(
      "api",
    );
  });

  it("handles trailing slashes via filter(Boolean)", () => {
    expect(inferDatabaseGroup("services/auth/migrations/")).toBe("auth");
  });

  it("handles double slashes in path", () => {
    expect(inferDatabaseGroup("services//auth//migrations//001.sql")).toBe(
      "auth",
    );
  });

  it("lowercases PascalCase directory names", () => {
    expect(inferDatabaseGroup("services/AuthService/migrations/001.sql")).toBe(
      "authservice",
    );
  });
});

describe("assignDatabaseGroups", () => {
  it("returns empty array for empty input", () => {
    expect(assignDatabaseGroups([])).toEqual([]);
  });

  it("returns tables unchanged when all resolve to same group", () => {
    const tables = [
      makeTable("users", "services/auth/migrations/001.sql"),
      makeTable("roles", "services/auth/migrations/002.sql"),
    ];
    const result = assignDatabaseGroups(tables);
    expect(result).toHaveLength(2);
    expect(result[0]!.databaseGroup).toBeUndefined();
    expect(result[1]!.databaseGroup).toBeUndefined();
  });

  it("returns tables unchanged when all resolve to default", () => {
    const tables = [
      makeTable("users", "schema.sql"),
      makeTable("config", "setup.sql"),
    ];
    const result = assignDatabaseGroups(tables);
    expect(result).toHaveLength(2);
    expect(result[0]!.databaseGroup).toBeUndefined();
    expect(result[1]!.databaseGroup).toBeUndefined();
  });

  it("assigns databaseGroup when tables come from different groups", () => {
    const tables = [
      makeTable("users", "services/auth/migrations/001.sql"),
      makeTable("projects", "services/project/migrations/001.sql"),
    ];
    const result = assignDatabaseGroups(tables);
    expect(result).toHaveLength(2);
    expect(result[0]!.databaseGroup).toBe("auth");
    expect(result[1]!.databaseGroup).toBe("project");
  });

  it("handles mix of default and named groups", () => {
    const tables = [
      makeTable("users", "services/auth/migrations/001.sql"),
      makeTable("config", "schema.sql"),
    ];
    const result = assignDatabaseGroups(tables);
    expect(result).toHaveLength(2);
    expect(result[0]!.databaseGroup).toBe("auth");
    expect(result[1]!.databaseGroup).toBe("default");
  });

  it("preserves all other table properties", () => {
    const tables = [
      makeTable("users", "services/auth/migrations/001.sql"),
      makeTable("projects", "services/project/migrations/001.sql"),
    ];
    const result = assignDatabaseGroups(tables);
    expect(result[0]!.name).toBe("users");
    expect(result[0]!.columns).toHaveLength(1);
    expect(result[0]!.source.parser).toBe("sql");
  });

  it("handles single table input", () => {
    const tables = [makeTable("users", "services/auth/migrations/001.sql")];
    const result = assignDatabaseGroups(tables);
    expect(result).toHaveLength(1);
    expect(result[0]!.databaseGroup).toBeUndefined();
  });

  it("does not mutate the input array", () => {
    const tables = [
      makeTable("users", "services/auth/migrations/001.sql"),
      makeTable("projects", "services/project/migrations/001.sql"),
    ];
    const original = [...tables];
    assignDatabaseGroups(tables);
    expect(tables).toEqual(original);
  });

  it("handles three or more groups", () => {
    const tables = [
      makeTable("users", "services/auth/migrations/001.sql"),
      makeTable("projects", "services/project/migrations/001.sql"),
      makeTable("events", "services/events/migrations/001.sql"),
    ];
    const result = assignDatabaseGroups(tables);
    expect(result).toHaveLength(3);
    expect(result[0]!.databaseGroup).toBe("auth");
    expect(result[1]!.databaseGroup).toBe("project");
    expect(result[2]!.databaseGroup).toBe("events");
  });
});
