import type { FileIndex } from "../../../utils/file-index";
import {
  CONFIDENCE,
  collectParserResults,
  splitAtTopLevel,
} from "../parse-utils";
import type {
  ColumnInfo,
  DroppedItem,
  RelationshipInfo,
  SchemaParserResult,
  TableInfo,
} from "../types";

/** Paths that indicate SQL migration/schema files. */
const MIGRATION_PATH_PATTERNS = [
  /migrations\//i,
  /db\/migrate\//i,
  /db\//i,
  /schema\//i,
  /sql\//i,
  /database\//i,
];

/** Strip surrounding quotes (double quotes or backticks) from an identifier. */
const unquote = (id: string): string => id.replace(/^["'`]|["'`]$/g, "");

/** Strip schema prefix (e.g. public.users → users). */
const stripSchemaPrefix = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : name;
};

/** Parse a SQL column type, preserving array suffix and precision. */
const parseColumnType = (raw: string): string => {
  const trimmed = raw.trim();
  // Preserve array suffix [] while uppercasing the base type
  const arrayMatch = trimmed.match(/^(.+?)(\[\])$/);
  if (arrayMatch) {
    return `${arrayMatch[1]!.toUpperCase()}[]`;
  }
  return trimmed.toUpperCase();
};

/**
 * Parse a single SQL content string and extract tables, columns, and relationships.
 * Exported for unit testing.
 */
export const parseSql = (
  content: string,
  filePath: string,
): SchemaParserResult => {
  const tables: TableInfo[] = [];
  const relationships: RelationshipInfo[] = [];
  const tableMap = new Map<
    string,
    { columns: ColumnInfo[]; primaryKey: string[] }
  >();

  // Parse CREATE TABLE statements
  const createTableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*\(([\s\S]*?)\);/gi;

  let match: RegExpExecArray | null;
  while ((match = createTableRegex.exec(content)) !== null) {
    const rawTableName = unquote(stripSchemaPrefix(match[1]!.trim()));
    const body = match[2]!;
    const columns: ColumnInfo[] = [];
    const primaryKey: string[] = [];

    // Split body by commas, but respect parenthesized expressions
    const lines = splitColumnDefs(body);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for PRIMARY KEY clause
      const pkClause = trimmed.match(/^PRIMARY\s+KEY\s*\(\s*([^)]+)\s*\)/i);
      if (pkClause) {
        const pkCols = pkClause[1]!.split(",").map((c) => unquote(c.trim()));
        primaryKey.push(...pkCols);
        continue;
      }

      // Check for FOREIGN KEY clause
      const fkClause = trimmed.match(
        /^(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(\s*([^)]+)\s*\)\s*REFERENCES\s+([^\s(]+)\s*\(\s*([^)]+)\s*\)/i,
      );
      if (fkClause) {
        const localCol = unquote(fkClause[1]!.trim());
        const refTable = unquote(stripSchemaPrefix(fkClause[2]!.trim()));
        const refCol = unquote(fkClause[3]!.trim());

        // Mark the column as FK
        const existing = columns.find((c) => c.name === localCol);
        if (existing) {
          const idx = columns.indexOf(existing);
          columns[idx] = {
            ...existing,
            isForeignKey: true,
            references: { table: refTable, column: refCol },
          };
        }

        relationships.push({
          from: { table: rawTableName, column: localCol },
          to: { table: refTable, column: refCol },
          type: "one-to-many",
          source: { file: filePath, parser: "sql", confidence: CONFIDENCE.sql },
        });
        continue;
      }

      // Check for UNIQUE, CHECK, or other constraint clauses — skip them
      if (/^(?:UNIQUE|CHECK|CONSTRAINT|EXCLUDE)\s/i.test(trimmed)) {
        continue;
      }

      // Parse as column definition
      const col = parseColumnDef(trimmed, rawTableName, filePath);
      if (col) {
        columns.push(col.column);
        if (col.column.isPrimaryKey) {
          primaryKey.push(col.column.name);
        }
        if (col.relationship) {
          relationships.push(col.relationship);
        }
      }
    }

    // Mark primary key columns
    if (primaryKey.length > 0) {
      for (let i = 0; i < columns.length; i++) {
        if (primaryKey.includes(columns[i]!.name)) {
          columns[i] = { ...columns[i]!, isPrimaryKey: true };
        }
      }
    }

    tableMap.set(rawTableName, { columns, primaryKey });
    tables.push({
      name: rawTableName,
      columns,
      primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
      source: { file: filePath, parser: "sql", confidence: CONFIDENCE.sql },
    });
  }

  // Parse ALTER TABLE ADD [COLUMN] (COLUMN keyword is optional in PostgreSQL)
  // Negative lookahead excludes ADD CONSTRAINT / ADD PRIMARY / ADD UNIQUE / ADD FOREIGN / ADD CHECK
  const alterAddColRegex =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s]+)\s+ADD\s+(?:COLUMN\s+)?(?!CONSTRAINT\b|PRIMARY\b|UNIQUE\b|FOREIGN\b|CHECK\b|EXCLUDE\b)([^\s(]+)\s+([^;]+);/gi;
  while ((match = alterAddColRegex.exec(content)) !== null) {
    const tableName = unquote(stripSchemaPrefix(match[1]!.trim()));
    const colName = unquote(match[2]!.trim());
    const rest = match[3]!.trim();

    const existing = tableMap.get(tableName);
    if (existing) {
      const col = parseColumnDefFromParts(colName, rest, tableName, filePath);
      if (col) {
        existing.columns.push(col.column);
        if (col.relationship) {
          relationships.push(col.relationship);
        }
        // Update the table in the tables array
        const tableIdx = tables.findIndex((t) => t.name === tableName);
        if (tableIdx >= 0) {
          tables[tableIdx] = {
            ...tables[tableIdx]!,
            columns: existing.columns,
          };
        }
      }
    }
  }

  // Parse ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY
  const alterFkRegex =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s]+)\s+ADD\s+CONSTRAINT\s+\S+\s+FOREIGN\s+KEY\s*\(\s*([^)]+)\s*\)\s*REFERENCES\s+([^\s(]+)\s*\(\s*([^)]+)\s*\)/gi;
  while ((match = alterFkRegex.exec(content)) !== null) {
    const tableName = unquote(stripSchemaPrefix(match[1]!.trim()));
    const localCol = unquote(match[2]!.trim());
    const refTable = unquote(stripSchemaPrefix(match[3]!.trim()));
    const refCol = unquote(match[4]!.trim());

    // Mark column as FK
    const existing = tableMap.get(tableName);
    if (existing) {
      const colIdx = existing.columns.findIndex((c) => c.name === localCol);
      if (colIdx >= 0) {
        existing.columns[colIdx] = {
          ...existing.columns[colIdx]!,
          isForeignKey: true,
          references: { table: refTable, column: refCol },
        };
        const tableIdx = tables.findIndex((t) => t.name === tableName);
        if (tableIdx >= 0) {
          tables[tableIdx] = {
            ...tables[tableIdx]!,
            columns: existing.columns,
          };
        }
      }
    }

    relationships.push({
      from: { table: tableName, column: localCol },
      to: { table: refTable, column: refCol },
      type: "one-to-many",
      source: { file: filePath, parser: "sql", confidence: CONFIDENCE.sql },
    });
  }

  // Parse ALTER TABLE ADD CONSTRAINT ... PRIMARY KEY (standard pg_dump format)
  const alterPkRegex =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?([^\s]+)\s+ADD\s+CONSTRAINT\s+\S+\s+PRIMARY\s+KEY\s*\(\s*([^)]+)\s*\)/gi;
  while ((match = alterPkRegex.exec(content)) !== null) {
    const tableName = unquote(stripSchemaPrefix(match[1]!.trim()));
    const pkCols = match[2]!.split(",").map((c) => unquote(c.trim()));

    const existing = tableMap.get(tableName);
    if (existing) {
      existing.primaryKey.push(
        ...pkCols.filter((c) => !existing.primaryKey.includes(c)),
      );

      // Mark columns as PK
      for (const pkCol of pkCols) {
        const colIdx = existing.columns.findIndex((c) => c.name === pkCol);
        if (colIdx >= 0) {
          existing.columns[colIdx] = {
            ...existing.columns[colIdx]!,
            isPrimaryKey: true,
          };
        }
      }

      // Update table in the tables array
      const tableIdx = tables.findIndex((t) => t.name === tableName);
      if (tableIdx >= 0) {
        tables[tableIdx] = {
          ...tables[tableIdx]!,
          columns: existing.columns,
          primaryKey:
            existing.primaryKey.length > 0 ? existing.primaryKey : undefined,
        };
      }
    }
  }

  // Parse DROP TABLE statements
  const dropped: DroppedItem[] = [];
  const dropTableRegex =
    /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s;,]+?)(?:\s+CASCADE)?(?:\s*;)/gi;
  while ((match = dropTableRegex.exec(content)) !== null) {
    const tableName = unquote(stripSchemaPrefix(match[1]!.trim()));
    dropped.push({ table: tableName });
  }

  // Parse ALTER TABLE DROP COLUMN statements (handles ONLY keyword and multi-column drops)
  const alterDropColRegex =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?([^\s]+)\s+((?:DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?[^\s;,]+[\s,]*)+)/gi;
  while ((match = alterDropColRegex.exec(content)) !== null) {
    const tableName = unquote(stripSchemaPrefix(match[1]!.trim()));
    const body = match[2]!;
    // Extract each DROP COLUMN clause from the body
    const colDropRegex = /DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?([^\s;,]+)/gi;
    let colMatch: RegExpExecArray | null;
    while ((colMatch = colDropRegex.exec(body)) !== null) {
      // Skip DROP CONSTRAINT (not a column drop)
      if (/^CONSTRAINT$/i.test(colMatch[1]!.trim())) continue;
      const colName = unquote(colMatch[1]!.trim());
      dropped.push({ table: tableName, column: colName });
    }
  }

  return {
    tables,
    relationships,
    dropped: dropped.length > 0 ? dropped : undefined,
  };
};

/** Split column definitions by top-level commas, respecting parentheses. */
const splitColumnDefs = (body: string): string[] =>
  splitAtTopLevel(body, ",", "(", ")");

/** Parse a single column definition line. */
const parseColumnDef = (
  line: string,
  tableName: string,
  filePath: string,
): { column: ColumnInfo; relationship?: RelationshipInfo } | null => {
  // Match: column_name TYPE [constraints...]
  // Type can be dotted (public.owner_type), have parens (VARCHAR(255)), or array suffix ([])
  const colMatch = line.match(
    /^(["`]?[a-zA-Z_]\w*["`]?)\s+([\w.]+(?:\([^)]*\))?(?:\[\])?)(.*)/i,
  );
  if (!colMatch) return null;

  const name = unquote(colMatch[1]!.trim());
  const rawType = colMatch[2]!;
  // Strip schema prefix from type (public.owner_type → owner_type) but keep it
  const type = parseColumnType(
    rawType.includes(".") ? stripSchemaPrefix(rawType) : rawType,
  );
  const rest = colMatch[3]!;

  return parseColumnDefFromParts(name, `${type} ${rest}`, tableName, filePath);
};

/** Parse column info from name and the remaining definition text. */
const parseColumnDefFromParts = (
  name: string,
  rest: string,
  tableName: string,
  filePath: string,
): { column: ColumnInfo; relationship?: RelationshipInfo } | null => {
  // Extract type (possibly dotted like public.enum_name, with parens, or array suffix)
  const typeMatch = rest.match(/^([\w.]+(?:\([^)]*\))?(?:\[\])?)/i);
  if (!typeMatch) return null;

  const rawType = typeMatch[1]!;
  const type = parseColumnType(
    rawType.includes(".") ? stripSchemaPrefix(rawType) : rawType,
  );
  const constraints = rest.slice(typeMatch[0]!.length);

  const isPrimaryKey =
    /\bPRIMARY\s+KEY\b/i.test(constraints) ||
    /\bSERIAL\b/i.test(type) ||
    /\bBIGSERIAL\b/i.test(type);
  const isNotNull = /\bNOT\s+NULL\b/i.test(constraints) || isPrimaryKey;
  const nullable = !isNotNull;

  // Default value
  let defaultValue: string | undefined;
  const defaultMatch = constraints.match(/\bDEFAULT\s+(\S+(?:\([^)]*\))?)/i);
  if (defaultMatch) {
    defaultValue = defaultMatch[1]!.replace(/,$/, "");
  }

  // Inline REFERENCES
  let isForeignKey = false;
  let references: { table: string; column: string } | undefined;
  let relationship: RelationshipInfo | undefined;

  const refMatch = constraints.match(
    /\bREFERENCES\s+([^\s(]+)\s*\(\s*([^)]+)\s*\)/i,
  );
  if (refMatch) {
    const refTable = unquote(stripSchemaPrefix(refMatch[1]!.trim()));
    const refCol = unquote(refMatch[2]!.trim());
    isForeignKey = true;
    references = { table: refTable, column: refCol };
    relationship = {
      from: { table: tableName, column: name },
      to: { table: refTable, column: refCol },
      type: "one-to-many",
      source: { file: filePath, parser: "sql", confidence: CONFIDENCE.sql },
    };
  }

  return {
    column: {
      name,
      type,
      nullable,
      defaultValue,
      isPrimaryKey,
      isForeignKey,
      references,
    },
    relationship,
  };
};

/** Check if a file path looks like a migration or schema file. */
const isMigrationPath = (relativePath: string): boolean =>
  MIGRATION_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));

/**
 * Scan the file index for SQL migration files and parse them.
 */
export const parseSqlFiles = async (
  index: FileIndex,
): Promise<SchemaParserResult> => {
  const sqlFiles = index
    .getByExtension(".sql")
    .filter((f) => isMigrationPath(f.relativePath));
  return collectParserResults(sqlFiles, null, parseSql);
};
