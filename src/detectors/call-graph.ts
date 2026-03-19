import path from "path";
import type { CallGraph, CallGraphEdge, CallGraphNode } from "../types";
import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult } from "./types";

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
]);

interface ParsedFunction {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly line: number;
  readonly body: string;
}

type SymbolImportMap = Map<string, string>;

const FUNCTION_DECLARATIONS: readonly RegExp[] = [
  /\bfunction\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/g,
  /\b(?:public|private|protected|static|async\s+)*([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/g,
  /\bdef\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*:/g,
  /\bfunc\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/g,
  /\bfn\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*(?:->\s*[^\s{]+\s*)?\{/g,
];

const CALL_EXPRESSIONS = /\b([A-Za-z_]\w*)\s*\(/g;
const TS_IMPORT_BRACE_REGEX =
  /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
const TS_IMPORT_DEFAULT_REGEX =
  /import\s+([A-Za-z_]\w*)\s+from\s+["']([^"']+)["']/g;
const MAX_CALL_GRAPH_NODES = 5000;
const MAX_CALL_GRAPH_EDGES = 10000;

const computeLineNumber = (content: string, index: number): number => {
  return content.slice(0, index).split("\n").length;
};

const parseFunctions = (content: string, file: string): ParsedFunction[] => {
  const parsed: ParsedFunction[] = [];

  for (const declarationPattern of FUNCTION_DECLARATIONS) {
    declarationPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = declarationPattern.exec(content)) !== null) {
      const name = match[1];
      if (!name) continue;
      const start = match.index;
      const line = computeLineNumber(content, start);
      const bodyStart = declarationPattern.lastIndex;
      const bodyEnd = content.indexOf("\n}\n", bodyStart);
      const fallbackEnd = content.indexOf("\n\n", bodyStart);
      const end =
        bodyEnd >= 0
          ? bodyEnd
          : fallbackEnd >= 0
            ? fallbackEnd
            : content.length;
      const body = content.slice(bodyStart, end);
      parsed.push({
        id: `${file}:${name}:${line}`,
        name,
        file,
        line,
        body,
      });
    }
  }

  const deduped = new Map<string, ParsedFunction>();
  for (const fn of parsed) {
    if (!deduped.has(fn.id)) {
      deduped.set(fn.id, fn);
    }
  }

  return [...deduped.values()].sort((a, b) => a.line - b.line);
};

const parseCalls = (body: string): string[] => {
  const calls = new Set<string>();
  CALL_EXPRESSIONS.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CALL_EXPRESSIONS.exec(body)) !== null) {
    const callee = match[1];
    if (!callee) continue;
    if (["if", "for", "while", "switch", "return", "catch"].includes(callee)) {
      continue;
    }
    calls.add(callee);
  }
  return [...calls];
};

const resolveRelativeImportPath = (
  importerFile: string,
  importPath: string,
): string | null => {
  if (!importPath.startsWith(".")) return null;

  const importerDir = path.posix.dirname(importerFile);
  const rawCandidate = path.posix.normalize(
    path.posix.join(importerDir, importPath),
  );
  const candidates = [
    rawCandidate,
    `${rawCandidate}.ts`,
    `${rawCandidate}.tsx`,
    `${rawCandidate}.js`,
    `${rawCandidate}.jsx`,
    `${rawCandidate}/index.ts`,
    `${rawCandidate}/index.tsx`,
    `${rawCandidate}/index.js`,
    `${rawCandidate}/index.jsx`,
  ];

  return candidates[0] ?? null;
};

const parseTsImports = (content: string, file: string): SymbolImportMap => {
  const imports: SymbolImportMap = new Map();

  TS_IMPORT_BRACE_REGEX.lastIndex = 0;
  let braceMatch: RegExpExecArray | null;
  while ((braceMatch = TS_IMPORT_BRACE_REGEX.exec(content)) !== null) {
    const names = braceMatch[1]
      ?.split(",")
      .map((part) =>
        part
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim(),
      )
      .filter((name): name is string => Boolean(name));
    const source = braceMatch[2];
    if (!source || !names || names.length === 0) continue;
    const resolvedPath = resolveRelativeImportPath(file, source);
    if (!resolvedPath) continue;
    for (const name of names) {
      imports.set(name, resolvedPath);
    }
  }

  TS_IMPORT_DEFAULT_REGEX.lastIndex = 0;
  let defaultMatch: RegExpExecArray | null;
  while ((defaultMatch = TS_IMPORT_DEFAULT_REGEX.exec(content)) !== null) {
    const importedName = defaultMatch[1];
    const source = defaultMatch[2];
    if (!importedName || !source) continue;
    const resolvedPath = resolveRelativeImportPath(file, source);
    if (!resolvedPath) continue;
    imports.set(importedName, resolvedPath);
  }

  return imports;
};

const buildCallGraph = async (index: FileIndex): Promise<CallGraph> => {
  const parsedFunctions: ParsedFunction[] = [];
  const importsByFile = new Map<string, SymbolImportMap>();

  for (const file of index.all()) {
    if (!SUPPORTED_EXTENSIONS.has(file.ext)) continue;
    const content = await readText(file.path);
    if (!content) continue;
    parsedFunctions.push(...parseFunctions(content, file.relativePath));

    if (
      file.ext === ".ts" ||
      file.ext === ".tsx" ||
      file.ext === ".js" ||
      file.ext === ".jsx"
    ) {
      importsByFile.set(
        file.relativePath,
        parseTsImports(content, file.relativePath),
      );
    }
  }

  const nodes: CallGraphNode[] = parsedFunctions.map((fn) => ({
    id: fn.id,
    name: fn.name,
    file: fn.file,
    line: fn.line,
  }));

  const functionByName = new Map<string, ParsedFunction[]>();
  for (const fn of parsedFunctions) {
    const list = functionByName.get(fn.name) ?? [];
    list.push(fn);
    functionByName.set(fn.name, list);
  }

  const edges: CallGraphEdge[] = [];
  const warnings: string[] = [];
  for (const caller of parsedFunctions) {
    const calls = parseCalls(caller.body);
    const importedSymbols = importsByFile.get(caller.file);

    for (const calleeName of calls) {
      let possibleCallees = functionByName.get(calleeName);
      const importedPath = importedSymbols?.get(calleeName);
      if (importedPath && possibleCallees) {
        const importedMatches = possibleCallees.filter(
          (fn) =>
            fn.file === importedPath ||
            fn.file.startsWith(`${importedPath}.`) ||
            fn.file.startsWith(`${importedPath}/`),
        );
        if (importedMatches.length > 0) {
          possibleCallees = importedMatches;
        }
      }
      if (!possibleCallees || possibleCallees.length === 0) continue;
      const callee =
        possibleCallees.find((item) => item.file === caller.file) ??
        possibleCallees[0]!;
      edges.push({
        callerId: caller.id,
        calleeId: callee.id,
        line: caller.line,
        caller: { name: caller.name, file: caller.file },
        callee: { name: callee.name, file: callee.file },
      });
      if (edges.length >= MAX_CALL_GRAPH_EDGES) {
        warnings.push(
          `call-graph edges truncated at ${MAX_CALL_GRAPH_EDGES} to preserve performance`,
        );
        return {
          nodes: nodes.slice(0, MAX_CALL_GRAPH_NODES),
          edges,
          truncated: true,
          warnings,
        };
      }
    }
  }

  const truncated = nodes.length > MAX_CALL_GRAPH_NODES;
  if (truncated) {
    warnings.push(
      `call-graph nodes truncated at ${MAX_CALL_GRAPH_NODES} to preserve performance`,
    );
  }
  return {
    nodes: nodes.slice(0, MAX_CALL_GRAPH_NODES),
    edges,
    truncated: truncated || warnings.length > 0,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
};

registerDetector({
  id: "call-graph",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const callGraph = await buildCallGraph(index);

    return {
      detectorId: "call-graph",
      findings: callGraph.edges.map((edge) => ({
        value: `${edge.caller.file}:${edge.caller.name}->${edge.callee.file}:${edge.callee.name}`,
        confidence: 0.6,
        evidence: ["heuristic-call-graph"],
      })),
      metadata: {
        callGraph,
      },
    };
  },
});

export { buildCallGraph, parseCalls, parseFunctions, parseTsImports };
