import type {
  ColumnInfo,
  DatabaseSchema,
  RelationshipInfo,
  TableInfo,
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
 * Preserves key fidelity (precision/timezone tokens) by converting separators
 * to underscores (e.g. VARCHAR(255) -> VARCHAR_255).
 */
const sanitizeType = (type: string): string => {
  const cleaned = type.trim().replace(/[(),]/g, "_").replace(/\s+/g, "_");
  const normalized = cleaned
    .replace(/[^a-zA-Z0-9_[\]]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length === 0 ? "unknown" : normalized;
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
 * Generate a single Mermaid erDiagram for a set of tables and relationships.
 * Tables in `stubTables` are rendered as empty entity blocks (no columns).
 */
const generateSingleErd = (
  tables: readonly TableInfo[],
  relationships: readonly RelationshipInfo[],
  stubTableNames: ReadonlySet<string>,
  title: string,
): DiagramOutput => {
  const lines: string[] = ["erDiagram"];
  const knownTables = new Set<string>();

  // Render entity blocks for real tables
  for (const table of tables) {
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

  // Render stub entities (cross-group references)
  for (const stubName of stubTableNames) {
    const sanitized = sanitizeName(stubName);
    if (!knownTables.has(sanitized)) {
      knownTables.add(sanitized);
      lines.push("");
      lines.push(`  ${sanitized} {`);
      lines.push("  }");
    }
  }

  // Render relationships
  if (relationships.length > 0) {
    lines.push("");
    for (const rel of relationships) {
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
    title,
    mermaid: lines.join("\n"),
  };
};

/**
 * Generate Mermaid erDiagram(s) from the database schema in a RepoScanResult.
 *
 * When tables belong to multiple database groups (inferred from source file
 * paths), generates one ERD per group. Cross-group relationships are included
 * with the foreign table rendered as a stub entity (empty block).
 *
 * Returns null when no schema data is available.
 */
export const generateErdDiagram = (
  result: RepoScanResult,
): DiagramOutput[] | null => {
  const schema: DatabaseSchema | undefined = result.inventory.databaseSchema;

  if (!schema || schema.tables.length === 0) return null;

  // Group tables by databaseGroup (undefined = ungrouped)
  const groups = new Map<string | undefined, TableInfo[]>();
  for (const table of schema.tables) {
    const group = table.databaseGroup;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(table);
  }

  // Single group (or all ungrouped) — produce one diagram as before
  if (groups.size <= 1) {
    return [
      generateSingleErd(
        schema.tables,
        schema.relationships,
        new Set(),
        "Entity-Relationship Diagram",
      ),
    ];
  }

  // Multiple groups — one ERD per group
  const diagrams: DiagramOutput[] = [];

  for (const [groupName, groupTables] of groups) {
    const groupTableNames = new Set(groupTables.map((t) => t.name));
    const stubTables = new Set<string>();

    // Find relationships relevant to this group
    const groupRelationships: RelationshipInfo[] = [];
    for (const rel of schema.relationships) {
      const fromInGroup = groupTableNames.has(rel.from.table);
      const toInGroup = groupTableNames.has(rel.to.table);

      if (fromInGroup && toInGroup) {
        // Both tables in this group — include normally
        groupRelationships.push(rel);
      } else if (fromInGroup) {
        // from is here, to is in another group — stub the foreign table
        groupRelationships.push(rel);
        stubTables.add(rel.to.table);
      } else if (toInGroup) {
        // to is here, from is in another group — stub the foreign table
        groupRelationships.push(rel);
        stubTables.add(rel.from.table);
      }
    }

    const label = groupName ?? "default";
    const title = `Entity-Relationship Diagram (${label})`;

    diagrams.push(
      generateSingleErd(groupTables, groupRelationships, stubTables, title),
    );
  }

  return diagrams;
};
