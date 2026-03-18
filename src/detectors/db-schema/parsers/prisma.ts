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

/** Map Prisma scalar types to SQL-like types. */
const PRISMA_TYPE_MAP: ReadonlyMap<string, string> = new Map([
  ["String", "varchar"],
  ["Int", "integer"],
  ["BigInt", "bigint"],
  ["Float", "double precision"],
  ["Decimal", "decimal"],
  ["Boolean", "boolean"],
  ["DateTime", "timestamp"],
  ["Json", "jsonb"],
  ["Bytes", "bytea"],
]);

/**
 * Parse a Prisma schema string and extract tables, columns, and relationships.
 * Exported for unit testing.
 */
export const parsePrisma = (
  content: string,
  filePath: string,
): SchemaParserResult => {
  const tables: TableInfo[] = [];
  const relationships: RelationshipInfo[] = [];

  // Extract model blocks using balanced brace extraction (handles EOF without trailing newline)
  const modelStartRegex = /model\s+(\w+)\s*\{/g;
  let modelMatch: RegExpExecArray | null;

  while ((modelMatch = modelStartRegex.exec(content)) !== null) {
    let modelName = modelMatch[1]!;
    const bodyStart = modelMatch.index + modelMatch[0].length;
    const body = extractBalanced(content, bodyStart, "{", "}");
    const columns: ColumnInfo[] = [];
    const primaryKey: string[] = [];

    // Check for @@map("table_name")
    const mapMatch = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    if (mapMatch) {
      modelName = mapMatch[1]!;
    }

    // Check for @@id([field1, field2]) composite primary key
    const compositeIdMatch = body.match(/@@id\(\s*\[([^\]]+)\]\s*\)/);
    if (compositeIdMatch) {
      const fields = compositeIdMatch[1]!.split(",").map((f) => f.trim());
      primaryKey.push(...fields);
    }

    const lines = body.split("\n");

    // First pass: collect relation info for marking FK columns
    const relationFields = new Map<
      string,
      { referencedModel: string; fields: string[]; references: string[] }
    >();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) {
        continue;
      }

      const relationMatch = trimmed.match(
        /^(\w+)\s+(\w+)\s+@relation\(\s*fields:\s*\[([^\]]+)\]\s*,\s*references:\s*\[([^\]]+)\]\s*\)/,
      );
      if (relationMatch) {
        const fieldNames = relationMatch[3]!.split(",").map((f) => f.trim());
        const refNames = relationMatch[4]!.split(",").map((f) => f.trim());
        relationFields.set(relationMatch[1]!, {
          referencedModel: relationMatch[2]!,
          fields: fieldNames,
          references: refNames,
        });
      }
    }

    // Second pass: parse fields
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) {
        continue;
      }

      // Match field definition: name Type[?] [@attributes]
      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\[\])?\??(\s+.*)?$/);
      if (!fieldMatch) continue;

      const fieldName = fieldMatch[1]!;
      const fieldType = fieldMatch[2]!;
      const isList = !!fieldMatch[3];
      const isOptional =
        trimmed.includes(`${fieldType}?`) ||
        trimmed.includes(`${fieldType}[]?`);
      const attrs = fieldMatch[4] ?? "";

      // Skip relation list fields (e.g. posts Post[])
      if (isList) continue;

      // Skip relation object fields (those with @relation)
      if (attrs.includes("@relation")) {
        // But we still extract relationship info
        const rel = relationFields.get(fieldName);
        if (rel) {
          for (let i = 0; i < rel.fields.length; i++) {
            relationships.push({
              from: {
                table: modelName,
                column: rel.fields[i]!,
              },
              to: {
                table: rel.referencedModel,
                column: rel.references[i]!,
              },
              type: "one-to-many",
              source: {
                file: filePath,
                parser: "prisma",
                confidence: CONFIDENCE.prisma,
              },
            });
          }
        }
        continue;
      }

      // Check if this is a known scalar type or a relation type (without @relation)
      const sqlType = PRISMA_TYPE_MAP.get(fieldType);
      if (!sqlType) {
        // Could be an enum or another model reference without explicit @relation
        // Skip if it looks like a model reference (starts with uppercase and not in type map)
        if (
          fieldType[0] === fieldType[0]!.toUpperCase() &&
          /^[A-Z]/.test(fieldType)
        ) {
          continue;
        }
      }

      const isPk = attrs.includes("@id");
      if (isPk) {
        primaryKey.push(fieldName);
      }

      // Check if this field is a foreign key (referenced in a @relation)
      let isForeignKey = false;
      let references: { table: string; column: string } | undefined;
      for (const [, rel] of relationFields) {
        const idx = rel.fields.indexOf(fieldName);
        if (idx >= 0) {
          isForeignKey = true;
          references = {
            table: rel.referencedModel,
            column: rel.references[idx]!,
          };
          break;
        }
      }

      // Extract @default value (handles nested parens like autoincrement())
      let defaultValue: string | undefined;
      const defaultIdx = attrs.indexOf("@default(");
      if (defaultIdx >= 0) {
        const start = defaultIdx + "@default(".length;
        let depth = 1;
        let end = start;
        for (; end < attrs.length && depth > 0; end++) {
          if (attrs[end] === "(") depth++;
          else if (attrs[end] === ")") depth--;
        }
        defaultValue = attrs.slice(start, end - 1);
      }

      columns.push({
        name: fieldName,
        type: sqlType ?? fieldType.toLowerCase(),
        nullable: isOptional,
        defaultValue,
        isPrimaryKey: isPk,
        isForeignKey,
        references,
      });
    }

    tables.push({
      name: modelName,
      columns,
      primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
      source: {
        file: filePath,
        parser: "prisma",
        confidence: CONFIDENCE.prisma,
      },
    });
  }

  return { tables, relationships };
};

/**
 * Scan the file index for Prisma schema files and parse them.
 */
export const parsePrismaFiles = async (
  index: FileIndex,
): Promise<SchemaParserResult> =>
  collectParserResults(index.getByName("schema.prisma"), null, parsePrisma);
