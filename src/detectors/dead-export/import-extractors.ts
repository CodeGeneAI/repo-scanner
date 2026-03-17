// ─── TypeScript / JavaScript ─────────────────────────────────────────

export const extractTsImportedSymbols = (
  lines: readonly string[],
): Set<string> => {
  const symbols = new Set<string>();
  for (const line of lines) {
    // import { foo, bar } from '...'
    const braceImport = /import\s+(?:type\s+)?\{([^}]+)\}/.exec(line);
    if (braceImport) {
      const names = braceImport[1]!
        .split(",")
        .map((n) => {
          const parts = n.trim().split(/\s+as\s+/);
          return parts[0]!.trim();
        })
        .filter((n) => n.length > 0);
      for (const name of names) symbols.add(name);
    }
    // import Foo from '...'
    const defaultImport = /import\s+(\w+)\s+from/.exec(line);
    if (defaultImport) symbols.add(defaultImport[1]!);
    // export { foo } from '...' (re-export counts as usage)
    const reExport = /export\s+\{([^}]+)\}\s+from/.exec(line);
    if (reExport) {
      const names = reExport[1]!
        .split(",")
        .map((n) =>
          n
            .trim()
            .split(/\s+as\s+/)[0]!
            .trim(),
        )
        .filter((n) => n.length > 0);
      for (const name of names) symbols.add(name);
    }
  }
  return symbols;
};

// ─── Go ──────────────────────────────────────────────────────────────

/** For Go, we do whole-content symbol scanning since Go uses symbols directly. */
export const extractGoReferencedSymbols = (content: string): Set<string> => {
  // Extract all identifiers from the content
  const symbols = new Set<string>();
  const regex = /\b([A-Z]\w*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    symbols.add(m[1]!);
  }
  return symbols;
};

// ─── Rust ────────────────────────────────────────────────────────────

export const extractRustImportedSymbols = (
  lines: readonly string[],
): Set<string> => {
  const symbols = new Set<string>();
  for (const line of lines) {
    // use path::Symbol
    const singleUse = /use\s+[\w:]+::(\w+)/.exec(line);
    if (singleUse) symbols.add(singleUse[1]!);
    // use path::{A, B, C}
    const braceUse = /use\s+[\w:]+::\{([^}]+)\}/.exec(line);
    if (braceUse) {
      const names = braceUse[1]!
        .split(",")
        .map((n) =>
          n
            .trim()
            .split(/\s+as\s+/)[0]!
            .trim(),
        )
        .filter((n) => n.length > 0);
      for (const name of names) symbols.add(name);
    }
  }
  return symbols;
};

// ─── Python ──────────────────────────────────────────────────────────

export const extractPythonImportedSymbols = (
  lines: readonly string[],
): Set<string> => {
  const symbols = new Set<string>();
  for (const line of lines) {
    // from module import foo, bar
    const fromImport = /from\s+\S+\s+import\s+(.+)/.exec(line);
    if (fromImport) {
      const names = fromImport[1]!
        .split(",")
        .map((n) =>
          n
            .trim()
            .split(/\s+as\s+/)[0]!
            .trim(),
        )
        .filter((n) => n.length > 0 && !n.startsWith("("));
      for (const name of names) symbols.add(name);
    }
  }
  return symbols;
};

// ─── Java / Kotlin ───────────────────────────────────────────────────

export const extractJavaImportedSymbols = (
  lines: readonly string[],
): Set<string> => {
  const symbols = new Set<string>();
  for (const line of lines) {
    // import com.example.Foo → Foo
    const javaImport = /import\s+[\w.]+\.(\w+)\s*;/.exec(line);
    if (javaImport) symbols.add(javaImport[1]!);
  }
  return symbols;
};

// ─── C# / F# / VB.NET ───────────────────────────────────────────────

/** For .NET languages, scan using directives + content-based symbol refs. */
export const extractDotNetImportedSymbols = (
  lines: readonly string[],
): Set<string> => {
  const symbols = new Set<string>();
  for (const line of lines) {
    // C#: using Namespace.Type;
    const usingMatch = /using\s+(?:static\s+)?[\w.]+\.(\w+)\s*;/.exec(line);
    if (usingMatch) symbols.add(usingMatch[1]!);
    // F#: open Namespace.Module
    const openMatch = /open\s+[\w.]+\.(\w+)/.exec(line);
    if (openMatch) symbols.add(openMatch[1]!);
    // VB.NET: Imports Namespace.Type
    const importsMatch = /Imports\s+[\w.]+\.(\w+)/i.exec(line);
    if (importsMatch) symbols.add(importsMatch[1]!);
    // Direct type references (PascalCase identifiers — common in .NET)
    const typeRefs = line.matchAll(/\b([A-Z]\w{2,})\b/g);
    for (const m of typeRefs) {
      symbols.add(m[1]!);
    }
  }
  return symbols;
};

// ─── PHP ────────────────────────────────────────────────────────────

export const extractPhpImportedSymbols = (
  lines: readonly string[],
): Set<string> => {
  const symbols = new Set<string>();
  for (const line of lines) {
    // use Namespace\ClassName
    const useMatch = /use\s+[\w\\]+\\(\w+)/.exec(line);
    if (useMatch) symbols.add(useMatch[1]!);
    // PascalCase content references
    const typeRefs = line.matchAll(/\b([A-Z]\w{2,})\b/g);
    for (const m of typeRefs) {
      symbols.add(m[1]!);
    }
  }
  return symbols;
};

// ─── Swift ──────────────────────────────────────────────────────────

/** For Swift, content-based PascalCase symbol scanning. */
export const extractSwiftReferencedSymbols = (content: string): Set<string> => {
  const symbols = new Set<string>();
  const regex = /\b([A-Z]\w{2,})\b/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    symbols.add(m[1]!);
  }
  return symbols;
};

// ─── Scala ──────────────────────────────────────────────────────────

export const extractScalaImportedSymbols = (
  lines: readonly string[],
): Set<string> => {
  const symbols = new Set<string>();
  for (const line of lines) {
    // import pkg.X
    const singleImport = /import\s+[\w.]+\.(\w+)/.exec(line);
    if (singleImport) symbols.add(singleImport[1]!);
    // import pkg.{A, B}
    const braceImport = /import\s+[\w.]+\.\{([^}]+)\}/.exec(line);
    if (braceImport) {
      const names = braceImport[1]!
        .split(",")
        .map((n) =>
          n
            .trim()
            .split(/\s+(?:as|=>)\s+/)[0]!
            .trim(),
        )
        .filter((n) => n.length > 0);
      for (const name of names) symbols.add(name);
    }
  }
  return symbols;
};

// ─── Dart ───────────────────────────────────────────────────────────

export const extractDartImportedSymbols = (
  lines: readonly string[],
): Set<string> => {
  const symbols = new Set<string>();
  for (const line of lines) {
    // import '...' show A, B
    const showMatch = /import\s+['"][^'"]+['"]\s*show\s+(.+)/.exec(line);
    if (showMatch) {
      const names = showMatch[1]!
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n.length > 0);
      for (const name of names) symbols.add(name);
    }
    // PascalCase content references
    const typeRefs = line.matchAll(/\b([A-Z]\w{2,})\b/g);
    for (const m of typeRefs) {
      symbols.add(m[1]!);
    }
  }
  return symbols;
};

// ─── Elixir ─────────────────────────────────────────────────────────

/** Elixir: alias, import, use directives + module name references. */
export const extractElixirReferencedSymbols = (
  content: string,
): Set<string> => {
  const symbols = new Set<string>();
  // alias Module.Name or alias Module.Name, as: Alias
  const aliasRegex = /alias\s+([\w.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = aliasRegex.exec(content)) !== null) {
    const fullName = m[1]!;
    symbols.add(fullName);
    // Also add the last segment (MyApp.Repo → Repo)
    const parts = fullName.split(".");
    symbols.add(parts[parts.length - 1]!);
  }
  // import Module / use Module
  const importRegex = /(?:import|use)\s+([\w.]+)/g;
  while ((m = importRegex.exec(content)) !== null) {
    symbols.add(m[1]!);
  }
  // Function calls: Module.function_name
  const callRegex = /\b([A-Z][\w.]*)\.\w+/g;
  while ((m = callRegex.exec(content)) !== null) {
    symbols.add(m[1]!);
  }
  return symbols;
};

// ─── Ruby ────────────────────────────────────────────────────────────

/** For Ruby, like Go, we do whole-content symbol scanning. */
export const extractRubyReferencedSymbols = (content: string): Set<string> => {
  const symbols = new Set<string>();
  const regex = /\b([A-Z]\w*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    symbols.add(m[1]!);
  }
  // Also capture method calls
  const methodRegex = /\b(\w+)\s*(?:\(|\.)/g;
  while ((m = methodRegex.exec(content)) !== null) {
    symbols.add(m[1]!);
  }
  return symbols;
};
