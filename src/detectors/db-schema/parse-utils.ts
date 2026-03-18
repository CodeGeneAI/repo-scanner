import { readText } from "../../utils/fs";
import type { RelationshipInfo, SchemaParserResult, TableInfo } from "./types";

/** Confidence values for each parser source. */
export const CONFIDENCE = {
  sql: 0.95,
  prisma: 0.95,
  drizzle: 0.9,
  typeorm: 0.9,
  django: 0.9,
  sqlalchemy: 0.9,
} as const;

/**
 * Shared accumulator for all schema parsers.
 * Iterates files, applies a quick-bail content check, runs the parser,
 * and collects results. Wraps each file in try/catch for error isolation.
 */
export const collectParserResults = async (
  files: ReadonlyArray<{
    readonly path: string;
    readonly relativePath: string;
  }>,
  bailCheck: ((content: string) => boolean) | null,
  parser: (content: string, filePath: string) => SchemaParserResult,
): Promise<SchemaParserResult> => {
  const allTables: TableInfo[] = [];
  const allRelationships: RelationshipInfo[] = [];

  for (const file of files) {
    try {
      const content = await readText(file.path);
      if (!content) continue;
      if (bailCheck && !bailCheck(content)) continue;

      const result = parser(content, file.relativePath);
      allTables.push(...result.tables);
      allRelationships.push(...result.relationships);
    } catch {}
  }

  return { tables: allTables, relationships: allRelationships };
};

/**
 * Split a string by top-level delimiters, respecting balanced brackets.
 * Works for comma-separated column defs (SQL), object entries (Drizzle), etc.
 */
export const splitAtTopLevel = (
  body: string,
  delimiter = ",",
  openers = "({",
  closers = ")}",
): string[] => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of body) {
    if (openers.includes(char)) depth++;
    else if (closers.includes(char)) depth--;
    else if (char === delimiter && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
};

/**
 * Extract content between balanced brackets starting after an opening bracket.
 * Works for braces (Drizzle), parentheses (SQLAlchemy), etc.
 */
export const extractBalanced = (
  content: string,
  start: number,
  open = "{",
  close = "}",
): string => {
  let depth = 1;
  let i = start;
  for (; i < content.length && depth > 0; i++) {
    if (content[i] === open) depth++;
    else if (content[i] === close) depth--;
  }
  return content.slice(start, i - 1);
};
