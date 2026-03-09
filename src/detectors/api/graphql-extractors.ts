import type { RawEndpoint } from "./types";

// ─── GraphQL schema files (.graphql / .gql) ─────────────────────────

/** Extract Query/Mutation fields from GraphQL schema files. */
export const extractGraphqlSchema = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];
  let currentType: "QUERY" | "MUTATION" | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Detect type Query { or type Mutation {
    const typeMatch = /^type\s+(Query|Mutation)\s*\{?\s*$/.exec(trimmed);
    if (typeMatch) {
      currentType = typeMatch[1] === "Query" ? "QUERY" : "MUTATION";
      braceDepth = trimmed.includes("{") ? 1 : 0;
      continue;
    }

    if (currentType !== null) {
      // Track braces
      for (const ch of trimmed) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      if (braceDepth <= 0) {
        currentType = null;
        continue;
      }

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Extract field names: fieldName(...): Type or fieldName: Type
      const fieldMatch = /^(\w+)\s*(?:\(|:)/.exec(trimmed);
      if (fieldMatch) {
        const typeName = currentType === "QUERY" ? "Query" : "Mutation";
        endpoints.push({
          method: currentType,
          path: `${typeName}.${fieldMatch[1]}`,
          file: filePath,
          line: i + 1,
          framework: "GraphQL",
        });
      }
    }
  }

  return endpoints;
};

// ─── NestJS GraphQL resolvers ───────────────────────────────────────

/** Extract GraphQL operations from NestJS @Query/@Mutation decorators. */
export const extractNestJsGraphql = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // @Query() or @Mutation() decorator
    const decoratorMatch = /@(Query|Mutation)\(/.exec(line);
    if (!decoratorMatch) continue;

    const method = decoratorMatch[1] === "Query" ? "QUERY" : "MUTATION";
    const typeName = decoratorMatch[1] === "Query" ? "Query" : "Mutation";

    // Try to get explicit name from decorator: @Query(() => User, { name: 'getUser' })
    const nameMatch = /name:\s*['"](\w+)['"]/.exec(line);

    // Otherwise get the method name from the next line or same line
    let fieldName = nameMatch?.[1];
    if (!fieldName) {
      // Look at same line and next few lines for method definition
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const fnMatch = /(?:async\s+)?(\w+)\s*\(/.exec(lines[j]!);
        if (fnMatch && fnMatch[1] !== "Query" && fnMatch[1] !== "Mutation") {
          fieldName = fnMatch[1];
          break;
        }
      }
    }

    if (fieldName) {
      endpoints.push({
        method,
        path: `${typeName}.${fieldName}`,
        file: filePath,
        line: i + 1,
        framework: "NestJS",
      });
    }
  }

  return endpoints;
};

/** Check if content looks like a NestJS resolver. */
export const isNestJsResolver = (content: string): boolean =>
  content.includes("@Resolver") &&
  (content.includes("@Query") || content.includes("@Mutation"));
