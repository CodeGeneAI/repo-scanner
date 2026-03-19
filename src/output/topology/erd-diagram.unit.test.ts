import { describe, expect, it } from "vitest";
import type {
  ColumnInfo,
  DatabaseSchema,
  RelationshipInfo,
  TableInfo,
} from "../../detectors/db-schema/types";
import type { RepoScanResult } from "../../types";
import { generateErdDiagram } from "./erd-diagram";

const makeSource = () =>
  ({ file: "schema.sql", parser: "sql" as const, confidence: 0.95 }) as const;

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
): TableInfo => ({
  name,
  columns,
  primaryKey,
  source: makeSource(),
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
    const diagram = generateErdDiagram(makeResult(schema));
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
    const diagram = generateErdDiagram(makeResult(schema))!;
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
    const diagram = generateErdDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("int id PK");
    expect(diagram.mermaid).toContain("int user_id FK");
    expect(diagram.mermaid).not.toMatch(/decimal total (PK|FK)/);
  });

  it("sanitizes table names with hyphens and dots", () => {
    const schema = makeSchema([
      makeTable("user-profiles", [makeColumn("id", "int")]),
      makeTable("auth.tokens", [makeColumn("id", "int")]),
    ]);
    const diagram = generateErdDiagram(makeResult(schema))!;
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
    const diagram = generateErdDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("character_varying name");
    expect(diagram.mermaid).toContain("double_precision balance");
  });

  it("prefixes table names starting with a digit", () => {
    const schema = makeSchema([
      makeTable("2fa_tokens", [makeColumn("id", "int")]),
    ]);
    const diagram = generateErdDiagram(makeResult(schema))!;
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
    const diagram = generateErdDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("VARCHAR_255 name");
    expect(diagram.mermaid).toContain("NUMERIC_10_2 balance");
    expect(diagram.mermaid).toContain("VARCHAR_50 flag");
    expect(diagram.mermaid).toContain("TIMESTAMP_WITH_TIME_ZONE created_at");
    expect(diagram.mermaid).not.toContain("(");
  });

  it("defaults to unknown for empty column type", () => {
    const schema = makeSchema([makeTable("users", [makeColumn("id", "")])]);
    const diagram = generateErdDiagram(makeResult(schema))!;
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
    const diagram = generateErdDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("int user_id PK");
    expect(diagram.mermaid).not.toContain("FK");
  });

  it("handles table names that are entirely special characters", () => {
    const schema = makeSchema([makeTable("@#$%", [makeColumn("id", "int")])]);
    const diagram = generateErdDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toContain("unknown {");
  });

  it("returns correct kind and title", () => {
    const schema = makeSchema([makeTable("users", [makeColumn("id", "int")])]);
    const diagram = generateErdDiagram(makeResult(schema))!;
    expect(diagram.kind).toBe("erd");
    expect(diagram.title).toBe("Entity-Relationship Diagram");
  });

  // --- Relationship rendering (Inc 03) ---

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
    const diagram = generateErdDiagram(makeResult(schema))!;
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
    const diagram = generateErdDiagram(makeResult(schema))!;
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
    const diagram = generateErdDiagram(makeResult(schema))!;
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
    const diagram = generateErdDiagram(makeResult(schema))!;
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
    const diagram = generateErdDiagram(makeResult(schema))!;
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
    const diagram = generateErdDiagram(makeResult(schema))!;
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
    const diagram = generateErdDiagram(makeResult(schema))!;
    expect(diagram.mermaid).toMatch(/^erDiagram/);
    expect(diagram.mermaid).toContain("users {");
    expect(diagram.mermaid).toContain("orders {");
    expect(diagram.mermaid).toContain("order_items {");
    expect(diagram.mermaid).toContain("products {");
    expect(diagram.mermaid).toContain("users ||--o{ orders");
    expect(diagram.mermaid).toContain("orders ||--o{ order_items");
    expect(diagram.mermaid).toContain("products ||--o{ order_items");
  });
});
