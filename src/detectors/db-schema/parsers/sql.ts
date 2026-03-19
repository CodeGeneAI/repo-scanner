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

/** Parse comma-separated identifiers and normalize quoting/whitespace. */
const parseIdentifierList = (raw: string): string[] =>
  raw
    .split(",")
    .map((value) => unquote(value.trim()))
    .filter((value) => value.length > 0);

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

const CONSTRAINT_PREFIX_PATTERNS = [
  /^NOT\s+NULL\b/i,
  /^NULL\b/i,
  /^DEFAULT\b/i,
  /^PRIMARY\s+KEY\b/i,
  /^UNIQUE\b/i,
  /^CHECK\b/i,
  /^REFERENCES\b/i,
  /^CONSTRAINT\b/i,
  /^COLLATE\b/i,
  /^GENERATED\b/i,
  /^AUTO_INCREMENT\b/i,
  /^COMMENT\b/i,
];

/**
 * Split a raw SQL column tail into `type` and `constraints` while respecting
 * parenthesized expressions in type declarations.
 */
const splitTypeAndConstraints = (
  raw: string,
): { type: string; constraints: string } | null => {
  const input = raw.trim();
  if (!input) return null;

  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (char === "(") {
      depth++;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0 || char !== " ") {
      continue;
    }

    const remainder = input.slice(i + 1).trimStart();
    if (CONSTRAINT_PREFIX_PATTERNS.some((pattern) => pattern.test(remainder))) {
      return {
        type: input.slice(0, i).trim(),
        constraints: remainder,
      };
    }
  }

  return { type: input, constraints: "" };
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
  const source: TableInfo["source"] = {
    file: filePath,
    parser: "sql",
    confidence: CONFIDENCE.sql,
  };

  const upsertTableSnapshot = (
    tableName: string,
    state: { columns: ColumnInfo[]; primaryKey: string[] },
  ): void => {
    const tableIdx = tables.findIndex((table) => table.name === tableName);
    const snapshot: TableInfo = {
      name: tableName,
      columns: state.columns,
      primaryKey: state.primaryKey.length > 0 ? state.primaryKey : undefined,
      source,
    };
    if (tableIdx >= 0) {
      tables[tableIdx] = snapshot;
      return;
    }
    tables.push(snapshot);
  };

  const ensureTableState = (
    tableName: string,
  ): { columns: ColumnInfo[]; primaryKey: string[] } => {
    const existing = tableMap.get(tableName);
    if (existing) {
      return existing;
    }
    const created = { columns: [] as ColumnInfo[], primaryKey: [] as string[] };
    tableMap.set(tableName, created);
    upsertTableSnapshot(tableName, created);
    return created;
  };

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
      const pkClause = trimmed.match(
        /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(\s*([^)]+)\s*\)/i,
      );
      if (pkClause) {
        const pkCols = parseIdentifierList(pkClause[1]!);
        primaryKey.push(...pkCols);
        continue;
      }

      // Check for FOREIGN KEY clause
      const fkClause = trimmed.match(
        /^(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(\s*([^)]+)\s*\)\s*REFERENCES\s+([^\s(]+)\s*\(\s*([^)]+)\s*\)/i,
      );
      if (fkClause) {
        const localCols = parseIdentifierList(fkClause[1]!);
        const refTable = unquote(stripSchemaPrefix(fkClause[2]!.trim()));
        const refCols = parseIdentifierList(fkClause[3]!);

        for (let index = 0; index < localCols.length; index++) {
          const localCol = localCols[index]!;
          const refCol = refCols[index] ?? refCols[0];
          if (!refCol) continue;

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
            source: {
              file: filePath,
              parser: "sql",
              confidence: CONFIDENCE.sql,
            },
          });
        }
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

    const tableState = { columns, primaryKey };
    tableMap.set(rawTableName, tableState);
    upsertTableSnapshot(rawTableName, tableState);
  }

  // Parse ALTER TABLE mutations that affect column schema state.
  const alterTableMutationRegex =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?([^\s]+)\s+([\s\S]*?);/gi;
  while ((match = alterTableMutationRegex.exec(content)) !== null) {
    const tableName = unquote(stripSchemaPrefix(match[1]!.trim()));
    const body = match[2]!.trim();
    if (!body) continue;

    let state = tableMap.get(tableName);
    const clauses = splitAlterTableClauses(body);
    let changed = false;

    for (const rawClause of clauses) {
      const clause = rawClause.trim();
      if (!clause) continue;

      const addColumnMatch = clause.match(
        /^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s+([\s\S]+)$/i,
      );
      if (addColumnMatch) {
        const colName = unquote(addColumnMatch[1]!.trim());
        if (
          /^(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)$/i.test(colName)
        ) {
          continue;
        }

        state ??= ensureTableState(tableName);
        if (state.columns.some((column) => column.name === colName)) {
          continue;
        }

        const col = parseColumnDefFromParts(
          colName,
          addColumnMatch[2]!.trim(),
          tableName,
          filePath,
        );
        if (!col) {
          continue;
        }

        state.columns.push(col.column);
        changed = true;
        if (col.relationship) {
          relationships.push(col.relationship);
        }
        continue;
      }

      const alterTypeMatch = clause.match(
        /^ALTER\s+COLUMN\s+([^\s,]+)\s+TYPE\s+([\s\S]+)$/i,
      );
      if (!alterTypeMatch) {
        continue;
      }

      const colName = unquote(alterTypeMatch[1]!.trim());
      const rawType = alterTypeMatch[2]!
        .replace(/\s+USING\b[\s\S]*$/i, "")
        .trim();
      if (!rawType) {
        continue;
      }

      const nextType = parseColumnType(
        rawType.includes(".") ? stripSchemaPrefix(rawType) : rawType,
      );
      state ??= ensureTableState(tableName);
      const colIdx = state.columns.findIndex(
        (column) => column.name === colName,
      );

      if (colIdx >= 0) {
        state.columns[colIdx] = {
          ...state.columns[colIdx]!,
          type: nextType,
        };
      } else {
        state.columns.push({
          name: colName,
          type: nextType,
          nullable: true,
          isPrimaryKey: false,
          isForeignKey: false,
        });
      }
      changed = true;
    }

    if (changed && state) {
      upsertTableSnapshot(tableName, state);
    }
  }

  // Parse ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY
  const alterFkRegex =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?([^\s]+)\s+ADD\s+CONSTRAINT\s+\S+\s+FOREIGN\s+KEY\s*\(\s*([^)]+)\s*\)\s*REFERENCES\s+([^\s(]+)\s*\(\s*([^)]+)\s*\)/gi;
  while ((match = alterFkRegex.exec(content)) !== null) {
    const tableName = unquote(stripSchemaPrefix(match[1]!.trim()));
    const localCols = parseIdentifierList(match[2]!);
    const refTable = unquote(stripSchemaPrefix(match[3]!.trim()));
    const refCols = parseIdentifierList(match[4]!);

    const existing = tableMap.get(tableName);
    if (localCols.length === 0) {
      continue;
    }

    for (let index = 0; index < localCols.length; index++) {
      const localCol = localCols[index]!;
      const refCol = refCols[index] ?? refCols[0];
      if (!refCol) continue;

      if (existing) {
        const colIdx = existing.columns.findIndex((c) => c.name === localCol);
        if (colIdx >= 0) {
          existing.columns[colIdx] = {
            ...existing.columns[colIdx]!,
            isForeignKey: true,
            references: { table: refTable, column: refCol },
          };
        }
      }

      relationships.push({
        from: { table: tableName, column: localCol },
        to: { table: refTable, column: refCol },
        type: "one-to-many",
        source: {
          file: filePath,
          parser: "sql",
          confidence: CONFIDENCE.sql,
        },
      });
    }

    if (existing) {
      upsertTableSnapshot(tableName, existing);
    }
  }

  // Parse ALTER TABLE ADD CONSTRAINT ... PRIMARY KEY (standard pg_dump format)
  const alterPkRegex =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?([^\s]+)\s+ADD\s+CONSTRAINT\s+\S+\s+PRIMARY\s+KEY\s*\(\s*([^)]+)\s*\)/gi;
  while ((match = alterPkRegex.exec(content)) !== null) {
    const tableName = unquote(stripSchemaPrefix(match[1]!.trim()));
    const pkCols = match[2]!.split(",").map((c) => unquote(c.trim()));

    const existing = ensureTableState(tableName);
    existing.primaryKey.push(
      ...pkCols.filter((c) => !existing.primaryKey.includes(c)),
    );

    // Mark columns as PK when present in this file-state.
    for (const pkCol of pkCols) {
      const colIdx = existing.columns.findIndex((c) => c.name === pkCol);
      if (colIdx >= 0) {
        existing.columns[colIdx] = {
          ...existing.columns[colIdx]!,
          isPrimaryKey: true,
        };
      }
    }
    upsertTableSnapshot(tableName, existing);
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

/**
 * Split ALTER TABLE clause lists by top-level commas while preserving commas
 * inside quoted strings and balanced brackets.
 */
const splitAlterTableClauses = (body: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarQuoteTag: string | null = null;

  for (let i = 0; i < body.length; i++) {
    const char = body[i]!;
    const next = body[i + 1];

    if (dollarQuoteTag) {
      if (body.startsWith(dollarQuoteTag, i)) {
        current += dollarQuoteTag;
        i += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      } else {
        current += char;
      }
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        i += 1;
        continue;
      }
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }
    if (char === "$") {
      const tagMatch =
        body.slice(i).match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$/) ??
        body.slice(i).match(/^\$\$/);
      if (tagMatch) {
        dollarQuoteTag = tagMatch[0];
        current += dollarQuoteTag;
        i += dollarQuoteTag.length - 1;
        continue;
      }
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
};

/** Parse a single column definition line. */
const parseColumnDef = (
  line: string,
  tableName: string,
  filePath: string,
): { column: ColumnInfo; relationship?: RelationshipInfo } | null => {
  // Match: column_name <type and constraints...>
  const colMatch = line.match(/^(["`]?[a-zA-Z_]\w*["`]?)\s+(.+)$/i);
  if (!colMatch) return null;

  const name = unquote(colMatch[1]!.trim());
  return parseColumnDefFromParts(name, colMatch[2]!, tableName, filePath);
};

/** Parse column info from name and the remaining definition text. */
const parseColumnDefFromParts = (
  name: string,
  rest: string,
  tableName: string,
  filePath: string,
): { column: ColumnInfo; relationship?: RelationshipInfo } | null => {
  const parts = splitTypeAndConstraints(rest);
  if (!parts) return null;

  const rawType = parts.type;
  const type = parseColumnType(
    rawType.includes(".") ? stripSchemaPrefix(rawType) : rawType,
  );
  const constraints = parts.constraints;

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
    .filter((f) => isMigrationPath(f.relativePath))
    .slice()
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return collectParserResults(sqlFiles, null, parseSql);
};
