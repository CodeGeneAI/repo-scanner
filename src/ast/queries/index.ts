import type { Language, Tree } from "web-tree-sitter";
import { extractAll as extractCSharp } from "./csharp";
import { extractAll as extractGo } from "./go";
import { extractAll as extractJava } from "./java";
import { extractAll as extractPython } from "./python";
import { extractAll as extractRust } from "./rust";
import type { FileAnalysis } from "./types";
import { extractAll as extractTypeScript } from "./typescript";

type Extractor = (
  tree: Tree,
  lang: InstanceType<typeof Language>,
) => FileAnalysis;

const EXTRACTORS: ReadonlyMap<string, Extractor> = new Map([
  [".ts", extractTypeScript],
  [".tsx", extractTypeScript],
  [".js", extractTypeScript],
  [".jsx", extractTypeScript],
  [".mjs", extractTypeScript],
  [".cjs", extractTypeScript],
  [".py", extractPython],
  [".go", extractGo],
  [".rs", extractRust],
  [".cs", extractCSharp],
  [".java", extractJava],
  // Note: Kotlin (.kt) intentionally excluded — its tree-sitter grammar
  // produces different node types than Java's. Add a dedicated extractor if needed.
]);

/**
 * Extract structural info from a parsed AST using language-specific queries.
 * Returns null for unsupported extensions.
 */
export const extractAll = (
  tree: Tree,
  lang: InstanceType<typeof Language>,
  ext: string,
): FileAnalysis | null => {
  const extractor = EXTRACTORS.get(ext);
  if (!extractor) return null;

  try {
    return extractor(tree, lang);
  } catch {
    // Gracefully handle query failures
    return {
      classes: [],
      imports: [],
      interfaces: [],
      instantiations: [],
      typeChecks: [],
    };
  }
};
