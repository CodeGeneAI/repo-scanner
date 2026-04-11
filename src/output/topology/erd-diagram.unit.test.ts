import { describe, expect, it } from "bun:test";
import type {
  ColumnInfo,
  DatabaseSchema,
  RelationshipInfo,
  TableInfo,
} from "../../detectors/db-schema/types";
import type { RepoScanResult } from "../../types";
import { generateErdDiagram } from "./erd-diagram";

const makeSource = (file = "schema.sql") =>
  ({ file, parser: "sql" as const, confidence: 0.95 }) as const;

const makeColumn = (
  name: string,
  type: string,
  opts: Partial<ColumnInfo> = {},
): ColumnInfo => ({
  name,
  type,
  ...opts,
});

const makeTable = (
  name: string,
  columns: ColumnInfo[],
  primaryKey?: string[],
  opts?: { sourceFile?: string; databaseGroup?: string },
): TableInfo => ({
  name,
  columns,
  primaryKey,
  source: makeSource(opts?.sourceFile),
  ...(opts?.databaseGroup ? { databaseGroup: opts.databaseGroup } : {}),
});

const makeRelationship = (
  fromTable: string,
  fromColumn: string,
  toTable: string,
  toColumn: string,
  type: RelationshipInfo["type"] = "one-to-many",
): RelationshipInfo => ({
  from: { table: fromTable, column: fromColumn },
  to: { table: toTable, column: toColumn },
  type,
  source: makeSource(),
});

const makeSchema = (
  tables: TableInfo[],
  relationships: RelationshipInfo[] = [],
): DatabaseSchema => ({
  tables,
  relationships,
  summary: {
    totalTables: tables.length,
    totalColumns: tables.reduce((sum, t) => sum + t.columns.length, 0),
    totalRelationships: relationships.length,
  },
});

const makeResult = (schema?: DatabaseSchema): RepoScanResult =>
  ({
    architecture: { monorepo: false, components: [] },
    inventory: { databaseSchema: schema },
    buildAndTest: {},
    signals: {},
    scanPath: "/tmp/test",
    timestamp: new Date().toISOString(),
    durationMs: 0,
  }) as unknown as RepoScanResult;

/** Helper to get the first (or only) diagram from the result. */
const firstDiagram = (result: RepoScanResult) => {
  const diagrams = generateErdDiagram(result);
  return diagrams ? diagrams[0]! : null;
};

describe("generateErdDiagram", () => {
  // --- Null / empty cases ---

  it("returns null when databaseSchema is undefined", () => {
    const result = makeResult(undefined);
    expect(generateErdDiagram(result)).toBeNull();
  });

  it("returns null when tables array is empty", () => {
    const schema = makeSchema([]);
    expect(generateErdDiagram(makeResult(schema))).toBeNull();
  });

  // --- Entity block rendering ---

  it("output starts with erDiagram", () => {
    const schema = makeSchema([
      makeTable("users", [makeColumn("id", "int", { isPrimaryKey: true })]),
    ]);
    const diagram = firstDiagram(makeResult(schema));
    expect(diagram).not.toBeNull();
    expect(diagram!.mermaid).toMatch(/^erDiagram/);
  });

  it("renders a table with columns as an entity block", () => {
    const schema = makeSchema([
      makeTable("users", [
        makeColumn("id", "int", { isPrimaryKey: true }),
        makeColumn("email", "varchar"),
      ]),
    ]);
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("users {");
    expect(diagram.mermaid).toContain("int id PK");
    expect(diagram.mermaid).toContain("varchar email");
    expect(diagram.mermaid).toContain("}");
  });

  it("marks PK and FK columns", () => {
    const schema = makeSchema([
      makeTable("orders", [
        makeColumn("id", "int", { isPrimaryKey: true }),
        makeColumn("user_id", "int", {
          isForeignKey: true,
          references: { table: "users", column: "id" },
        }),
        makeColumn("total", "decimal"),
      ]),
    ]);
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("int id PK");
    expect(diagram.mermaid).toContain("int user_id FK");
    expect(diagram.mermaid).not.toMatch(/decimal total (PK|FK)/);
  });

  it("sanitizes table names with hyphens and dots", () => {
    const schema = makeSchema([
      makeTable("user-profiles", [makeColumn("id", "int")]),
      makeTable("auth.tokens", [makeColumn("id", "int")]),
    ]);
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("user_profiles {");
    expect(diagram.mermaid).toContain("auth_tokens {");
    expect(diagram.mermaid).not.toContain("user-profiles");
    expect(diagram.mermaid).not.toContain("auth.tokens");
  });

  it("sanitizes column types with spaces", () => {
    const schema = makeSchema([
      makeTable("users", [
        makeColumn("name", "character varying"),
        makeColumn("balance", "double precision"),
      ]),
    ]);
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("character_varying name");
    expect(diagram.mermaid).toContain("double_precision balance");
  });

  it("prefixes table names starting with a digit", () => {
    const schema = makeSchema([
      makeTable("2fa_tokens", [makeColumn("id", "int")]),
    ]);
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("_2fa_tokens {");
  });

  it("preserves precision and timezone details in sanitized column types", () => {
    const schema = makeSchema([
      makeTable("users", [
        makeColumn("name", "VARCHAR(255)"),
        makeColumn("balance", "NUMERIC(10,2)"),
        makeColumn("flag", "VARCHAR (50)"),
        makeColumn("created_at", "TIMESTAMP WITH TIME ZONE"),
      ]),
    ]);
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("VARCHAR_255 name");
    expect(diagram.mermaid).toContain("NUMERIC_10_2 balance");
    expect(diagram.mermaid).toContain("VARCHAR_50 flag");
    expect(diagram.mermaid).toContain("TIMESTAMP_WITH_TIME_ZONE created_at");
    expect(diagram.mermaid).not.toContain("(");
  });

  it("defaults to unknown for empty column type", () => {
    const schema = makeSchema([makeTable("users", [makeColumn("id", "")])]);
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("unknown id");
  });

  it("handles column that is both PK and FK (PK wins)", () => {
    const schema = makeSchema([
      makeTable("user_roles", [
        makeColumn("user_id", "int", {
          isPrimaryKey: true,
          isForeignKey: true,
        }),
      ]),
    ]);
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("int user_id PK");
    expect(diagram.mermaid).not.toContain("FK");
  });

  it("handles table names that are entirely special characters", () => {
    const schema = makeSchema([makeTable("@#$%", [makeColumn("id", "int")])]);
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("unknown {");
  });

  it("returns correct kind and title", () => {
    const schema = makeSchema([makeTable("users", [makeColumn("id", "int")])]);
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.kind).toBe("erd");
    expect(diagram.title).toBe("Entity-Relationship Diagram");
  });

  // --- Relationship rendering ---

  it("renders one-to-many relationship", () => {
    const schema = makeSchema(
      [
        makeTable("users", [makeColumn("id", "int", { isPrimaryKey: true })]),
        makeTable("orders", [
          makeColumn("id", "int", { isPrimaryKey: true }),
          makeColumn("user_id", "int", { isForeignKey: true }),
        ]),
      ],
      [makeRelationship("users", "id", "orders", "user_id", "one-to-many")],
    );
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("users ||--o{ orders");
  });

  it("renders one-to-one relationship", () => {
    const schema = makeSchema(
      [
        makeTable("users", [makeColumn("id", "int", { isPrimaryKey: true })]),
        makeTable("profiles", [
          makeColumn("user_id", "int", { isPrimaryKey: true }),
        ]),
      ],
      [makeRelationship("users", "id", "profiles", "user_id", "one-to-one")],
    );
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("users ||--|| profiles");
  });

  it("renders many-to-many relationship", () => {
    const schema = makeSchema(
      [
        makeTable("students", [
          makeColumn("id", "int", { isPrimaryKey: true }),
        ]),
        makeTable("courses", [makeColumn("id", "int", { isPrimaryKey: true })]),
      ],
      [makeRelationship("students", "id", "courses", "id", "many-to-many")],
    );
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("students }o--o{ courses");
  });

  it("includes column name as relationship label", () => {
    const schema = makeSchema(
      [
        makeTable("users", [makeColumn("id", "int")]),
        makeTable("orders", [makeColumn("user_id", "int")]),
      ],
      [makeRelationship("users", "id", "orders", "user_id", "one-to-many")],
    );
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toMatch(/users \|\|--o\{ orders : "id"/);
  });

  it("skips relationships referencing tables not in the schema", () => {
    const schema = makeSchema(
      [makeTable("users", [makeColumn("id", "int")])],
      [
        makeRelationship(
          "users",
          "id",
          "ghost_table",
          "user_id",
          "one-to-many",
        ),
      ],
    );
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).not.toContain("ghost_table");
  });

  it("renders standalone tables alongside related tables", () => {
    const schema = makeSchema(
      [
        makeTable("users", [makeColumn("id", "int")]),
        makeTable("orders", [makeColumn("id", "int")]),
        makeTable("audit_log", [makeColumn("id", "int")]),
      ],
      [makeRelationship("users", "id", "orders", "user_id", "one-to-many")],
    );
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("users {");
    expect(diagram.mermaid).toContain("orders {");
    expect(diagram.mermaid).toContain("audit_log {");
    expect(diagram.mermaid).toContain("users ||--o{ orders");
  });

  it("produces a complete valid diagram with multiple tables and relationships", () => {
    const schema = makeSchema(
      [
        makeTable("users", [
          makeColumn("id", "int", { isPrimaryKey: true }),
          makeColumn("email", "varchar"),
        ]),
        makeTable("orders", [
          makeColumn("id", "int", { isPrimaryKey: true }),
          makeColumn("user_id", "int", { isForeignKey: true }),
          makeColumn("total", "decimal"),
        ]),
        makeTable("order_items", [
          makeColumn("id", "int", { isPrimaryKey: true }),
          makeColumn("order_id", "int", { isForeignKey: true }),
          makeColumn("product_id", "int", { isForeignKey: true }),
          makeColumn("quantity", "int"),
        ]),
        makeTable("products", [
          makeColumn("id", "int", { isPrimaryKey: true }),
          makeColumn("name", "varchar"),
          makeColumn("price", "decimal"),
        ]),
      ],
      [
        makeRelationship("users", "id", "orders", "user_id", "one-to-many"),
        makeRelationship(
          "orders",
          "id",
          "order_items",
          "order_id",
          "one-to-many",
        ),
        makeRelationship(
          "products",
          "id",
          "order_items",
          "product_id",
          "one-to-many",
        ),
      ],
    );
    const diagram = firstDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toMatch(/^erDiagram/);
    expect(diagram.mermaid).toContain("users {");
    expect(diagram.mermaid).toContain("orders {");
    expect(diagram.mermaid).toContain("order_items {");
    expect(diagram.mermaid).toContain("products {");
    expect(diagram.mermaid).toContain("users ||--o{ orders");
    expect(diagram.mermaid).toContain("orders ||--o{ order_items");
    expect(diagram.mermaid).toContain("products ||--o{ order_items");
  });

  // --- Return type ---

  it("returns an array with one diagram for single-group tables", () => {
    const schema = makeSchema([makeTable("users", [makeColumn("id", "int")])]);
    const diagrams = generateErdDiagram(makeResult(schema))!;
    expect(Array.isArray(diagrams)).toBe(true);
    expect(diagrams).toHaveLength(1);
  });

  // --- Multi-database group tests ---

  describe("multi-database groups", () => {
    it("produces separate diagrams for tables in different database groups", () => {
      const schema = makeSchema([
        makeTable("users", [makeColumn("id", "int")], undefined, {
          databaseGroup: "auth",
        }),
        makeTable("roles", [makeColumn("id", "int")], undefined, {
          databaseGroup: "auth",
        }),
        makeTable("projects", [makeColumn("id", "int")], undefined, {
          databaseGroup: "project",
        }),
      ]);
      const diagrams = generateErdDiagram(makeResult(schema))!;
      expect(diagrams).toHaveLength(3);

      const authDiagram = diagrams.find((d) => d.title.includes("(auth)"))!;
      const projectDiagram = diagrams.find((d) =>
        d.title.includes("(project)"),
      )!;

      expect(authDiagram).toBeDefined();
      expect(projectDiagram).toBeDefined();

      expect(authDiagram.mermaid).toContain("users {");
      expect(authDiagram.mermaid).toContain("roles {");
      expect(authDiagram.mermaid).not.toContain("projects {");

      expect(projectDiagram.mermaid).toContain("projects {");
      expect(projectDiagram.mermaid).not.toContain("users {");
    });

    it("includes group name in diagram title", () => {
      const schema = makeSchema([
        makeTable("users", [makeColumn("id", "int")], undefined, {
          databaseGroup: "auth",
        }),
        makeTable("projects", [makeColumn("id", "int")], undefined, {
          databaseGroup: "pm",
        }),
      ]);
      const diagrams = generateErdDiagram(makeResult(schema))!;
      expect(diagrams[0]!.title).toBe("Entity-Relationship Diagram");
      expect(diagrams[1]!.title).toBe("Entity-Relationship Diagram (auth)");
      expect(diagrams[2]!.title).toBe("Entity-Relationship Diagram (pm)");
    });

    it("all diagrams have kind erd", () => {
      const schema = makeSchema([
        makeTable("users", [makeColumn("id", "int")], undefined, {
          databaseGroup: "auth",
        }),
        makeTable("projects", [makeColumn("id", "int")], undefined, {
          databaseGroup: "pm",
        }),
      ]);
      const diagrams = generateErdDiagram(makeResult(schema))!;
      for (const d of diagrams) {
        expect(d.kind).toBe("erd");
      }
    });

    it("includes cross-group relationships with stub entities", () => {
      const schema = makeSchema(
        [
          makeTable(
            "users",
            [makeColumn("id", "int", { isPrimaryKey: true })],
            undefined,
            { databaseGroup: "auth" },
          ),
          makeTable(
            "projects",
            [
              makeColumn("id", "int", { isPrimaryKey: true }),
              makeColumn("owner_id", "int", { isForeignKey: true }),
            ],
            undefined,
            { databaseGroup: "pm" },
          ),
        ],
        [
          makeRelationship(
            "users",
            "id",
            "projects",
            "owner_id",
            "one-to-many",
          ),
        ],
      );
      const diagrams = generateErdDiagram(makeResult(schema))!;

      const authDiagram = diagrams.find((d) => d.title.includes("(auth)"))!;
      const pmDiagram = diagrams.find((d) => d.title.includes("(pm)"))!;

      // Auth diagram should have the relationship and projects as a stub
      expect(authDiagram.mermaid).toContain("users ||--o{ projects");
      expect(authDiagram.mermaid).toContain("projects {");
      // Stub entity should have no columns (just opening and closing braces)
      const projectsBlock = authDiagram.mermaid
        .split("projects {")[1]!
        .split("}")[0]!;
      expect(projectsBlock.trim()).toBe("");

      // PM diagram should have the relationship and users as a stub
      expect(pmDiagram.mermaid).toContain("users ||--o{ projects");
      expect(pmDiagram.mermaid).toContain("users {");
      const usersBlock = pmDiagram.mermaid.split("users {")[1]!.split("}")[0]!;
      expect(usersBlock.trim()).toBe("");
    });

    it("renders intra-group relationships normally", () => {
      const schema = makeSchema(
        [
          makeTable(
            "users",
            [makeColumn("id", "int", { isPrimaryKey: true })],
            undefined,
            { databaseGroup: "auth" },
          ),
          makeTable(
            "roles",
            [
              makeColumn("id", "int", { isPrimaryKey: true }),
              makeColumn("user_id", "int", { isForeignKey: true }),
            ],
            undefined,
            { databaseGroup: "auth" },
          ),
          makeTable(
            "projects",
            [makeColumn("id", "int", { isPrimaryKey: true })],
            undefined,
            { databaseGroup: "pm" },
          ),
        ],
        [makeRelationship("users", "id", "roles", "user_id", "one-to-many")],
      );
      const diagrams = generateErdDiagram(makeResult(schema))!;
      const authDiagram = diagrams.find((d) => d.title.includes("(auth)"))!;

      expect(authDiagram.mermaid).toContain("users ||--o{ roles");
      // Roles should have its columns (not a stub)
      expect(authDiagram.mermaid).toContain("int user_id FK");
    });

    it("produces single diagram when all tables have the same databaseGroup", () => {
      const schema = makeSchema([
        makeTable("users", [makeColumn("id", "int")], undefined, {
          databaseGroup: "auth",
        }),
        makeTable("roles", [makeColumn("id", "int")], undefined, {
          databaseGroup: "auth",
        }),
      ]);
      const diagrams = generateErdDiagram(makeResult(schema))!;
      expect(diagrams).toHaveLength(1);
      expect(diagrams[0]!.title).toBe("Entity-Relationship Diagram");
    });

    it("handles three or more database groups", () => {
      const schema = makeSchema([
        makeTable("users", [makeColumn("id", "int")], undefined, {
          databaseGroup: "auth",
        }),
        makeTable("projects", [makeColumn("id", "int")], undefined, {
          databaseGroup: "pm",
        }),
        makeTable("events", [makeColumn("id", "int")], undefined, {
          databaseGroup: "events",
        }),
      ]);
      const diagrams = generateErdDiagram(makeResult(schema))!;
      expect(diagrams).toHaveLength(4);
      expect(diagrams.map((d) => d.title)).toEqual([
        "Entity-Relationship Diagram",
        "Entity-Relationship Diagram (auth)",
        "Entity-Relationship Diagram (pm)",
        "Entity-Relationship Diagram (events)",
      ]);
    });

    it("renders stub entity in multiple groups when table has cross-group relationships", () => {
      const schema = makeSchema(
        [
          makeTable(
            "users",
            [makeColumn("id", "int", { isPrimaryKey: true })],
            undefined,
            { databaseGroup: "auth" },
          ),
          makeTable(
            "projects",
            [makeColumn("owner_id", "int", { isForeignKey: true })],
            undefined,
            { databaseGroup: "pm" },
          ),
          makeTable(
            "audit_log",
            [makeColumn("actor_id", "int", { isForeignKey: true })],
            undefined,
            { databaseGroup: "audit" },
          ),
        ],
        [
          makeRelationship(
            "users",
            "id",
            "projects",
            "owner_id",
            "one-to-many",
          ),
          makeRelationship(
            "users",
            "id",
            "audit_log",
            "actor_id",
            "one-to-many",
          ),
        ],
      );
      const diagrams = generateErdDiagram(makeResult(schema))!;

      // Users table should appear as stub in both pm and audit diagrams
      const pmDiagram = diagrams.find((d) => d.title.includes("(pm)"))!;
      const auditDiagram = diagrams.find((d) => d.title.includes("(audit)"))!;

      expect(pmDiagram.mermaid).toContain("users {");
      expect(auditDiagram.mermaid).toContain("users {");
    });

    it("includes combined diagram with all tables when multiple groups exist", () => {
      const schema = makeSchema(
        [
          makeTable(
            "users",
            [makeColumn("id", "int", { isPrimaryKey: true })],
            undefined,
            { databaseGroup: "auth" },
          ),
          makeTable(
            "projects",
            [
              makeColumn("id", "int", { isPrimaryKey: true }),
              makeColumn("owner_id", "int", { isForeignKey: true }),
            ],
            undefined,
            { databaseGroup: "pm" },
          ),
        ],
        [
          makeRelationship(
            "users",
            "id",
            "projects",
            "owner_id",
            "one-to-many",
          ),
        ],
      );
      const diagrams = generateErdDiagram(makeResult(schema))!;
      const combined = diagrams[0]!;

      expect(combined.title).toBe("Entity-Relationship Diagram");
      expect(combined.kind).toBe("erd");
      // Contains all tables with full columns
      expect(combined.mermaid).toContain("users {");
      expect(combined.mermaid).toContain("int id PK");
      expect(combined.mermaid).toContain("projects {");
      expect(combined.mermaid).toContain("int owner_id FK");
      // Contains cross-group relationships
      expect(combined.mermaid).toContain("users ||--o{ projects");
      // Combined diagram has no stub entities (all tables rendered with columns)
      const usersBlock = combined.mermaid.split("users {")[1]!.split("}")[0]!;
      expect(usersBlock.trim()).not.toBe("");
      const projectsBlock = combined.mermaid
        .split("projects {")[1]!
        .split("}")[0]!;
      expect(projectsBlock.trim()).not.toBe("");
    });

    it("combined diagram includes all tables when groups have no relationships", () => {
      const schema = makeSchema([
        makeTable("users", [makeColumn("id", "int")], undefined, {
          databaseGroup: "auth",
        }),
        makeTable("roles", [makeColumn("id", "int")], undefined, {
          databaseGroup: "auth",
        }),
        makeTable("projects", [makeColumn("id", "int")], undefined, {
          databaseGroup: "project",
        }),
      ]);
      const diagrams = generateErdDiagram(makeResult(schema))!;
      const combined = diagrams[0]!;

      expect(combined.title).toBe("Entity-Relationship Diagram");
      expect(combined.mermaid).toContain("users {");
      expect(combined.mermaid).toContain("roles {");
      expect(combined.mermaid).toContain("projects {");
      // No relationship lines
      expect(combined.mermaid).not.toContain("||--");
      expect(combined.mermaid).not.toContain("}o--o{");
    });

    it("combined diagram includes intra-group-only relationships", () => {
      const schema = makeSchema(
        [
          makeTable(
            "users",
            [makeColumn("id", "int", { isPrimaryKey: true })],
            undefined,
            { databaseGroup: "auth" },
          ),
          makeTable(
            "roles",
            [
              makeColumn("id", "int", { isPrimaryKey: true }),
              makeColumn("user_id", "int", { isForeignKey: true }),
            ],
            undefined,
            { databaseGroup: "auth" },
          ),
          makeTable(
            "projects",
            [makeColumn("id", "int", { isPrimaryKey: true })],
            undefined,
            { databaseGroup: "pm" },
          ),
        ],
        [makeRelationship("users", "id", "roles", "user_id", "one-to-many")],
      );
      const diagrams = generateErdDiagram(makeResult(schema))!;
      const combined = diagrams[0]!;

      expect(combined.title).toBe("Entity-Relationship Diagram");
      // All tables present with columns
      expect(combined.mermaid).toContain("users {");
      expect(combined.mermaid).toContain("roles {");
      expect(combined.mermaid).toContain("projects {");
      // Intra-group relationship included in combined diagram
      expect(combined.mermaid).toContain("users ||--o{ roles");
    });

    it("skips relationships where neither table is in the current group", () => {
      const schema = makeSchema(
        [
          makeTable("users", [makeColumn("id", "int")], undefined, {
            databaseGroup: "auth",
          }),
          makeTable("projects", [makeColumn("id", "int")], undefined, {
            databaseGroup: "pm",
          }),
          makeTable("events", [makeColumn("id", "int")], undefined, {
            databaseGroup: "events",
          }),
        ],
        [
          makeRelationship(
            "users",
            "id",
            "projects",
            "owner_id",
            "one-to-many",
          ),
        ],
      );
      const diagrams = generateErdDiagram(makeResult(schema))!;
      const eventsDiagram = diagrams.find((d) => d.title.includes("(events)"))!;

      // Events diagram should not contain the users->projects relationship
      expect(eventsDiagram.mermaid).not.toContain("users");
      expect(eventsDiagram.mermaid).not.toContain("projects");
    });

    it("combined diagram skips relationships referencing unknown tables", () => {
      const schema = makeSchema(
        [
          makeTable("users", [makeColumn("id", "int")], undefined, {
            databaseGroup: "auth",
          }),
          makeTable("projects", [makeColumn("id", "int")], undefined, {
            databaseGroup: "pm",
          }),
        ],
        [
          makeRelationship(
            "users",
            "id",
            "ghost_table",
            "user_id",
            "one-to-many",
          ),
        ],
      );
      const diagrams = generateErdDiagram(makeResult(schema))!;
      const combined = diagrams[0]!;

      expect(combined.mermaid).toContain("users {");
      expect(combined.mermaid).toContain("projects {");
      expect(combined.mermaid).not.toContain("ghost_table");
    });

    it("handles mixed undefined and defined databaseGroup", () => {
      const schema = makeSchema([
        makeTable("users", [makeColumn("id", "int")], undefined, {
          databaseGroup: "auth",
        }),
        makeTable("config", [makeColumn("id", "int")]),
      ]);
      const diagrams = generateErdDiagram(makeResult(schema))!;
      expect(diagrams).toHaveLength(3);
      // First diagram is the combined ERD
      expect(diagrams[0]!.title).toBe("Entity-Relationship Diagram");
      // Undefined group should get "default" in title
      const defaultDiagram = diagrams.find((d) =>
        d.title.includes("(default)"),
      );
      expect(defaultDiagram).toBeDefined();
    });
  });
});
