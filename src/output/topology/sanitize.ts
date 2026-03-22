const MAX_NODE_ID_LENGTH = 100;

const NEEDS_QUOTING = /[^a-zA-Z0-9_]/;

/**
 * Mermaid flowchart reserved keywords that must be quoted when used as
 * node labels, even if they contain only alphanumeric characters.
 */
const MERMAID_RESERVED = new Set([
  "if",
  "else",
  "end",
  "graph",
  "subgraph",
  "direction",
  "click",
  "style",
  "classDef",
  "class",
  "linkStyle",
  "callback",
]);

/**
 * Convert a component name/path to a safe mermaid node ID.
 * Only [a-zA-Z_][a-zA-Z0-9_]* are valid mermaid IDs.
 *
 * When a `seen` set is provided, guarantees uniqueness by appending
 * a numeric suffix on collision.
 */
export const toNodeId = (name: string, seen?: Set<string>): string => {
  if (name.length === 0) {
    let fallback = "node_0";
    if (seen) {
      if (seen.has(fallback)) {
        let counter = 1;
        while (seen.has(`${fallback}_${counter}`)) counter++;
        fallback = `${fallback}_${counter}`;
      }
      seen.add(fallback);
    }
    return fallback;
  }

  let id = name
    // strip @
    .replace(/@/g, "")
    // replace non-alphanumeric with underscore
    .replace(/[^a-zA-Z0-9_]/g, "_")
    // collapse consecutive underscores
    .replace(/_+/g, "_")
    // strip trailing underscores
    .replace(/_$/g, "")
    // strip leading underscores (will re-add prefix if needed)
    .replace(/^_+/, "");

  // Prefix if starts with a digit
  if (/^\d/.test(id)) {
    id = `_${id}`;
  }

  // Fallback if everything was stripped
  if (id.length === 0) {
    id = "node_0";
  }

  // Truncate
  if (id.length > MAX_NODE_ID_LENGTH) {
    id = id.slice(0, MAX_NODE_ID_LENGTH);
  }

  if (!seen) {
    return id;
  }

  // Ensure uniqueness
  if (!seen.has(id)) {
    seen.add(id);
    return id;
  }

  let counter = 1;
  while (seen.has(`${id}_${counter}`)) {
    counter++;
  }
  const unique = `${id}_${counter}`;
  seen.add(unique);
  return unique;
};

/**
 * Escape a string for use as a mermaid node label.
 * Wraps in double quotes if it contains special characters or is a
 * mermaid reserved keyword (e.g. `if`, `end`, `subgraph`).
 * Escapes double quotes (#quot;) and pipe characters (#124;)
 * using mermaid HTML numeric entities.
 */
export const escapeLabel = (label: string): string => {
  if (label.length === 0) {
    return '""';
  }

  if (!NEEDS_QUOTING.test(label) && !MERMAID_RESERVED.has(label)) {
    return label;
  }

  const escaped = label
    .replace(/\\n/g, "<br/>")
    .replace(/"/g, "#quot;")
    .replace(/\|/g, "#124;");
  return `"${escaped}"`;
};

/**
 * Truncate a label to a maximum length, appending "..." if truncated.
 */
export const truncateLabel = (label: string, maxLen = 40): string => {
  if (label.length <= maxLen) {
    return label;
  }
  return `${label.slice(0, maxLen - 3)}...`;
};

/**
 * Strip the npm scope prefix (e.g. "@codegeneai/foo" → "foo").
 */
export const stripScope = (name: string): string =>
  name.startsWith("@") ? name.replace(/^@[^/]+\//, "") : name;

/**
 * Extract a short display label from a path (last segment).
 */
export const extractShortLabel = (pathOrName: string): string =>
  pathOrName.split("/").pop() ?? pathOrName;

/**
 * Render a mermaid subgraph block into a lines array.
 */
export const renderSubgraph = (
  lines: string[],
  name: string,
  renderNodes: (lines: string[]) => void,
): void => {
  const nodeLines: string[] = [];
  renderNodes(nodeLines);
  if (nodeLines.length === 0) return;
  lines.push("");
  lines.push(`  subgraph ${name}`);
  lines.push(...nodeLines);
  lines.push("  end");
};
