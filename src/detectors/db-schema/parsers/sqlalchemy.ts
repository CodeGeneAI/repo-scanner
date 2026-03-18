import type { FileIndex } from "../../../utils/file-index";
import {
  CONFIDENCE,
  collectParserResults,
  extractBalanced,
} from "../parse-utils";
import type {
  ColumnInfo,
  RelationshipInfo,
  SchemaParserResult,
  TableInfo,
} from "../types";

/** Map SQLAlchemy type names to SQL-like types. */
const SA_TYPE_MAP: ReadonlyMap<string, string> = new Map([
  ["Integer", "integer"],
  ["BigInteger", "bigint"],
  ["SmallInteger", "smallint"],
  ["String", "varchar"],
  ["Text", "text"],
  ["Boolean", "boolean"],
  ["Float", "float"],
  ["Numeric", "numeric"],
  ["DateTime", "timestamp"],
  ["Date", "date"],
  ["Time", "time"],
  ["LargeBinary", "bytea"],
  ["JSON", "jsonb"],
  ["ARRAY", "array"],
  ["UUID", "uuid"],
  ["Enum", "enum"],
  ["Interval", "interval"],
]);

/** Map Python Mapped type hints to SQL types. */
const MAPPED_TYPE_MAP: ReadonlyMap<string, string> = new Map([
  ["int", "integer"],
  ["str", "varchar"],
  ["float", "float"],
  ["bool", "boolean"],
  ["datetime", "timestamp"],
  ["date", "date"],
  ["bytes", "bytea"],
]);

/** Extract content between balanced parentheses starting after opening paren. */
const extractParenContent = (content: string, start: number): string =>
  extractBalanced(content, start, "(", ")");

/**
 * Parse SQLAlchemy declarative model definitions.
 * Exported for unit testing.
 */
export const parseSqlalchemy = (
  content: string,
  filePath: string,
): SchemaParserResult => {
  const tables: TableInfo[] = [];
  const relationships: RelationshipInfo[] = [];

  // Find classes with __tablename__
  const classRegex =
    /class\s+(\w+)\([^)]*\)\s*:([\s\S]*?)(?=\nclass\s|\n[^\s\n#]|$)/g;

  let classMatch: RegExpExecArray | null;
  while ((classMatch = classRegex.exec(content)) !== null) {
    const body = classMatch[2]!;

    // Must have __tablename__
    const tableNameMatch = body.match(/__tablename__\s*=\s*["']([^"']+)["']/);
    if (!tableNameMatch) continue;

    const tableName = tableNameMatch[1]!;
    const columns: ColumnInfo[] = [];
    const primaryKey: string[] = [];

    // Parse Column() / mapped_column() definitions — handle nested parens
    const colStartRegex =
      /^\s{4}(\w+)\s*(?::\s*\w+(?:\[[\w[\], ]*\])?\s*)?=\s*(?:Column|mapped_column)\(/gm;

    let colMatch: RegExpExecArray | null;
    while ((colMatch = colStartRegex.exec(body)) !== null) {
      const fieldName = colMatch[1]!;
      const argsStart = colMatch.index + colMatch[0].length;
      const args = extractParenContent(body, argsStart);

      const isPk = args.includes("primary_key=True");
      const isNullableFalse = args.includes("nullable=False");
      const nullable = isPk ? false : !isNullableFalse;

      // Extract type from first argument
      let colType = "varchar";
      const typeMatch = args.match(/^\s*(\w+)/);
      if (typeMatch) {
        const rawType = typeMatch[1]!;
        const mapped = SA_TYPE_MAP.get(rawType);
        if (mapped) {
          colType = mapped;
        } else if (rawType === "ForeignKey") {
          // Type comes from a second argument or infer from FK
          colType = "integer";
        } else if (rawType !== "primary_key") {
          colType = rawType.toLowerCase();
        }
      }

      // Check for Mapped[type] hint for mapped_column
      const fullLine = body.slice(colMatch.index, argsStart);
      const mappedHint = fullLine.match(/:\s*Mapped\[(\w+)\]/);
      if (mappedHint && colType === "varchar") {
        const hintType = MAPPED_TYPE_MAP.get(mappedHint[1]!);
        if (hintType) colType = hintType;
      }

      // Extract ForeignKey reference
      let isForeignKey = false;
      let references: { table: string; column: string } | undefined;
      const fkMatch = args.match(/ForeignKey\(\s*["']([^"']+)["']\s*\)/);
      if (fkMatch) {
        const parts = fkMatch[1]!.split(".");
        if (parts.length === 2) {
          isForeignKey = true;
          references = { table: parts[0]!, column: parts[1]! };
          relationships.push({
            from: { table: tableName, column: fieldName },
            to: { table: parts[0]!, column: parts[1]! },
            type: "one-to-many",
            source: {
              file: filePath,
              parser: "sqlalchemy",
              confidence: CONFIDENCE.sqlalchemy,
            },
          });
        }
      }

      // Extract default value
      let defaultValue: string | undefined;
      const defaultMatch = args.match(/\bdefault\s*=\s*([^,)]+)/);
      if (defaultMatch) {
        defaultValue = defaultMatch[1]!.trim();
      }

      if (isPk) primaryKey.push(fieldName);

      columns.push({
        name: fieldName,
        type: colType,
        nullable,
        defaultValue,
        isPrimaryKey: isPk,
        isForeignKey,
        references,
      });
    }

    if (columns.length > 0) {
      tables.push({
        name: tableName,
        columns,
        primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
        source: {
          file: filePath,
          parser: "sqlalchemy",
          confidence: CONFIDENCE.sqlalchemy,
        },
      });
    }
  }

  return { tables, relationships };
};

/**
 * Scan the file index for SQLAlchemy model files and parse them.
 */
export const parseSqlalchemyFiles = async (
  index: FileIndex,
): Promise<SchemaParserResult> =>
  collectParserResults(
    index.getByExtension(".py"),
    (c) =>
      c.includes("__tablename__") &&
      (c.includes("Column(") || c.includes("mapped_column(")),
    parseSqlalchemy,
  );
