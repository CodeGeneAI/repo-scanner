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

/** Map TypeScript types to SQL-like types when no explicit type is given. */
const TS_TYPE_MAP: ReadonlyMap<string, string> = new Map([
  ["number", "integer"],
  ["string", "varchar"],
  ["boolean", "boolean"],
  ["Date", "timestamp"],
]);

/**
 * Parse TypeORM entity decorators from source code.
 * Exported for unit testing.
 */
export const parseTypeorm = (
  content: string,
  filePath: string,
): SchemaParserResult => {
  const tables: TableInfo[] = [];
  const relationships: RelationshipInfo[] = [];

  // Find @Entity() decorated classes, then extract body via balanced braces
  const entityStartRegex =
    /@Entity\(\s*(?:["']([^"']+)["'])?\s*\)\s*(?:export\s+)?class\s+(\w+)\s*(?:extends\s+\w+\s*)?\{/g;

  let entityMatch: RegExpExecArray | null;
  while ((entityMatch = entityStartRegex.exec(content)) !== null) {
    const customName = entityMatch[1];
    const className = entityMatch[2]!;
    const tableName = customName ?? className.toLowerCase();
    const bodyStart = entityMatch.index + entityMatch[0].length;
    const body = extractBalanced(content, bodyStart, "{", "}");
    const columns: ColumnInfo[] = [];
    const primaryKey: string[] = [];

    // Parse decorators and their associated fields
    // We process lines sequentially, tracking the current decorator
    const lines = body.split("\n");
    let currentDecorators: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;

      // Collect decorators
      if (trimmed.startsWith("@")) {
        currentDecorators.push(trimmed);
        continue;
      }

      // If we have decorators, this line should be the field declaration
      if (currentDecorators.length > 0) {
        const fieldMatch = trimmed.match(/^(\w+)\s*[?!]?\s*:\s*(\w+)/);
        if (fieldMatch) {
          const fieldName = fieldMatch[1]!;
          const tsType = fieldMatch[2]!;

          const decoratorStr = currentDecorators.join(" ");

          // Check for relationship decorators
          const manyToOneMatch = decoratorStr.match(
            /@ManyToOne\(\s*\(\)\s*=>\s*(\w+)/,
          );
          const oneToOneMatch = decoratorStr.match(
            /@OneToOne\(\s*\(\)\s*=>\s*(\w+)/,
          );
          const manyToManyMatch = decoratorStr.match(
            /@ManyToMany\(\s*\(\)\s*=>\s*(\w+)/,
          );
          const oneToManyMatch = decoratorStr.match(
            /@OneToMany\(\s*\(\)\s*=>\s*(\w+)/,
          );

          if (manyToOneMatch) {
            relationships.push({
              from: { table: tableName, column: fieldName },
              to: { table: manyToOneMatch[1]!, column: "id" },
              type: "one-to-many",
              source: {
                file: filePath,
                parser: "typeorm",
                confidence: CONFIDENCE.typeorm,
              },
            });
          } else if (oneToOneMatch) {
            relationships.push({
              from: { table: tableName, column: fieldName },
              to: { table: oneToOneMatch[1]!, column: "id" },
              type: "one-to-one",
              source: {
                file: filePath,
                parser: "typeorm",
                confidence: CONFIDENCE.typeorm,
              },
            });
          } else if (manyToManyMatch) {
            relationships.push({
              from: { table: tableName, column: fieldName },
              to: { table: manyToManyMatch[1]!, column: "id" },
              type: "many-to-many",
              source: {
                file: filePath,
                parser: "typeorm",
                confidence: CONFIDENCE.typeorm,
              },
            });
          } else if (oneToManyMatch) {
            // OneToMany is the inverse side, skip relationship (already captured by ManyToOne)
          }

          // Check for column decorators
          const isPrimaryGenerated = decoratorStr.includes(
            "@PrimaryGeneratedColumn",
          );
          const isPrimaryCol = decoratorStr.includes("@PrimaryColumn");
          const isColumn =
            decoratorStr.includes("@Column") &&
            !isPrimaryGenerated &&
            !isPrimaryCol;
          const isPk = isPrimaryGenerated || isPrimaryCol;

          if (isPk || isColumn) {
            // Extract explicit type from decorator
            let colType: string | undefined;
            const typeMatch = decoratorStr.match(/type:\s*["']([^"']+)["']/);
            if (typeMatch) {
              colType = typeMatch[1]!;
            }

            // Extract nullable from decorator
            let nullable: boolean | undefined;
            const nullableMatch = decoratorStr.match(
              /nullable:\s*(true|false)/,
            );
            if (nullableMatch) {
              nullable = nullableMatch[1] === "true";
            }

            // Extract default value from decorator
            let defaultValue: string | undefined;
            const defaultMatch = decoratorStr.match(/default:\s*([^,}]+)/);
            if (defaultMatch) {
              defaultValue = defaultMatch[1]!.trim().replace(/["']/g, "");
            }

            if (isPk) primaryKey.push(fieldName);

            columns.push({
              name: fieldName,
              type: colType ?? TS_TYPE_MAP.get(tsType) ?? tsType.toLowerCase(),
              nullable: isPk ? false : (nullable ?? false),
              defaultValue,
              isPrimaryKey: isPk,
              isForeignKey: false,
            });
          }
        }

        currentDecorators = [];
      }
    }

    tables.push({
      name: tableName,
      columns,
      primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
      source: {
        file: filePath,
        parser: "typeorm",
        confidence: CONFIDENCE.typeorm,
      },
    });
  }

  return { tables, relationships };
};

/**
 * Scan the file index for TypeORM entity files and parse them.
 */
export const parseTypeormFiles = async (
  index: FileIndex,
): Promise<SchemaParserResult> => {
  // Use getByExtensionPrimary to exclude test/fixture/example files
  const files = [
    ...index.getByExtensionPrimary(".ts"),
    ...index.getByExtensionPrimary(".js"),
  ];
  return collectParserResults(
    files,
    (c) => c.includes("@Entity"),
    parseTypeorm,
  );
};
