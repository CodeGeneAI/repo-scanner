import type {
  ColumnInfo,
  DatabaseSchema,
  RelationshipInfo,
} from "../../detectors/db-schema/types";
import type { RepoScanResult } from "../../types";
import type { DiagramOutput } from "./types";

/**
 * Sanitize a name (table or column) for use as a Mermaid erDiagram identifier.
 * Replaces spaces, hyphens, and dots with underscores; strips other
 * non-alphanumeric characters; prefixes with _ if starting with a digit.
 */
const sanitizeName = (name: string): string => {
  let sanitized = name.replace(/[\s\-.]+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  if (sanitized.length === 0) return "unknown";
  if (/^\d/.test(sanitized)) sanitized = `_${sanitized}`;
  return sanitized;
};

/**
 * Sanitize a column type for Mermaid (no spaces or parentheses allowed in type position).
 * Strips parenthesized precision (e.g. VARCHAR(255) → VARCHAR) and replaces spaces.
 */
const sanitizeType = (type: string): string => {
  const cleaned = type
    .trim()
    .replace(/\([^)]*\)/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned.length === 0 ? "unknown" : cleaned;
};

/** Build the PK/FK marker suffix for a column. */
const columnMarker = (col: ColumnInfo): string => {
  if (col.isPrimaryKey) return " PK";
  if (col.isForeignKey) return " FK";
  return "";
};

/** Map a relationship type to its Mermaid ER notation. */
const relationshipNotation = (type: RelationshipInfo["type"]): string => {
  switch (type) {
    case "one-to-one":
      return "||--||";
    case "one-to-many":
      return "||--o{";
    case "many-to-many":
      return "}o--o{";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
};

/**
 * Generate a Mermaid erDiagram from the database schema in a RepoScanResult.
 * Returns null when no schema data is available.
 */
export const generateErdDiagram = (
  result: RepoScanResult,
): DiagramOutput | null => {
  const schema: DatabaseSchema | undefined = result.inventory.databaseSchema;

  if (!schema || schema.tables.length === 0) return null;

  const lines: string[] = ["erDiagram"];

  // Track sanitized table names for relationship validation
  const knownTables = new Set<string>();

  // Render entity blocks
  for (const table of schema.tables) {
    const tableName = sanitizeName(table.name);
    knownTables.add(tableName);

    lines.push("");
    lines.push(`  ${tableName} {`);
    for (const col of table.columns) {
      const type = sanitizeType(col.type);
      const name = sanitizeName(col.name);
      const marker = columnMarker(col);
      lines.push(`    ${type} ${name}${marker}`);
    }
    lines.push("  }");
  }

  // Render relationships
  if (schema.relationships.length > 0) {
    lines.push("");
    for (const rel of schema.relationships) {
      const fromTable = sanitizeName(rel.from.table);
      const toTable = sanitizeName(rel.to.table);

      // Skip relationships referencing unknown tables
      if (!knownTables.has(fromTable) || !knownTables.has(toTable)) continue;

      const notation = relationshipNotation(rel.type);
      const label = sanitizeName(rel.from.column);
      lines.push(`  ${fromTable} ${notation} ${toTable} : "${label}"`);
    }
  }

  return {
    kind: "erd",
    title: "Entity-Relationship Diagram",
    mermaid: lines.join("\n"),
  };
};
