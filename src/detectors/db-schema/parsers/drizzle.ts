import type { FileIndex } from "../../../utils/file-index";
import {
  CONFIDENCE,
  collectParserResults,
  extractBalanced,
  splitAtTopLevel,
} from "../parse-utils";
import type {
  ColumnInfo,
  RelationshipInfo,
  SchemaParserResult,
  TableInfo,
} from "../types";

/**
 * Parse Drizzle schema definitions from a source file.
 * Exported for unit testing.
 */
export const parseDrizzle = (
  content: string,
  filePath: string,
): SchemaParserResult => {
  const tables: TableInfo[] = [];
  const relationships: RelationshipInfo[] = [];

  // Find table definitions and extract balanced brace body
  const tableStartRegex =
    /(?:pgTable|mysqlTable|sqliteTable)\(\s*["'](\w+)["']\s*,\s*\{/g;

  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableStartRegex.exec(content)) !== null) {
    const tableName = tableMatch[1]!;
    const bodyStart = tableMatch.index + tableMatch[0].length;
    const body = extractBalanced(content, bodyStart, "{", "}");
    const columns: ColumnInfo[] = [];
    const primaryKey: string[] = [];

    // Parse each column definition line by splitting on top-level commas
    const colLines = splitAtTopLevel(body);

    for (const colLine of colLines) {
      const trimmed = colLine.trim();
      // Pattern: key: type("col_name", ...).chain1().chain2()
      const colMatch = trimmed.match(
        /^(\w+)\s*:\s*(\w+)\(\s*["']([^"']+)["'][^)]*\)(.*)/s,
      );
      if (!colMatch) continue;

      const colType = colMatch[2]!;
      const colName = colMatch[3]!;
      const chain = colMatch[4] ?? "";

      const isPk = chain.includes(".primaryKey()");
      if (isPk) primaryKey.push(colName);

      const isNotNull = chain.includes(".notNull()") || isPk;
      const nullable = !isNotNull;

      // Extract .default(value)
      let defaultValue: string | undefined;
      const defaultMatch = chain.match(/\.default\(([^)]+)\)/);
      if (defaultMatch) {
        defaultValue = defaultMatch[1]!.trim();
      }

      // Extract .references(() => table.column)
      let isForeignKey = false;
      let references: { table: string; column: string } | undefined;

      const refMatch = chain.match(
        /\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)\s*\)/,
      );
      if (refMatch) {
        isForeignKey = true;
        references = { table: refMatch[1]!, column: refMatch[2]! };
        relationships.push({
          from: { table: tableName, column: colName },
          to: { table: refMatch[1]!, column: refMatch[2]! },
          type: "one-to-many",
          source: {
            file: filePath,
            parser: "drizzle",
            confidence: CONFIDENCE.drizzle,
          },
        });
      }

      columns.push({
        name: colName,
        type: colType,
        nullable,
        defaultValue,
        isPrimaryKey: isPk,
        isForeignKey,
        references,
      });
    }

    tables.push({
      name: tableName,
      columns,
      primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
      source: {
        file: filePath,
        parser: "drizzle",
        confidence: CONFIDENCE.drizzle,
      },
    });
  }

  return { tables, relationships };
};

/**
 * Scan the file index for Drizzle schema files and parse them.
 */
export const parseDrizzleFiles = async (
  index: FileIndex,
): Promise<SchemaParserResult> => {
  // Use getByExtensionPrimary to exclude test/fixture/example files
  const tsFiles = [
    ...index.getByExtensionPrimary(".ts"),
    ...index.getByExtensionPrimary(".js"),
  ];
  return collectParserResults(
    tsFiles,
    (c) =>
      c.includes("pgTable(") ||
      c.includes("mysqlTable(") ||
      c.includes("sqliteTable("),
    parseDrizzle,
  );
};
