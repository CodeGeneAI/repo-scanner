import { fileURLToPath } from "url";
import { Language, Parser, type Tree } from "web-tree-sitter";

/** Promise-based init guard to prevent double-init race condition. */
let initPromise: Promise<void> | null = null;

const languageCache = new Map<string, InstanceType<typeof Language>>();
const languageLoadPromises = new Map<
  string,
  Promise<InstanceType<typeof Language>>
>();
const parserCache = new Map<string, Parser>();

const resolveModuleAssetPath = (specifier: string): string =>
  fileURLToPath(import.meta.resolve(specifier));

const TREE_SITTER_RUNTIME_WASM = resolveModuleAssetPath(
  "web-tree-sitter/web-tree-sitter.wasm",
);

interface GrammarModuleSpec {
  readonly cacheKey: string;
  readonly moduleSpecifier: string;
}

const resolveGrammarWasmPath = (grammar: GrammarModuleSpec): string =>
  resolveModuleAssetPath(grammar.moduleSpecifier);

/** Map file extensions to tree-sitter grammar packages and wasm assets. */
const EXT_TO_GRAMMAR: ReadonlyMap<string, GrammarModuleSpec> = new Map([
  [
    ".ts",
    {
      cacheKey: "tree-sitter-typescript",
      moduleSpecifier: "tree-sitter-typescript/tree-sitter-typescript.wasm",
    },
  ],
  [
    ".tsx",
    {
      cacheKey: "tree-sitter-typescript-tsx",
      moduleSpecifier: "tree-sitter-typescript/tree-sitter-tsx.wasm",
    },
  ],
  [
    ".js",
    {
      cacheKey: "tree-sitter-typescript",
      moduleSpecifier: "tree-sitter-typescript/tree-sitter-typescript.wasm",
    },
  ],
  [
    ".jsx",
    {
      cacheKey: "tree-sitter-typescript-tsx",
      moduleSpecifier: "tree-sitter-typescript/tree-sitter-tsx.wasm",
    },
  ],
  [
    ".mjs",
    {
      cacheKey: "tree-sitter-typescript",
      moduleSpecifier: "tree-sitter-typescript/tree-sitter-typescript.wasm",
    },
  ],
  [
    ".cjs",
    {
      cacheKey: "tree-sitter-typescript",
      moduleSpecifier: "tree-sitter-typescript/tree-sitter-typescript.wasm",
    },
  ],
  [
    ".py",
    {
      cacheKey: "tree-sitter-python",
      moduleSpecifier: "tree-sitter-python/tree-sitter-python.wasm",
    },
  ],
  [
    ".go",
    {
      cacheKey: "tree-sitter-go",
      moduleSpecifier: "tree-sitter-go/tree-sitter-go.wasm",
    },
  ],
  [
    ".rs",
    {
      cacheKey: "tree-sitter-rust",
      moduleSpecifier: "tree-sitter-rust/tree-sitter-rust.wasm",
    },
  ],
  [
    ".cs",
    {
      cacheKey: "tree-sitter-c-sharp",
      moduleSpecifier: "tree-sitter-c-sharp/tree-sitter-c_sharp.wasm",
    },
  ],
  [
    ".java",
    {
      cacheKey: "tree-sitter-java",
      moduleSpecifier: "tree-sitter-java/tree-sitter-java.wasm",
    },
  ],
]);

/** Extensions supported by the AST parser. */
export const SUPPORTED_EXTENSIONS = new Set(EXT_TO_GRAMMAR.keys());

export interface ParseResult {
  readonly tree: Tree;
  readonly lang: InstanceType<typeof Language>;
}

/** Ensure Parser WASM runtime is initialized (race-safe). */
const ensureInit = (): Promise<void> => {
  if (!initPromise) {
    initPromise = Parser.init({
      locateFile(fileName: string) {
        return fileName === "web-tree-sitter.wasm"
          ? TREE_SITTER_RUNTIME_WASM
          : fileName;
      },
    });
  }
  return initPromise;
};

/** Load a language grammar, deduplicating concurrent loads. */
const loadLanguage = async (
  grammar: GrammarModuleSpec,
): Promise<InstanceType<typeof Language>> => {
  const cached = languageCache.get(grammar.cacheKey);
  if (cached) return cached;

  // Deduplicate concurrent loads of the same language
  const existing = languageLoadPromises.get(grammar.cacheKey);
  if (existing) return existing;

  const promise = Language.load(resolveGrammarWasmPath(grammar)).then(
    (lang) => {
      languageCache.set(grammar.cacheKey, lang);
      languageLoadPromises.delete(grammar.cacheKey);
      return lang;
    },
  );
  languageLoadPromises.set(grammar.cacheKey, promise);
  return promise;
};

/** Get or create a cached parser for a given language. */
const getParser = (
  grammar: GrammarModuleSpec,
  lang: InstanceType<typeof Language>,
): Parser => {
  const cached = parserCache.get(grammar.cacheKey);
  if (cached) return cached;

  const parser = new Parser();
  parser.setLanguage(lang);
  parserCache.set(grammar.cacheKey, parser);
  return parser;
};

/**
 * Parse a source string using the appropriate tree-sitter grammar.
 * Returns null for unsupported extensions or parse failures.
 */
export const parseFile = async (
  source: string,
  ext: string,
): Promise<ParseResult | null> => {
  const grammar = EXT_TO_GRAMMAR.get(ext);
  if (!grammar) return null;

  try {
    await ensureInit();
    const lang = await loadLanguage(grammar);
    const parser = getParser(grammar, lang);
    const tree = parser.parse(source);
    if (!tree) return null;
    return { tree, lang };
  } catch {
    return null;
  }
};
