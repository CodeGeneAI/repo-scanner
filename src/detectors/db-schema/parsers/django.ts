import type { FileIndex } from "../../../utils/file-index";
import { CONFIDENCE, collectParserResults } from "../parse-utils";
import type {
  ColumnInfo,
  RelationshipInfo,
  SchemaParserResult,
  TableInfo,
} from "../types";

/** Map Django field types to SQL-like types. */
const DJANGO_FIELD_MAP: ReadonlyMap<string, string> = new Map([
  ["CharField", "varchar"],
  ["TextField", "text"],
  ["EmailField", "varchar"],
  ["URLField", "varchar"],
  ["SlugField", "varchar"],
  ["FilePathField", "varchar"],
  ["FileField", "varchar"],
  ["ImageField", "varchar"],
  ["IntegerField", "integer"],
  ["BigIntegerField", "bigint"],
  ["SmallIntegerField", "smallint"],
  ["PositiveIntegerField", "integer"],
  ["PositiveBigIntegerField", "bigint"],
  ["PositiveSmallIntegerField", "smallint"],
  ["FloatField", "double precision"],
  ["DecimalField", "decimal"],
  ["BooleanField", "boolean"],
  ["NullBooleanField", "boolean"],
  ["DateField", "date"],
  ["DateTimeField", "timestamp"],
  ["TimeField", "time"],
  ["DurationField", "interval"],
  ["UUIDField", "uuid"],
  ["BinaryField", "bytea"],
  ["JSONField", "jsonb"],
  ["AutoField", "integer"],
  ["BigAutoField", "bigint"],
  ["SmallAutoField", "smallint"],
  ["GenericIPAddressField", "varchar"],
  ["IPAddressField", "varchar"],
]);

/** Convert PascalCase class name to snake_case table name (Django convention). */
const toSnakeCase = (name: string): string =>
  name
    .replace(/([A-Z])/g, (match, p1, offset) => (offset > 0 ? `_${p1}` : p1))
    .toLowerCase();

/**
 * Parse Django model definitions from Python source.
 * Exported for unit testing.
 */
export const parseDjango = (
  content: string,
  filePath: string,
): SchemaParserResult => {
  const tables: TableInfo[] = [];
  const relationships: RelationshipInfo[] = [];

  // Find class definitions that extend models.Model
  // Body = everything until next unindented class or end of string
  const classRegex =
    /class\s+(\w+)\((?:\w+\.)?(?:models\.)?Model\)\s*:([\s\S]*?)(?=\nclass\s|\n[^\s\n#]|$)/g;

  let classMatch: RegExpExecArray | null;
  while ((classMatch = classRegex.exec(content)) !== null) {
    const className = classMatch[1]!;
    let tableName = toSnakeCase(className);
    const body = classMatch[2]!;
    const columns: ColumnInfo[] = [];
    const primaryKey: string[] = [];

    // Check for Meta class with db_table
    const metaMatch = body.match(
      /class\s+Meta\s*:[\s\S]*?db_table\s*=\s*["']([^"']+)["']/,
    );
    if (metaMatch) {
      tableName = metaMatch[1]!;
    }

    // Parse field assignments
    const fieldRegex =
      /^\s{4}(\w+)\s*=\s*models\.(\w+)\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm;

    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      const fieldName = fieldMatch[1]!;
      const fieldType = fieldMatch[2]!;
      const args = fieldMatch[3] ?? "";

      // Handle relationship fields
      if (fieldType === "ForeignKey") {
        const refModel = extractFirstArg(args);
        const refTable = toSnakeCase(refModel);
        const colName = `${fieldName}_id`;
        const nullable = args.includes("null=True");

        columns.push({
          name: colName,
          type: "integer",
          nullable,
          isForeignKey: true,
          references: { table: refTable, column: "id" },
        });

        relationships.push({
          from: { table: tableName, column: colName },
          to: { table: refTable, column: "id" },
          type: "one-to-many",
          source: {
            file: filePath,
            parser: "django",
            confidence: CONFIDENCE.django,
          },
        });
        continue;
      }

      if (fieldType === "OneToOneField") {
        const refModel = extractFirstArg(args);
        const refTable = toSnakeCase(refModel);
        const colName = `${fieldName}_id`;
        const nullable = args.includes("null=True");

        columns.push({
          name: colName,
          type: "integer",
          nullable,
          isForeignKey: true,
          references: { table: refTable, column: "id" },
        });

        relationships.push({
          from: { table: tableName, column: colName },
          to: { table: refTable, column: "id" },
          type: "one-to-one",
          source: {
            file: filePath,
            parser: "django",
            confidence: CONFIDENCE.django,
          },
        });
        continue;
      }

      if (fieldType === "ManyToManyField") {
        const refModel = extractFirstArg(args);
        const refTable = toSnakeCase(refModel);

        relationships.push({
          from: { table: tableName, column: fieldName },
          to: { table: refTable, column: "id" },
          type: "many-to-many",
          source: {
            file: filePath,
            parser: "django",
            confidence: CONFIDENCE.django,
          },
        });
        continue;
      }

      // Regular field
      const sqlType =
        DJANGO_FIELD_MAP.get(fieldType) ?? fieldType.toLowerCase();
      const nullable = args.includes("null=True");
      const isPk = args.includes("primary_key=True");

      let defaultValue: string | undefined;
      const defaultMatch = args.match(/default\s*=\s*([^,)]+)/);
      if (defaultMatch) {
        defaultValue = defaultMatch[1]!.trim();
      }

      if (isPk) primaryKey.push(fieldName);

      columns.push({
        name: fieldName,
        type: sqlType,
        nullable,
        defaultValue,
        isPrimaryKey: isPk,
        isForeignKey: false,
      });
    }

    tables.push({
      name: tableName,
      columns,
      primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
      source: {
        file: filePath,
        parser: "django",
        confidence: CONFIDENCE.django,
      },
    });
  }

  return { tables, relationships };
};

/** Extract the first positional argument (model name) from Django field args. */
const extractFirstArg = (args: string): string => {
  const trimmed = args.trim();
  // Handle string argument: "ModelName" or 'ModelName'
  const strMatch = trimmed.match(/^["'](\w+)["']/);
  if (strMatch) return strMatch[1]!;
  // Handle direct reference: ModelName
  const refMatch = trimmed.match(/^(\w+)/);
  return refMatch ? refMatch[1]! : trimmed;
};

/**
 * Scan the file index for Django model files and parse them.
 */
export const parseDjangoFiles = async (
  index: FileIndex,
): Promise<SchemaParserResult> =>
  collectParserResults(
    index.getByExtension(".py"),
    (c) => c.includes("models.Model"),
    parseDjango,
  );
