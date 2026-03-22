/** Where a schema element was discovered. */
export interface SchemaSource {
  readonly file: string;
  readonly line?: number;
  readonly parser:
    | "sql"
    | "prisma"
    | "django"
    | "sqlalchemy"
    | "typeorm"
    | "drizzle";
  readonly confidence: number;
}

/** A single column in a database table. */
export interface ColumnInfo {
  readonly name: string;
  readonly type: string;
  readonly nullable?: boolean;
  readonly defaultValue?: string;
  readonly isPrimaryKey?: boolean;
  readonly isForeignKey?: boolean;
  readonly references?: {
    readonly table: string;
    readonly column: string;
  };
}

/** A database table with its columns and source. */
export interface TableInfo {
  readonly name: string;
  readonly columns: readonly ColumnInfo[];
  readonly primaryKey?: readonly string[];
  readonly source: SchemaSource;
  readonly databaseGroup?: string;
}

/** A relationship between two tables. */
export interface RelationshipInfo {
  readonly from: { readonly table: string; readonly column: string };
  readonly to: { readonly table: string; readonly column: string };
  readonly type: "one-to-one" | "one-to-many" | "many-to-many";
  readonly source: SchemaSource;
}

/** Full database schema extracted from a repository. */
export interface DatabaseSchema {
  readonly tables: readonly TableInfo[];
  readonly relationships: readonly RelationshipInfo[];
  readonly summary: {
    readonly totalTables: number;
    readonly totalColumns: number;
    readonly totalRelationships: number;
  };
}

/** A table or column that was dropped by a migration. */
export interface DroppedItem {
  readonly table: string;
  readonly column?: string;
}

/** Result returned by each individual parser. */
export interface SchemaParserResult {
  readonly tables: TableInfo[];
  readonly relationships: RelationshipInfo[];
  readonly dropped?: DroppedItem[];
}
