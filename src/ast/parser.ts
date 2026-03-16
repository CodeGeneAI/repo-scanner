import path from "path";
import { Language, Parser, type Tree } from "web-tree-sitter";

/** Promise-based init guard to prevent double-init race condition. */
let initPromise: Promise<void> | null = null;

const languageCache = new Map<string, InstanceType<typeof Language>>();
const languageLoadPromises = new Map<
  string,
  Promise<InstanceType<typeof Language>>
>();
const parserCache = new Map<string, Parser>();

const WASM_DIR = path.resolve(
  __dirname,
  "../../node_modules/tree-sitter-wasms/out",
);

/** Map file extensions to tree-sitter WASM grammar filenames. */
const EXT_TO_WASM: ReadonlyMap<string, string> = new Map([
  [".ts", "tree-sitter-typescript.wasm"],
  [".tsx", "tree-sitter-typescript.wasm"],
  [".js", "tree-sitter-typescript.wasm"],
  [".jsx", "tree-sitter-typescript.wasm"],
  [".mjs", "tree-sitter-typescript.wasm"],
  [".cjs", "tree-sitter-typescript.wasm"],
  [".py", "tree-sitter-python.wasm"],
  [".go", "tree-sitter-go.wasm"],
  [".rs", "tree-sitter-rust.wasm"],
  [".cs", "tree-sitter-c_sharp.wasm"],
  [".java", "tree-sitter-java.wasm"],
]);

/** Extensions supported by the AST parser. */
export const SUPPORTED_EXTENSIONS = new Set(EXT_TO_WASM.keys());

export interface ParseResult {
  readonly tree: Tree;
  readonly lang: InstanceType<typeof Language>;
}

/** Ensure Parser WASM runtime is initialized (race-safe). */
const ensureInit = (): Promise<void> => {
  if (!initPromise) {
    initPromise = Parser.init();
  }
  return initPromise;
};

/** Load a language grammar, deduplicating concurrent loads. */
const loadLanguage = async (
  wasmFile: string,
): Promise<InstanceType<typeof Language>> => {
  const cached = languageCache.get(wasmFile);
  if (cached) return cached;

  // Deduplicate concurrent loads of the same language
  const existing = languageLoadPromises.get(wasmFile);
  if (existing) return existing;

  const promise = Language.load(path.join(WASM_DIR, wasmFile)).then((lang) => {
    languageCache.set(wasmFile, lang);
    languageLoadPromises.delete(wasmFile);
    return lang;
  });
  languageLoadPromises.set(wasmFile, promise);
  return promise;
};

/** Get or create a cached parser for a given language. */
const getParser = (
  wasmFile: string,
  lang: InstanceType<typeof Language>,
): Parser => {
  const cached = parserCache.get(wasmFile);
  if (cached) return cached;

  const parser = new Parser();
  parser.setLanguage(lang);
  parserCache.set(wasmFile, parser);
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
  const wasmFile = EXT_TO_WASM.get(ext);
  if (!wasmFile) return null;

  try {
    await ensureInit();
    const lang = await loadLanguage(wasmFile);
    const parser = getParser(wasmFile, lang);
    const tree = parser.parse(source);
    if (!tree) return null;
    return { tree, lang };
  } catch {
    return null;
  }
};
