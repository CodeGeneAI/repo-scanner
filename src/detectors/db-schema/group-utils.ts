import type { TableInfo } from "./types";

/**
 * Well-known directory names that signal a schema/migration boundary.
 * The segment immediately before these in the file path is used as the
 * database group name.
 */
const BOUNDARY_DIRS = new Set([
  "migrations",
  "migrate",
  "db",
  "database",
  "schema",
  "sql",
  "prisma",
  "models",
  "entities",
]);

/**
 * Directories that are too generic to serve as a group name.
 * When encountered as the predecessor of a boundary directory, we continue
 * scanning further left in the path.
 */
const GENERIC_DIRS = new Set(["src", "lib", "app", "main"]);

/**
 * Infer a database group name from a relative source file path.
 *
 * Scans path segments for well-known boundary directories (migrations, prisma,
 * models, etc.) and uses the segment immediately before them as the group name.
 * Skips generic directories (src, lib) to find a meaningful name.
 *
 * Universal — not tied to any specific repo layout.
 */
export const inferDatabaseGroup = (filePath: string): string => {
  const segments = filePath.replace(/\\/g, "/").split("/").filter(Boolean);

  if (segments.length <= 1) return "default";

  // Scan for the first boundary directory and use its predecessor
  for (let i = 0; i < segments.length; i++) {
    if (!BOUNDARY_DIRS.has(segments[i]!.toLowerCase())) continue;

    // Walk backwards from the boundary to find a non-generic predecessor
    for (let j = i - 1; j >= 0; j--) {
      const candidate = segments[j]!.toLowerCase();
      if (!GENERIC_DIRS.has(candidate) && !BOUNDARY_DIRS.has(candidate)) {
        return candidate;
      }
    }

    // All predecessors were generic/boundary — fall through
    break;
  }

  return "default";
};

/**
 * Assign database groups to tables based on their source file paths.
 *
 * If all tables resolve to the same group (or there is only one), tables are
 * returned unchanged (no databaseGroup set) to preserve backward compatibility.
 * When multiple groups are detected, each table receives a databaseGroup value.
 */
export const assignDatabaseGroups = (
  tables: readonly TableInfo[],
): TableInfo[] => {
  if (tables.length === 0) return [];

  // Infer group for each table once (avoid double computation)
  const inferredGroups: string[] = [];
  const uniqueGroups = new Set<string>();

  for (const table of tables) {
    const group = inferDatabaseGroup(table.source.file);
    inferredGroups.push(group);
    uniqueGroups.add(group);
  }

  // Single group — return tables unchanged (no databaseGroup set)
  if (uniqueGroups.size <= 1) return tables as TableInfo[];

  return tables.map((table, i) => ({
    ...table,
    databaseGroup: inferredGroups[i],
  }));
};
