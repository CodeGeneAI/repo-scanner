import type { DeadExport } from "../../types";

type ExportType = DeadExport["exportType"];

export interface RawExport {
  symbol: string;
  line: number;
  exportType: ExportType;
}

// ─── TypeScript / JavaScript ─────────────────────────────────────────

const TS_EXPORT_PATTERNS: {
  regex: RegExp;
  type: ExportType;
  group: number;
}[] = [
  {
    regex: /^export\s+function\s+(\w+)/,
    type: "function",
    group: 1,
  },
  {
    regex: /^export\s+const\s+(\w+)/,
    type: "const",
    group: 1,
  },
  {
    regex: /^export\s+let\s+(\w+)/,
    type: "const",
    group: 1,
  },
  {
    regex: /^export\s+var\s+(\w+)/,
    type: "const",
    group: 1,
  },
  {
    regex: /^export\s+class\s+(\w+)/,
    type: "class",
    group: 1,
  },
  {
    regex: /^export\s+enum\s+(\w+)/,
    type: "enum",
    group: 1,
  },
  {
    regex: /^export\s+interface\s+(\w+)/,
    type: "interface",
    group: 1,
  },
  {
    regex: /^export\s+type\s+(\w+)/,
    type: "type",
    group: 1,
  },
  {
    regex: /^export\s+default\s+(?:function|class)\s+(\w+)/,
    type: "function",
    group: 1,
  },
  {
    regex: /^export\s+async\s+function\s+(\w+)/,
    type: "function",
    group: 1,
  },
];

export const extractTsExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimStart();
    for (const pattern of TS_EXPORT_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (match) {
        results.push({
          symbol: match[pattern.group]!,
          line: i + 1,
          exportType: pattern.type,
        });
        break;
      }
    }
    // Handle: export { name1, name2 }
    const braceExport = /^export\s+\{([^}]+)\}/.exec(line);
    if (braceExport) {
      const names = braceExport[1]!
        .split(",")
        .map((n) =>
          n
            .trim()
            .split(/\s+as\s+/)[0]!
            .trim(),
        )
        .filter((n) => n.length > 0);
      for (const name of names) {
        results.push({ symbol: name, line: i + 1, exportType: "other" });
      }
    }
  }
  return results;
};

// ─── Go ──────────────────────────────────────────────────────────────

const GO_EXPORT_PATTERNS: { regex: RegExp; type: ExportType }[] = [
  { regex: /^func\s+([A-Z]\w*)/, type: "function" },
  { regex: /^type\s+([A-Z]\w*)/, type: "type" },
  { regex: /^var\s+([A-Z]\w*)/, type: "const" },
  { regex: /^const\s+([A-Z]\w*)/, type: "const" },
];

export const extractGoExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of GO_EXPORT_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (match) {
        results.push({
          symbol: match[1]!,
          line: i + 1,
          exportType: pattern.type,
        });
        break;
      }
    }
  }
  return results;
};

// ─── Rust ────────────────────────────────────────────────────────────

const RUST_EXPORT_REGEX =
  /^pub\s+(?:async\s+)?(?:unsafe\s+)?(fn|struct|enum|trait|const|type|mod)\s+(\w+)/;

export const extractRustExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    // Skip indented lines — pub items inside impl blocks are methods, not top-level exports
    if (raw.startsWith("    ") || raw.startsWith("\t")) continue;
    const match = RUST_EXPORT_REGEX.exec(raw.trimStart());
    if (match) {
      const kind = match[1]!;
      const typeMap: Record<string, ExportType> = {
        fn: "function",
        struct: "class",
        enum: "enum",
        trait: "interface",
        const: "const",
        type: "type",
        mod: "other",
      };
      results.push({
        symbol: match[2]!,
        line: i + 1,
        exportType: typeMap[kind] ?? "other",
      });
    }
  }
  return results;
};

// ─── Python ──────────────────────────────────────────────────────────

export const extractPythonExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Top-level def (no leading whitespace, skip _private)
    const defMatch = /^def\s+([a-zA-Z]\w*)\s*\(/.exec(line);
    if (defMatch && !defMatch[1]!.startsWith("_")) {
      results.push({
        symbol: defMatch[1]!,
        line: i + 1,
        exportType: "function",
      });
    }
    // Top-level class (no leading whitespace, skip _private)
    const classMatch = /^class\s+([a-zA-Z]\w*)/.exec(line);
    if (classMatch && !classMatch[1]!.startsWith("_")) {
      results.push({
        symbol: classMatch[1]!,
        line: i + 1,
        exportType: "class",
      });
    }
  }
  return results;
};

// ─── Java / Kotlin ───────────────────────────────────────────────────

const JAVA_EXPORT_REGEX =
  /public\s+(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(class|interface|enum|record)\s+(\w+)/;

export const extractJavaExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = JAVA_EXPORT_REGEX.exec(lines[i]!);
    if (match) {
      const kind = match[1]!;
      const typeMap: Record<string, ExportType> = {
        class: "class",
        interface: "interface",
        enum: "enum",
        record: "class",
      };
      results.push({
        symbol: match[2]!,
        line: i + 1,
        exportType: typeMap[kind] ?? "other",
      });
    }
  }
  return results;
};

// ─── Ruby ────────────────────────────────────────────────────────────

// ─── C# ──────────────────────────────────────────────────────────────

const CSHARP_EXPORT_REGEX =
  /public\s+(?:static\s+)?(?:partial\s+)?(?:abstract\s+)?(?:sealed\s+)?(class|interface|enum|struct|record|delegate)\s+(\w+)/;

export const extractCSharpExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = CSHARP_EXPORT_REGEX.exec(lines[i]!);
    if (match) {
      const kind = match[1]!;
      const typeMap: Record<string, ExportType> = {
        class: "class",
        interface: "interface",
        enum: "enum",
        struct: "class",
        record: "class",
        delegate: "type",
      };
      results.push({
        symbol: match[2]!,
        line: i + 1,
        exportType: typeMap[kind] ?? "other",
      });
    }
  }
  return results;
};

// ─── F# ──────────────────────────────────────────────────────────────

export const extractFSharpExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // let-bound values/functions at module level
    const letMatch = /^let\s+(\w+)/.exec(line);
    if (letMatch) {
      results.push({
        symbol: letMatch[1]!,
        line: i + 1,
        exportType: "function",
      });
    }
    // type definitions
    const typeMatch = /^type\s+(\w+)/.exec(line);
    if (typeMatch) {
      results.push({
        symbol: typeMatch[1]!,
        line: i + 1,
        exportType: "type",
      });
    }
    // module definitions
    const moduleMatch = /^module\s+(\w+)/.exec(line);
    if (moduleMatch) {
      results.push({
        symbol: moduleMatch[1]!,
        line: i + 1,
        exportType: "other",
      });
    }
  }
  return results;
};

// ─── VB.NET ──────────────────────────────────────────────────────────

const VBNET_EXPORT_REGEX =
  /Public\s+(?:Shared\s+)?(?:Partial\s+)?(?:MustInherit\s+)?(?:NotInheritable\s+)?(Class|Interface|Enum|Structure|Module)\s+(\w+)/i;

export const extractVbNetExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = VBNET_EXPORT_REGEX.exec(lines[i]!);
    if (match) {
      const kind = match[1]!.toLowerCase();
      const typeMap: Record<string, ExportType> = {
        class: "class",
        interface: "interface",
        enum: "enum",
        structure: "class",
        module: "other",
      };
      results.push({
        symbol: match[2]!,
        line: i + 1,
        exportType: typeMap[kind] ?? "other",
      });
    }
  }
  return results;
};

// ─── PHP ────────────────────────────────────────────────────────────

export const extractPhpExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimStart();
    const classMatch =
      /^(?:abstract\s+)?class\s+(\w+)/.exec(line) ??
      /^(?:final\s+)?class\s+(\w+)/.exec(line);
    if (classMatch) {
      results.push({
        symbol: classMatch[1]!,
        line: i + 1,
        exportType: "class",
      });
      continue;
    }
    const ifaceMatch = /^interface\s+(\w+)/.exec(line);
    if (ifaceMatch) {
      results.push({
        symbol: ifaceMatch[1]!,
        line: i + 1,
        exportType: "interface",
      });
      continue;
    }
    const enumMatch = /^enum\s+(\w+)/.exec(line);
    if (enumMatch) {
      results.push({
        symbol: enumMatch[1]!,
        line: i + 1,
        exportType: "enum",
      });
      continue;
    }
    const traitMatch = /^trait\s+(\w+)/.exec(line);
    if (traitMatch) {
      results.push({
        symbol: traitMatch[1]!,
        line: i + 1,
        exportType: "other",
      });
      continue;
    }
    const fnMatch = /^function\s+(\w+)/.exec(line);
    if (fnMatch) {
      results.push({
        symbol: fnMatch[1]!,
        line: i + 1,
        exportType: "function",
      });
    }
  }
  return results;
};

// ─── Swift ──────────────────────────────────────────────────────────

export const extractSwiftExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimStart();
    const match = /^(?:public|open)\s+(?:class|struct|actor)\s+(\w+)/.exec(
      line,
    );
    if (match) {
      results.push({ symbol: match[1]!, line: i + 1, exportType: "class" });
      continue;
    }
    const enumMatch = /^(?:public|open)\s+enum\s+(\w+)/.exec(line);
    if (enumMatch) {
      results.push({
        symbol: enumMatch[1]!,
        line: i + 1,
        exportType: "enum",
      });
      continue;
    }
    const protoMatch = /^(?:public|open)\s+protocol\s+(\w+)/.exec(line);
    if (protoMatch) {
      results.push({
        symbol: protoMatch[1]!,
        line: i + 1,
        exportType: "interface",
      });
      continue;
    }
    const funcMatch = /^(?:public|open)\s+func\s+(\w+)/.exec(line);
    if (funcMatch) {
      results.push({
        symbol: funcMatch[1]!,
        line: i + 1,
        exportType: "function",
      });
      continue;
    }
    const typeMatch = /^(?:public|open)\s+typealias\s+(\w+)/.exec(line);
    if (typeMatch) {
      results.push({
        symbol: typeMatch[1]!,
        line: i + 1,
        exportType: "type",
      });
      continue;
    }
    const constMatch = /^(?:public|open)\s+(?:let|var)\s+(\w+)/.exec(line);
    if (constMatch) {
      results.push({
        symbol: constMatch[1]!,
        line: i + 1,
        exportType: "const",
      });
    }
  }
  return results;
};

// ─── Scala ──────────────────────────────────────────────────────────

export const extractScalaExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const classMatch = /^(?:case\s+)?class\s+(\w+)/.exec(line);
    if (classMatch) {
      results.push({
        symbol: classMatch[1]!,
        line: i + 1,
        exportType: "class",
      });
      continue;
    }
    const objectMatch = /^object\s+(\w+)/.exec(line);
    if (objectMatch) {
      results.push({
        symbol: objectMatch[1]!,
        line: i + 1,
        exportType: "class",
      });
      continue;
    }
    const traitMatch = /^trait\s+(\w+)/.exec(line);
    if (traitMatch) {
      results.push({
        symbol: traitMatch[1]!,
        line: i + 1,
        exportType: "interface",
      });
      continue;
    }
    const defMatch = /^def\s+(\w+)/.exec(line);
    if (defMatch) {
      results.push({
        symbol: defMatch[1]!,
        line: i + 1,
        exportType: "function",
      });
    }
  }
  return results;
};

// ─── Dart ───────────────────────────────────────────────────────────

export const extractDartExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const classMatch = /^class\s+([A-Z]\w*)/.exec(line);
    if (classMatch) {
      results.push({
        symbol: classMatch[1]!,
        line: i + 1,
        exportType: "class",
      });
      continue;
    }
    const enumMatch = /^enum\s+([A-Z]\w*)/.exec(line);
    if (enumMatch) {
      results.push({
        symbol: enumMatch[1]!,
        line: i + 1,
        exportType: "enum",
      });
      continue;
    }
    const mixinMatch = /^mixin\s+([A-Z]\w*)/.exec(line);
    if (mixinMatch) {
      results.push({
        symbol: mixinMatch[1]!,
        line: i + 1,
        exportType: "interface",
      });
      continue;
    }
    const typedefMatch = /^typedef\s+(\w+)/.exec(line);
    if (typedefMatch && !typedefMatch[1]!.startsWith("_")) {
      results.push({
        symbol: typedefMatch[1]!,
        line: i + 1,
        exportType: "type",
      });
      continue;
    }
    // Top-level functions (non-_ prefix)
    const fnMatch = /^(?:void|[\w<>]+)\s+([a-zA-Z]\w*)\s*\(/.exec(line);
    if (fnMatch && !fnMatch[1]!.startsWith("_")) {
      results.push({
        symbol: fnMatch[1]!,
        line: i + 1,
        exportType: "function",
      });
    }
  }
  return results;
};

// ─── Ruby ────────────────────────────────────────────────────────────

export const extractRubyExports = (lines: readonly string[]): RawExport[] => {
  const results: RawExport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const defMatch = /^def\s+(\w+)/.exec(line);
    if (defMatch) {
      results.push({
        symbol: defMatch[1]!,
        line: i + 1,
        exportType: "function",
      });
    }
    const classMatch = /^class\s+(\w+)/.exec(line);
    if (classMatch) {
      results.push({
        symbol: classMatch[1]!,
        line: i + 1,
        exportType: "class",
      });
    }
    const moduleMatch = /^module\s+(\w+)/.exec(line);
    if (moduleMatch) {
      results.push({
        symbol: moduleMatch[1]!,
        line: i + 1,
        exportType: "other",
      });
    }
  }
  return results;
};
