import type { FileIndex } from "../../utils/file-index";
import { registerDetector } from "../registry";
import { createFindingAdder } from "../shared";
import type { DetectorResult } from "../types";
import { parseDjangoFiles } from "./parsers/django";
import { parseDrizzleFiles } from "./parsers/drizzle";
import { parsePrismaFiles } from "./parsers/prisma";
import { parseSqlFiles } from "./parsers/sql";
import { parseSqlalchemyFiles } from "./parsers/sqlalchemy";
import { parseTypeormFiles } from "./parsers/typeorm";
import type {
  DatabaseSchema,
  DroppedItem,
  RelationshipInfo,
  TableInfo,
} from "./types";

/** Module-level opt-in flag. Safe for single-process CLI context only. */
let enabled = false;

/** Configure db-schema scanning options (called from CLI). */
export const setDbSchemaOptions = (opts: { enabled: boolean }): void => {
  enabled = opts.enabled;
};

/** Convert PascalCase/camelCase to snake_case for table name normalization. */
export const normalizeTableName = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();

/**
 * Merge tables from multiple parsers.
 * Tables with the same normalized name are merged:
 * - Higher-confidence source wins for the table entry
 * - Columns are unioned by name
 */
export const mergeTables = (allTables: readonly TableInfo[]): TableInfo[] => {
  const byName = new Map<string, TableInfo>();

  for (const table of allTables) {
    const normalized = normalizeTableName(table.name);
    const existing = byName.get(normalized);

    if (!existing) {
      byName.set(normalized, { ...table, name: normalized });
      continue;
    }

    // Merge: prefer higher confidence source, union columns
    const winner =
      table.source.confidence > existing.source.confidence ? table : existing;
    const loser = winner === table ? existing : table;

    // Union columns by name
    const columnMap = new Map<string, (typeof existing.columns)[number]>();
    for (const col of loser.columns) columnMap.set(col.name, col);
    for (const col of winner.columns) columnMap.set(col.name, col); // winner overwrites

    const mergedPk = winner.primaryKey ?? loser.primaryKey;

    byName.set(normalized, {
      name: normalized,
      columns: [...columnMap.values()],
      primaryKey: mergedPk,
      source: winner.source,
    });
  }

  return [...byName.values()];
};

/** Deduplicate relationships by composite key (from.table.column -> to.table.column). */
export const dedupeRelationships = (
  rels: readonly RelationshipInfo[],
): RelationshipInfo[] => {
  const seen = new Set<string>();
  const result: RelationshipInfo[] = [];

  for (const rel of rels) {
    const fromTable = normalizeTableName(rel.from.table);
    const toTable = normalizeTableName(rel.to.table);
    const key = `${fromTable}.${rel.from.column}->${toTable}.${rel.to.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...rel,
      from: { table: fromTable, column: rel.from.column },
      to: { table: toTable, column: rel.to.column },
    });
  }

  return result;
};

registerDetector({
  id: "db-schema",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    if (!enabled) {
      return { detectorId: "db-schema", findings: [] };
    }

    const { findings, addFinding } = createFindingAdder();

    // Run all parsers in parallel, failure-isolated
    const parserResults = await Promise.allSettled([
      parseSqlFiles(index),
      parsePrismaFiles(index),
      parseDrizzleFiles(index),
      parseTypeormFiles(index),
      parseDjangoFiles(index),
      parseSqlalchemyFiles(index),
    ]);

    // Collect successful results
    const allTables: TableInfo[] = [];
    const allRelationships: RelationshipInfo[] = [];
    const allDropped: DroppedItem[] = [];

    for (const result of parserResults) {
      if (result.status === "fulfilled") {
        allTables.push(...result.value.tables);
        allRelationships.push(...result.value.relationships);
        if (result.value.dropped) {
          allDropped.push(...result.value.dropped);
        }
      }
    }

    // Merge, deduplicate, and apply drops
    let mergedTables = mergeTables(allTables);
    let mergedRelationships = dedupeRelationships(allRelationships);

    if (allDropped.length > 0) {
      const droppedTableNames = new Set(
        allDropped
          .filter((d) => !d.column)
          .map((d) => normalizeTableName(d.table)),
      );
      const droppedColumns = allDropped.filter((d) => d.column);

      // Remove dropped tables
      mergedTables = mergedTables.filter((t) => !droppedTableNames.has(t.name));

      // Remove dropped columns from remaining tables
      if (droppedColumns.length > 0) {
        mergedTables = mergedTables.map((table) => {
          const drops = droppedColumns
            .filter((d) => normalizeTableName(d.table) === table.name)
            .map((d) => d.column!);
          if (drops.length === 0) return table;
          return {
            ...table,
            columns: table.columns.filter((c) => !drops.includes(c.name)),
          };
        });
      }

      // Remove relationships referencing dropped tables
      mergedRelationships = mergedRelationships.filter(
        (r) =>
          !droppedTableNames.has(normalizeTableName(r.from.table)) &&
          !droppedTableNames.has(normalizeTableName(r.to.table)),
      );
    }

    const totalColumns = mergedTables.reduce(
      (sum, t) => sum + t.columns.length,
      0,
    );

    const databaseSchema: DatabaseSchema = {
      tables: mergedTables,
      relationships: mergedRelationships,
      summary: {
        totalTables: mergedTables.length,
        totalColumns,
        totalRelationships: mergedRelationships.length,
      },
    };

    if (mergedTables.length > 0) {
      addFinding(
        `Database schema: ${mergedTables.length} tables, ${mergedRelationships.length} relationships`,
        0.95,
        `Detected across ${parserResults.filter((r) => r.status === "fulfilled").length} parser(s)`,
      );
    }

    return {
      detectorId: "db-schema",
      findings,
      metadata: { databaseSchema },
    };
  },
});
