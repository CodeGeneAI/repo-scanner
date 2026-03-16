import type { ExtractorMatch, LanguageExtractor } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────

/** Apply a set of regex rules to each line, collecting matches. */
const applyLineRules = (
  lines: readonly string[],
  rules: readonly {
    regex: RegExp;
    build: (m: RegExpExecArray, line: number) => ExtractorMatch | undefined;
  }[],
): ExtractorMatch[] => {
  const matches: ExtractorMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.regex.exec(line)) !== null) {
        const result = rule.build(m, i + 1);
        if (result) matches.push(result);
      }
    }
  }
  return matches;
};

/** Strip surrounding quotes from a string. */
const stripQuotes = (s: string): string => {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
};

// ─── TypeScript / JavaScript ─────────────────────────────────────────

/** Vite built-in env vars that are not user-defined. */
const VITE_BUILTINS = new Set(["MODE", "PROD", "DEV", "SSR", "BASE_URL"]);

const extractTypeScript: LanguageExtractor = (lines) => {
  const matches: ExtractorMatch[] = [];

  // Track destructuring state across lines
  let destructBuffer = "";
  let destructStartLine = 0;
  let inDestruct = false;
  let destructLineCount = 0;
  const MAX_DESTRUCT_LINES = 20;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    // Multi-line destructuring accumulation
    if (inDestruct) {
      destructLineCount++;
      if (destructLineCount > MAX_DESTRUCT_LINES) {
        inDestruct = false;
        continue;
      }
      destructBuffer += ` ${line.trim()}`;
      if (line.includes("}")) {
        inDestruct = false;
        const innerMatch = /\{([^}]+)\}/.exec(destructBuffer);
        if (innerMatch?.[1] && /=\s*process\.env/.test(destructBuffer)) {
          const vars = innerMatch[1]
            .split(",")
            .map((v) => v.trim().split(/\s|:/)[0]!)
            .filter((v) => v && /^[A-Za-z_]\w*$/.test(v));
          for (const varName of vars) {
            matches.push({
              varName,
              line: destructStartLine,
              pattern: `const { ${varName} } = process.env`,
              accessType: "read",
            });
          }
        }
        continue;
      }
      continue;
    }

    // Check for destructuring start
    if (/(?:const|let|var)\s*\{/.test(line)) {
      if (line.includes("}") && /process\.env/.test(line)) {
        // Single-line destructuring
        const innerMatch = /\{([^}]+)\}\s*=\s*process\.env/.exec(line);
        if (innerMatch?.[1]) {
          const vars = innerMatch[1]
            .split(",")
            .map((v) => v.trim().split(/\s|:/)[0]!)
            .filter((v) => v && /^[A-Za-z_]\w*$/.test(v));
          for (const varName of vars) {
            matches.push({
              varName,
              line: lineNum,
              pattern: `const { ${varName} } = process.env`,
              accessType: "read",
            });
          }
        }
      } else if (!line.includes("}")) {
        // Multi-line destructuring starts (process.env check deferred to completion)
        inDestruct = true;
        destructBuffer = line.trim();
        destructStartLine = lineNum;
        destructLineCount = 0;
      }
      continue;
    }

    // Write: process.env.FOO =
    const writeMatch = /process\.env\.([A-Za-z_]\w*)\s*=(?!=)/.exec(line);
    if (writeMatch?.[1]) {
      matches.push({
        varName: writeMatch[1],
        line: lineNum,
        pattern: `process.env.${writeMatch[1]} = ...`,
        accessType: "write",
      });
      // Don't continue — same line may have reads too
    }

    // Direct dot: process.env.FOO (not a write)
    const dotRegex = /process\.env\.([A-Za-z_]\w*)/g;
    let dotMatch: RegExpExecArray | null;
    while ((dotMatch = dotRegex.exec(line)) !== null) {
      const varName = dotMatch[1]!;
      // Skip if this is the write we already captured
      if (
        writeMatch?.[1] === varName &&
        /process\.env\.\w+\s*=(?!=)/.test(line)
      )
        continue;

      let defaultValue: string | undefined;
      // Check for ?? "default" or || "default" after this occurrence
      const afterVar = line.slice(dotMatch.index + dotMatch[0].length);
      const defaultMatch = /^\s*(?:\?\?|\|\|)\s*["']([^"']+)["']/.exec(
        afterVar,
      );
      if (defaultMatch?.[1]) defaultValue = defaultMatch[1];

      matches.push({
        varName,
        line: lineNum,
        pattern: `process.env.${varName}`,
        accessType: "read",
        defaultValue,
      });
    }

    // Bracket: process.env["FOO"] or process.env['FOO']
    const bracketRegex = /process\.env\[["']([A-Za-z_]\w*)["']\]/g;
    let bracketMatch: RegExpExecArray | null;
    while ((bracketMatch = bracketRegex.exec(line)) !== null) {
      const varName = bracketMatch[1]!;
      let defaultValue: string | undefined;
      const afterVar = line.slice(bracketMatch.index + bracketMatch[0].length);
      const defaultM = /^\s*(?:\?\?|\|\|)\s*["']([^"']+)["']/.exec(afterVar);
      if (defaultM?.[1]) defaultValue = defaultM[1];

      matches.push({
        varName,
        line: lineNum,
        pattern: `process.env["${varName}"]`,
        accessType: "read",
        defaultValue,
      });
    }

    // Dynamic: process.env[variable] (not string literal)
    const dynamicRegex = /process\.env\[([A-Za-z_]\w*)\]/g;
    let dynMatch: RegExpExecArray | null;
    while ((dynMatch = dynamicRegex.exec(line)) !== null) {
      matches.push({
        varName: `<dynamic:${dynMatch[1]}>`,
        line: lineNum,
        pattern: `process.env[${dynMatch[1]}]`,
        accessType: "read",
        isDynamic: true,
      });
    }

    // Vite: import.meta.env.VITE_FOO (skip built-ins like MODE, PROD, DEV, SSR, BASE_URL)
    const viteRegex = /import\.meta\.env\.([A-Za-z_]\w*)/g;
    let viteMatch: RegExpExecArray | null;
    while ((viteMatch = viteRegex.exec(line)) !== null) {
      const varName = viteMatch[1]!;
      if (VITE_BUILTINS.has(varName)) continue;
      matches.push({
        varName,
        line: lineNum,
        pattern: `import.meta.env.${varName}`,
        accessType: "read",
      });
    }
  }

  return matches;
};

// ─── Python ──────────────────────────────────────────────────────────

const extractPython: LanguageExtractor = (lines) => {
  const matches: ExtractorMatch[] = [];
  let inDocstring = false;
  let docstringDelim = "";

  const rules = [
    {
      regex:
        /os\.getenv\(["']([A-Za-z_]\w*)["'](?:\s*,\s*["']?([^"')]+)["']?)?\)/g,
      build: (m: RegExpExecArray, line: number): ExtractorMatch => ({
        varName: m[1]!,
        line,
        pattern: `os.getenv("${m[1]}")`,
        accessType: "read" as const,
        defaultValue: m[2]?.trim(),
      }),
    },
    {
      regex: /os\.environ\[["']([A-Za-z_]\w*)["']\]/g,
      build: (m: RegExpExecArray, line: number): ExtractorMatch => ({
        varName: m[1]!,
        line,
        pattern: `os.environ["${m[1]}"]`,
        accessType: "read" as const,
      }),
    },
    {
      regex:
        /os\.environ\.get\(["']([A-Za-z_]\w*)["'](?:\s*,\s*["']?([^"')]+)["']?)?\)/g,
      build: (m: RegExpExecArray, line: number): ExtractorMatch => ({
        varName: m[1]!,
        line,
        pattern: `os.environ.get("${m[1]}")`,
        accessType: "read" as const,
        defaultValue: m[2]?.trim(),
      }),
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Track triple-quoted docstrings
    if (!inDocstring) {
      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        docstringDelim = trimmed.slice(0, 3);
        // Check if docstring opens and closes on same line (after the opening)
        if (trimmed.length > 3 && trimmed.slice(3).includes(docstringDelim)) {
          continue; // single-line docstring, skip it
        }
        inDocstring = true;
        continue;
      }
    } else {
      if (trimmed.includes(docstringDelim)) {
        inDocstring = false;
      }
      continue;
    }

    // Skip comment lines
    if (trimmed.startsWith("#")) continue;

    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.regex.exec(line)) !== null) {
        matches.push(rule.build(m, i + 1));
      }
    }
  }

  return matches;
};

// ─── Go ──────────────────────────────────────────────────────────────

const extractGo: LanguageExtractor = (lines) => {
  const matches = applyLineRules(lines, [
    {
      regex: /os\.Getenv\(["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `os.Getenv("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
    {
      regex: /os\.LookupEnv\(["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `os.LookupEnv("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
  ]);

  // Struct tags: `env:"FOO"` or `env:"FOO,required"` or `env:"FOO" envDefault:"bar"`
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const envTagMatch = /`[^`]*env:"([^"]+)"[^`]*`/.exec(line);
    if (envTagMatch?.[1]) {
      const parts = envTagMatch[1].split(",");
      const varName = parts[0]!;
      if (!varName) continue;

      let defaultValue: string | undefined;
      const defaultTagMatch = /envDefault:"([^"]*)"/.exec(line);
      if (defaultTagMatch?.[1] !== undefined) defaultValue = defaultTagMatch[1];

      // Also check for default= in the env tag itself
      const inlineDefault = parts.find((p) => p.startsWith("default="));
      if (inlineDefault) defaultValue = inlineDefault.slice(8);

      matches.push({
        varName,
        line: i + 1,
        pattern: `env:"${varName}"`,
        accessType: "read",
        defaultValue,
      });
    }

    // envconfig struct tag
    const envconfigMatch = /`[^`]*envconfig:"([^"]+)"[^`]*`/.exec(line);
    if (envconfigMatch?.[1] && !envTagMatch) {
      matches.push({
        varName: envconfigMatch[1],
        line: i + 1,
        pattern: `envconfig:"${envconfigMatch[1]}"`,
        accessType: "read",
      });
    }
  }

  return matches;
};

// ─── Rust ────────────────────────────────────────────────────────────

const extractRust: LanguageExtractor = (lines) => {
  const matches: ExtractorMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    // env::var("FOO") or std::env::var("FOO")
    const varRegex = /(?:std::)?env::var\(["']([A-Za-z_]\w*)["']\)/g;
    let m: RegExpExecArray | null;
    while ((m = varRegex.exec(line)) !== null) {
      let defaultValue: string | undefined;
      const afterMatch = line.slice(m.index + m[0].length);
      const unwrapMatch = /\.unwrap_or\(["']([^"']+)["']/.exec(afterMatch);
      if (unwrapMatch?.[1]) defaultValue = unwrapMatch[1];
      const unwrapElseMatch = /\.unwrap_or_else\(\|_\|\s*["']([^"']+)["']/.exec(
        afterMatch,
      );
      if (!defaultValue && unwrapElseMatch?.[1])
        defaultValue = unwrapElseMatch[1];

      matches.push({
        varName: m[1]!,
        line: lineNum,
        pattern: `env::var("${m[1]}")`,
        accessType: "read",
        defaultValue,
      });
    }

    // env!("FOO") — compile-time required (negative lookbehind to skip option_env!)
    const envBangRegex = /(?<!option_)env!\(["']([A-Za-z_]\w*)["']\)/g;
    while ((m = envBangRegex.exec(line)) !== null) {
      matches.push({
        varName: m[1]!,
        line: lineNum,
        pattern: `env!("${m[1]}")`,
        accessType: "read",
      });
    }

    // option_env!("FOO") — compile-time optional
    const optionEnvRegex = /option_env!\(["']([A-Za-z_]\w*)["']\)/g;
    while ((m = optionEnvRegex.exec(line)) !== null) {
      matches.push({
        varName: m[1]!,
        line: lineNum,
        pattern: `option_env!("${m[1]}")`,
        accessType: "read",
      });
    }
  }

  return matches;
};

// ─── Shell ───────────────────────────────────────────────────────────

const extractShell: LanguageExtractor = (lines) => {
  const matches: ExtractorMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("#")) continue;

    // export FOO=value
    const exportMatch = /^export\s+([A-Za-z_]\w*)=(.*)/.exec(trimmed);
    if (exportMatch?.[1]) {
      matches.push({
        varName: exportMatch[1],
        line: lineNum,
        pattern: `export ${exportMatch[1]}=...`,
        accessType: "definition",
        defaultValue: stripQuotes(exportMatch[2]?.trim() ?? ""),
      });
    }

    // ${FOO:-default}
    const defaultRegex = /\$\{([A-Za-z_]\w*):-([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = defaultRegex.exec(line)) !== null) {
      matches.push({
        varName: m[1]!,
        line: lineNum,
        pattern: `\${${m[1]}:-${m[2]}}`,
        accessType: "read",
        defaultValue: m[2],
      });
    }

    // ${FOO:=default}
    const assignRegex = /\$\{([A-Za-z_]\w*):=([^}]*)\}/g;
    while ((m = assignRegex.exec(line)) !== null) {
      matches.push({
        varName: m[1]!,
        line: lineNum,
        pattern: `\${${m[1]}:=${m[2]}}`,
        accessType: "read",
        defaultValue: m[2],
      });
    }

    // ${FOO:?error}
    const requiredRegex = /\$\{([A-Za-z_]\w*):\?([^}]*)\}/g;
    while ((m = requiredRegex.exec(line)) !== null) {
      matches.push({
        varName: m[1]!,
        line: lineNum,
        pattern: `\${${m[1]}:?...}`,
        accessType: "read",
      });
    }

    // ${FOO} without modifier (only in assignment/export context or command args)
    const simpleBraceRegex = /\$\{([A-Za-z_]\w*)\}(?![:-=?])/g;
    while ((m = simpleBraceRegex.exec(line)) !== null) {
      // Skip if already matched by default/assign/required patterns above
      const varName = m[1]!;
      if (matches.some((em) => em.varName === varName && em.line === lineNum))
        continue;
      matches.push({
        varName,
        line: lineNum,
        pattern: `\${${varName}}`,
        accessType: "read",
      });
    }
  }

  return matches;
};

// ─── Java / Kotlin ───────────────────────────────────────────────────

const extractJava: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /System\.getenv\(["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `System.getenv("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
    {
      // Spring @Value("${FOO}") or @Value("${FOO:default}")
      regex: /@Value\(["']\$\{([A-Za-z_]\w*)(?::([^}]*))?\}["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `@Value("\${${m[1]}}")`,
        accessType: "read" as const,
        defaultValue: m[2],
      }),
    },
  ]);

// ─── C# ──────────────────────────────────────────────────────────────

const extractCSharp: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /Environment\.GetEnvironmentVariable\(["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `Environment.GetEnvironmentVariable("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
    {
      regex: /configuration\[["']([A-Za-z_]\w*)["']\]/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `configuration["${m[1]}"]`,
        accessType: "read" as const,
      }),
    },
  ]);

// ─── Ruby ────────────────────────────────────────────────────────────

const extractRuby: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /ENV\[["']([A-Za-z_]\w*)["']\]/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `ENV["${m[1]}"]`,
        accessType: "read" as const,
      }),
    },
    {
      regex:
        /ENV\.fetch\(["']([A-Za-z_]\w*)["'](?:\s*,\s*["']?([^"')]+)["']?)?\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `ENV.fetch("${m[1]}")`,
        accessType: "read" as const,
        defaultValue: m[2]?.trim(),
      }),
    },
  ]);

// ─── PHP ─────────────────────────────────────────────────────────────

const extractPhp: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /getenv\(["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `getenv("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
    {
      regex: /\$_ENV\[["']([A-Za-z_]\w*)["']\]/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `$_ENV["${m[1]}"]`,
        accessType: "read" as const,
      }),
    },
    {
      regex: /\$_SERVER\[["']([A-Za-z_]\w*)["']\]/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `$_SERVER["${m[1]}"]`,
        accessType: "read" as const,
      }),
    },
  ]);

// ─── C / C++ ─────────────────────────────────────────────────────────

const extractC: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /(?:std::)?getenv\(["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `getenv("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
  ]);

// ─── Swift ───────────────────────────────────────────────────────────

const extractSwift: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /ProcessInfo\.processInfo\.environment\[["']([A-Za-z_]\w*)["']\]/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `ProcessInfo.processInfo.environment["${m[1]}"]`,
        accessType: "read" as const,
      }),
    },
  ]);

// ─── Scala ───────────────────────────────────────────────────────────

const extractScala: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /sys\.env(?:\.get)?\(["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `sys.env("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
    {
      regex:
        /sys\.env\.getOrElse\(["']([A-Za-z_]\w*)["']\s*,\s*["']([^"']*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `sys.env.getOrElse("${m[1]}")`,
        accessType: "read" as const,
        defaultValue: m[2],
      }),
    },
  ]);

// ─── Dart ────────────────────────────────────────────────────────────

const extractDart: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /Platform\.environment\[["']([A-Za-z_]\w*)["']\]/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `Platform.environment["${m[1]}"]`,
        accessType: "read" as const,
      }),
    },
    {
      regex: /String\.fromEnvironment\(["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `String.fromEnvironment("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
  ]);

// ─── Lua ─────────────────────────────────────────────────────────────

const extractLua: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /os\.getenv\(["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `os.getenv("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
  ]);

// ─── F# ─────────────────────────────────────────────────────────────

const extractFSharp: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex:
        /(?:System\.)?Environment\.GetEnvironmentVariable\(\s*["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `Environment.GetEnvironmentVariable("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
  ]);

// ─── VB.NET ─────────────────────────────────────────────────────────

const extractVbNet: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex:
        /Environment\.GetEnvironmentVariable\(\s*["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `Environment.GetEnvironmentVariable("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
  ]);

// ─── Elixir ─────────────────────────────────────────────────────────

const extractElixir: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /System\.get_env\(\s*["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `System.get_env("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
    {
      regex: /System\.fetch_env!\(\s*["']([A-Za-z_]\w*)["']\)/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `System.fetch_env!("${m[1]}")`,
        accessType: "read" as const,
      }),
    },
  ]);

// ─── Perl ───────────────────────────────────────────────────────────

const extractPerl: LanguageExtractor = (lines) =>
  applyLineRules(lines, [
    {
      regex: /\$ENV\{\s*["']?([A-Za-z_]\w*)["']?\s*\}/g,
      build: (m, line) => ({
        varName: m[1]!,
        line,
        pattern: `$ENV{${m[1]}}`,
        accessType: "read" as const,
      }),
    },
  ]);

// ─── Registry ────────────────────────────────────────────────────────

const extractorsByExt = new Map<string, LanguageExtractor>([
  [".ts", extractTypeScript],
  [".tsx", extractTypeScript],
  [".js", extractTypeScript],
  [".jsx", extractTypeScript],
  [".mjs", extractTypeScript],
  [".cjs", extractTypeScript],
  [".py", extractPython],
  [".go", extractGo],
  [".rs", extractRust],
  [".sh", extractShell],
  [".bash", extractShell],
  [".zsh", extractShell],
  [".java", extractJava],
  [".kt", extractJava],
  [".cs", extractCSharp],
  [".rb", extractRuby],
  [".php", extractPhp],
  [".c", extractC],
  [".cpp", extractC],
  [".h", extractC],
  [".hpp", extractC],
  [".swift", extractSwift],
  [".scala", extractScala],
  [".dart", extractDart],
  [".lua", extractLua],
  [".fs", extractFSharp],
  [".fsx", extractFSharp],
  [".vb", extractVbNet],
  [".ex", extractElixir],
  [".exs", extractElixir],
  [".pl", extractPerl],
]);

/** Get the extractor function for a file extension, or undefined if unsupported. */
export const getExtractorForExtension = (
  ext: string,
): LanguageExtractor | undefined => extractorsByExt.get(ext.toLowerCase());

/** All supported source file extensions. */
export const SUPPORTED_EXTENSIONS = [...extractorsByExt.keys()];
