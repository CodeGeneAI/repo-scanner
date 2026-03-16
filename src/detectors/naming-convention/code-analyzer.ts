import { mapWithConcurrency } from "../../utils/concurrency";
import {
  type FileIndex,
  type IndexedFile,
  isSecondaryPath,
} from "../../utils/file-index";
import { readText } from "../../utils/fs";
import { classifyCase } from "./case-classifier";
import type { CaseStyle, NamingCategory, NamingPattern } from "./types";

/** Max files to sample per language for identifier extraction. */
const MAX_SAMPLE_FILES = 100;

/** Concurrency limit for file reads. */
const READ_CONCURRENCY = 32;

/** Language extensions to extract identifiers from. */
const LANGUAGE_EXTRACTORS: ReadonlyMap<
  string,
  (lines: readonly string[]) => ExtractedIdentifier[]
> = new Map([
  [".ts", extractTypeScript],
  [".tsx", extractTypeScript],
  [".js", extractTypeScript],
  [".jsx", extractTypeScript],
  [".mjs", extractTypeScript],
  [".cjs", extractTypeScript],
  [".py", extractPython],
  [".go", extractGo],
  [".rs", extractRust],
  [".java", extractJavaKotlin],
  [".kt", extractJavaKotlin],
  [".cs", extractCSharp],
  [".rb", extractRuby],
  [".php", extractPhp],
  [".swift", extractSwift],
  [".dart", extractDart],
  [".scala", extractScala],
]);

interface ExtractedIdentifier {
  readonly name: string;
  readonly category: NamingCategory;
}

// ─── Language extractors ───────────────────────────────────────────

function extractTypeScript(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();

    // Functions: function name( or const name = (
    const fnMatch = trimmed.match(/(?:function\s+)([a-zA-Z_$][\w$]*)\s*[<(]/);
    if (fnMatch) {
      results.push({ name: fnMatch[1]!, category: "function" });
      continue;
    }

    // Arrow functions: const/let/var name = (...) => or const name = async (
    const arrowMatch = trimmed.match(
      /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
    );
    if (arrowMatch) {
      results.push({ name: arrowMatch[1]!, category: "function" });
      continue;
    }

    // Interfaces: interface Name
    const ifaceMatch = trimmed.match(/interface\s+([A-Z][\w]*)/);
    if (ifaceMatch) {
      results.push({ name: ifaceMatch[1]!, category: "interface" });
      continue;
    }

    // Type aliases: type Name =
    const typeAliasMatch = trimmed.match(/type\s+([A-Z][\w]*)\s*[<=]/);
    if (typeAliasMatch) {
      results.push({ name: typeAliasMatch[1]!, category: "type-alias" });
      continue;
    }

    // Enums: enum Name
    const enumMatch = trimmed.match(/enum\s+([A-Z][\w]*)/);
    if (enumMatch) {
      results.push({ name: enumMatch[1]!, category: "enum" });
      continue;
    }

    // Classes: class Name
    const classMatch = trimmed.match(/class\s+([A-Z][\w]*)/);
    if (classMatch) {
      results.push({ name: classMatch[1]!, category: "class" });
      continue;
    }

    // Constants: const SCREAMING_NAME =
    const constMatch = trimmed.match(
      /(?:const|let|var)\s+([A-Z][A-Z0-9_]+)\s*=/,
    );
    if (constMatch) {
      results.push({ name: constMatch[1]!, category: "constant" });
      continue;
    }

    // Variables: const/let/var name = (non-function assignments)
    const varMatch = trimmed.match(
      /(?:const|let|var)\s+([a-z_$][\w$]*)\s*[=:]/,
    );
    if (varMatch) {
      results.push({ name: varMatch[1]!, category: "variable" });
    }
  }
  return results;
}

function extractPython(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();

    const fnMatch = trimmed.match(/def\s+([a-zA-Z_]\w*)\s*\(/);
    if (fnMatch) {
      results.push({ name: fnMatch[1]!, category: "function" });
      continue;
    }

    const classMatch = trimmed.match(/class\s+([A-Z]\w*)/);
    if (classMatch) {
      results.push({ name: classMatch[1]!, category: "class" });
      continue;
    }

    // Module-level constants (SCREAMING_CASE at indent 0)
    if (line === trimmed) {
      const constMatch = trimmed.match(/^([A-Z][A-Z0-9_]+)\s*=/);
      if (constMatch) {
        results.push({ name: constMatch[1]!, category: "constant" });
      }
    }
  }
  return results;
}

function extractGo(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  let inConstBlock = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Track const/var ( ... ) blocks
    if (/^(?:const|var)\s*\(/.test(trimmed)) {
      inConstBlock = true;
      continue;
    }
    if (inConstBlock && trimmed === ")") {
      inConstBlock = false;
      continue;
    }

    // func (receiver) name( or func name(
    const fnMatch = trimmed.match(
      /func\s+(?:\([^)]+\)\s+)?([a-zA-Z_]\w*)\s*[<(]/,
    );
    if (fnMatch) {
      results.push({ name: fnMatch[1]!, category: "function" });
      continue;
    }

    // type Name struct
    const structMatch = trimmed.match(/type\s+([A-Z]\w*)\s+struct/);
    if (structMatch) {
      results.push({ name: structMatch[1]!, category: "class" });
      continue;
    }

    // type Name interface
    const goIfaceMatch = trimmed.match(/type\s+([A-Z]\w*)\s+interface/);
    if (goIfaceMatch) {
      results.push({ name: goIfaceMatch[1]!, category: "interface" });
      continue;
    }

    // const/var Name (inline) or identifiers inside const() blocks
    if (inConstBlock) {
      // Inside const( ... ) block: Name = value or Name Type = value
      const blockVarMatch = trimmed.match(/^([a-zA-Z_]\w*)\s/);
      if (blockVarMatch) {
        const name = blockVarMatch[1]!;
        if (
          /^[A-Z][A-Z0-9_]*$/.test(name) &&
          (name.includes("_") || name.length >= 4)
        ) {
          results.push({ name, category: "constant" });
        } else {
          results.push({ name, category: "variable" });
        }
      }
    } else {
      const varMatch = trimmed.match(/(?:const|var)\s+([a-zA-Z_]\w*)\s/);
      if (varMatch) {
        const name = varMatch[1]!;
        if (
          /^[A-Z][A-Z0-9_]*$/.test(name) &&
          (name.includes("_") || name.length >= 4)
        ) {
          results.push({ name, category: "constant" });
        } else {
          results.push({ name, category: "variable" });
        }
      }
    }
  }
  return results;
}

function extractRust(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();

    const fnMatch = trimmed.match(/fn\s+([a-z_]\w*)\s*[<(]/);
    if (fnMatch) {
      results.push({ name: fnMatch[1]!, category: "function" });
      continue;
    }

    // struct Name
    const rustStructMatch = trimmed.match(/struct\s+([A-Z]\w*)/);
    if (rustStructMatch) {
      results.push({ name: rustStructMatch[1]!, category: "class" });
      continue;
    }

    // enum Name
    const rustEnumMatch = trimmed.match(/enum\s+([A-Z]\w*)/);
    if (rustEnumMatch) {
      results.push({ name: rustEnumMatch[1]!, category: "enum" });
      continue;
    }

    // trait Name (analogous to interface)
    const rustTraitMatch = trimmed.match(/trait\s+([A-Z]\w*)/);
    if (rustTraitMatch) {
      results.push({ name: rustTraitMatch[1]!, category: "interface" });
      continue;
    }

    const constMatch = trimmed.match(/const\s+([A-Z_]\w*)\s*:/);
    if (constMatch) {
      results.push({ name: constMatch[1]!, category: "constant" });
    }
  }
  return results;
}

function extractJavaKotlin(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();

    // Interfaces: interface Name
    const javaIfaceMatch = trimmed.match(/interface\s+([A-Z]\w*)/);
    if (javaIfaceMatch) {
      results.push({ name: javaIfaceMatch[1]!, category: "interface" });
      continue;
    }

    // Enums: enum Name
    const javaEnumMatch = trimmed.match(/enum\s+([A-Z]\w*)/);
    if (javaEnumMatch) {
      results.push({ name: javaEnumMatch[1]!, category: "enum" });
      continue;
    }

    const classMatch = trimmed.match(/class\s+([A-Z]\w*)/);
    if (classMatch) {
      results.push({ name: classMatch[1]!, category: "class" });
      continue;
    }

    // Methods: visibility/modifiers followed by name(
    const methodMatch = trimmed.match(
      /(?:public|private|protected|static|void|fun|override)\s+(?:\w+\s+)*([a-zA-Z_]\w*)\s*\(/,
    );
    if (methodMatch) {
      results.push({ name: methodMatch[1]!, category: "function" });
      continue;
    }

    // Constants: static final TYPE NAME = or val NAME =
    const constMatch = trimmed.match(
      /(?:static\s+final|val)\s+(?:\w+\s+)?([A-Z][A-Z0-9_]+)\s*=/,
    );
    if (constMatch) {
      results.push({ name: constMatch[1]!, category: "constant" });
    }
  }
  return results;
}

function extractCSharp(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();

    const ifaceMatch = trimmed.match(/interface\s+([A-Za-z_]\w*)/);
    if (ifaceMatch) {
      results.push({ name: ifaceMatch[1]!, category: "interface" });
      continue;
    }

    const enumMatch = trimmed.match(/enum\s+([A-Za-z_]\w*)/);
    if (enumMatch) {
      results.push({ name: enumMatch[1]!, category: "enum" });
      continue;
    }

    const delegateMatch = trimmed.match(/delegate\s+\w+\s+([A-Za-z_]\w*)/);
    if (delegateMatch) {
      results.push({ name: delegateMatch[1]!, category: "type-alias" });
      continue;
    }

    const classMatch = trimmed.match(
      /(?:class|struct|record)\s+([A-Za-z_]\w*)/,
    );
    if (classMatch) {
      results.push({ name: classMatch[1]!, category: "class" });
      continue;
    }

    const constMatch = trimmed.match(
      /(?:const|static\s+readonly)\s+\w+\s+([A-Z][A-Z0-9_]+)\s*=/,
    );
    if (constMatch) {
      results.push({ name: constMatch[1]!, category: "constant" });
      continue;
    }

    const methodMatch = trimmed.match(
      /(?:public|private|protected|internal|static|virtual|override|async)\s+(?:\w+\s+)*([a-zA-Z_]\w*)\s*[<(]/,
    );
    if (methodMatch) {
      results.push({ name: methodMatch[1]!, category: "function" });
    }
  }
  return results;
}

function extractRuby(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();

    const defMatch = trimmed.match(/^def\s+([a-zA-Z_]\w*)/);
    if (defMatch) {
      results.push({ name: defMatch[1]!, category: "function" });
      continue;
    }

    const classMatch = trimmed.match(/^class\s+([A-Z]\w*)/);
    if (classMatch) {
      results.push({ name: classMatch[1]!, category: "class" });
      continue;
    }

    const moduleMatch = trimmed.match(/^module\s+([A-Z]\w*)/);
    if (moduleMatch) {
      results.push({ name: moduleMatch[1]!, category: "interface" });
      continue;
    }

    if (line === trimmed) {
      const constMatch = trimmed.match(/^([A-Z][A-Z0-9_]+)\s*=/);
      if (constMatch) {
        results.push({ name: constMatch[1]!, category: "constant" });
      }
    }
  }
  return results;
}

function extractPhp(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();

    const ifaceMatch = trimmed.match(/interface\s+([A-Za-z_]\w*)/);
    if (ifaceMatch) {
      results.push({ name: ifaceMatch[1]!, category: "interface" });
      continue;
    }

    const enumMatch = trimmed.match(/enum\s+([A-Za-z_]\w*)/);
    if (enumMatch) {
      results.push({ name: enumMatch[1]!, category: "enum" });
      continue;
    }

    const traitMatch = trimmed.match(/trait\s+([A-Za-z_]\w*)/);
    if (traitMatch) {
      results.push({ name: traitMatch[1]!, category: "type-alias" });
      continue;
    }

    const classMatch = trimmed.match(/class\s+([A-Za-z_]\w*)/);
    if (classMatch) {
      results.push({ name: classMatch[1]!, category: "class" });
      continue;
    }

    const fnMatch = trimmed.match(/function\s+([a-zA-Z_]\w*)\s*\(/);
    if (fnMatch) {
      results.push({ name: fnMatch[1]!, category: "function" });
      continue;
    }

    const constMatch = trimmed.match(
      /(?:const\s+([A-Z][A-Z0-9_]+)|define\s*\(\s*['"]([A-Z][A-Z0-9_]+))/,
    );
    if (constMatch) {
      results.push({
        name: (constMatch[1] ?? constMatch[2])!,
        category: "constant",
      });
    }
  }
  return results;
}

function extractSwift(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();

    const protoMatch = trimmed.match(/protocol\s+([A-Za-z_]\w*)/);
    if (protoMatch) {
      results.push({ name: protoMatch[1]!, category: "interface" });
      continue;
    }

    const enumMatch = trimmed.match(/enum\s+([A-Za-z_]\w*)/);
    if (enumMatch) {
      results.push({ name: enumMatch[1]!, category: "enum" });
      continue;
    }

    const typealiasMatch = trimmed.match(/typealias\s+([A-Za-z_]\w*)/);
    if (typealiasMatch) {
      results.push({ name: typealiasMatch[1]!, category: "type-alias" });
      continue;
    }

    const classMatch = trimmed.match(/(?:class|struct)\s+([A-Za-z_]\w*)/);
    if (classMatch) {
      results.push({ name: classMatch[1]!, category: "class" });
      continue;
    }

    const funcMatch = trimmed.match(/func\s+([a-zA-Z_]\w*)\s*[<(]/);
    if (funcMatch) {
      results.push({ name: funcMatch[1]!, category: "function" });
    }
  }
  return results;
}

function extractDart(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();

    const mixinMatch = trimmed.match(/mixin\s+([A-Za-z_]\w*)/);
    if (mixinMatch) {
      results.push({ name: mixinMatch[1]!, category: "interface" });
      continue;
    }

    const enumMatch = trimmed.match(/enum\s+([A-Za-z_]\w*)/);
    if (enumMatch) {
      results.push({ name: enumMatch[1]!, category: "enum" });
      continue;
    }

    const typedefMatch = trimmed.match(/typedef\s+([A-Za-z_]\w*)/);
    if (typedefMatch) {
      results.push({ name: typedefMatch[1]!, category: "type-alias" });
      continue;
    }

    const classMatch = trimmed.match(/class\s+([A-Za-z_]\w*)/);
    if (classMatch) {
      results.push({ name: classMatch[1]!, category: "class" });
      continue;
    }

    const constMatch = trimmed.match(
      /(?:const|final)\s+\w+\s+([A-Z][A-Z0-9_]+)\s*=/,
    );
    if (constMatch) {
      results.push({ name: constMatch[1]!, category: "constant" });
      continue;
    }

    // Top-level functions
    if (line === trimmed) {
      const fnMatch = trimmed.match(
        /^(?:void|int|String|bool|double|Future|dynamic|[\w<>]+)\s+([a-zA-Z_]\w*)\s*\(/,
      );
      if (fnMatch) {
        results.push({ name: fnMatch[1]!, category: "function" });
      }
    }
  }
  return results;
}

function extractScala(lines: readonly string[]): ExtractedIdentifier[] {
  const results: ExtractedIdentifier[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();

    const traitMatch = trimmed.match(/^trait\s+([A-Za-z_]\w*)/);
    if (traitMatch) {
      results.push({ name: traitMatch[1]!, category: "interface" });
      continue;
    }

    const typeMatch = trimmed.match(/^type\s+([A-Za-z_]\w*)\s*[=[]/);
    if (typeMatch) {
      results.push({ name: typeMatch[1]!, category: "type-alias" });
      continue;
    }

    const classMatch = trimmed.match(
      /^(?:case\s+)?(?:class|object)\s+([A-Za-z_]\w*)/,
    );
    if (classMatch) {
      results.push({ name: classMatch[1]!, category: "class" });
      continue;
    }

    const defMatch = trimmed.match(/^def\s+([a-zA-Z_]\w*)/);
    if (defMatch) {
      results.push({ name: defMatch[1]!, category: "function" });
      continue;
    }

    const constMatch = trimmed.match(/^val\s+([A-Z][A-Z0-9_]+)\s*[=:]/);
    if (constMatch) {
      results.push({ name: constMatch[1]!, category: "constant" });
    }
  }
  return results;
}

// ─── Sampling + aggregation ────────────────────────────────────────

/** Select a deterministic stride-based sample of files. */
const sampleFiles = (files: readonly IndexedFile[]): IndexedFile[] => {
  // Filter out secondary paths (tests, fixtures, etc.)
  const primary = files.filter((f) => !isSecondaryPath(f.relativePath));
  if (primary.length === 0) return [];
  if (primary.length <= MAX_SAMPLE_FILES) return [...primary];

  const stride = primary.length / MAX_SAMPLE_FILES;
  const sampled: IndexedFile[] = [];
  for (let i = 0; i < MAX_SAMPLE_FILES; i++) {
    sampled.push(primary[Math.floor(i * stride)]!);
  }
  return sampled;
};

const buildPattern = (
  category: NamingCategory,
  counts: Map<CaseStyle, number>,
  total: number,
): NamingPattern | undefined => {
  if (total === 0) return undefined;

  let dominant: CaseStyle = "mixed";
  let maxCount = 0;
  const breakdown: Record<CaseStyle, number> = {
    camelCase: 0,
    PascalCase: 0,
    snake_case: 0,
    "kebab-case": 0,
    SCREAMING_SNAKE_CASE: 0,
    flatcase: 0,
    mixed: 0,
  };

  for (const [style, count] of counts) {
    breakdown[style] = count;
    if (count > maxCount) {
      maxCount = count;
      dominant = style;
    }
  }

  return {
    category,
    dominantStyle: dominant,
    percentage: Math.round((maxCount / total) * 1000) / 10,
    sampleSize: total,
    breakdown,
  };
};

/** Analyze code identifier naming patterns via sampled file reads. */
export const analyzeCodeNaming = async (
  _rootPath: string,
  index: FileIndex,
): Promise<NamingPattern[]> => {
  // Group files by language extractor
  const filesByExtractor = new Map<
    string,
    {
      files: IndexedFile[];
      extractor: (lines: readonly string[]) => ExtractedIdentifier[];
    }
  >();

  for (const [ext, extractor] of LANGUAGE_EXTRACTORS) {
    const files = [...index.getByExtension(ext)];
    if (files.length === 0) continue;

    const key = extractor.name;
    const existing = filesByExtractor.get(key);
    if (existing) {
      existing.files.push(...files);
    } else {
      filesByExtractor.set(key, { files: [...files], extractor });
    }
  }

  // Sample and extract from each language group
  const allIdentifiers: ExtractedIdentifier[] = [];

  for (const { files, extractor } of filesByExtractor.values()) {
    const sampled = sampleFiles(files);
    const contents = await mapWithConcurrency(
      sampled,
      READ_CONCURRENCY,
      async (file) => ({
        content: await readText(file.path),
        file,
      }),
    );

    for (const { content } of contents) {
      if (!content) continue;
      const lines = content.split("\n");
      const ids = extractor(lines);
      allIdentifiers.push(...ids);
    }
  }

  // Aggregate by category
  const categoryCounts = new Map<NamingCategory, Map<CaseStyle, number>>();
  const categoryTotals = new Map<NamingCategory, number>();

  for (const id of allIdentifiers) {
    const style = classifyCase(id.name);
    if (!style) continue;

    // Skip single-word flatcase identifiers — they're ambiguous in code.
    // "app", "get", "send" could be camelCase (JS) or snake_case (Python/Rust).
    // Only multi-word identifiers reliably indicate a convention.
    if (style === "flatcase") continue;

    const counts =
      categoryCounts.get(id.category) ?? new Map<CaseStyle, number>();
    counts.set(style, (counts.get(style) ?? 0) + 1);
    categoryCounts.set(id.category, counts);
    categoryTotals.set(id.category, (categoryTotals.get(id.category) ?? 0) + 1);
  }

  const patterns: NamingPattern[] = [];
  for (const [category, counts] of categoryCounts) {
    const total = categoryTotals.get(category) ?? 0;
    const pattern = buildPattern(category, counts, total);
    if (pattern) patterns.push(pattern);
  }

  return patterns;
};
