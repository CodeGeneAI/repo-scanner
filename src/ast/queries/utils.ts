import {
  type Language,
  Query,
  type QueryCapture,
  type QueryMatch,
  type Node as TSNode,
} from "web-tree-sitter";

/** Compile a query against the current Tree-sitter language instance. */
export const compileQuery = (language: Language, source: string): Query =>
  new Query(language, source);

/** Look up a named capture from a query match. */
export const findCapture = (
  match: QueryMatch,
  captureName: string,
): QueryCapture | undefined =>
  match.captures.find((capture: QueryCapture) => capture.name === captureName);

/**
 * Count branching nodes within a subtree for cyclomatic complexity.
 * Pass the language-specific set of branch node type names.
 */
export const countBranches = (
  node: TSNode | null,
  branchTypes: ReadonlySet<string>,
): number => {
  if (!node) return 0;
  let count = 0;
  const walk = (n: TSNode | null): void => {
    if (!n) return;
    if (branchTypes.has(n.type)) count++;
    for (let i = 0; i < n.childCount; i++) walk(n.child(i));
  };
  walk(node);
  return count;
};

/**
 * Find the nearest enclosing function/method name by walking up the AST.
 * Pass the language-specific set of function node type names.
 */
export const findEnclosingFunction = (
  node: TSNode | null,
  functionTypes: ReadonlySet<string>,
): string => {
  let current = node?.parent;
  while (current) {
    if (functionTypes.has(current.type)) {
      const nameNode = current.childForFieldName("name");
      if (nameNode) return nameNode.text;
    }
    current = current.parent;
  }
  return "<module>";
};

/** Check if a method body throws NotImplementedError or similar. */
export const bodyThrowsNotImplemented = (
  node: TSNode | null,
  patterns: readonly string[] = [
    "throw new Error",
    "NotImplementedError",
    "not implemented",
    "UnsupportedOperationException",
    "todo!()",
    "unimplemented!()",
    "panic!(",
  ],
): boolean => {
  if (!node) return false;
  const text = node.text;
  return patterns.some((p) => text.includes(p));
};

/** Check if method body is empty (0-1 statements, or just return/pass). */
export const isEmptyBody = (node: TSNode | null): boolean => {
  if (!node) return true;
  const text = node.text.trim();
  return (
    text === "{}" ||
    text === "{ }" ||
    text === "{ return; }" ||
    text === "pass" ||
    text === "..."
  );
};
