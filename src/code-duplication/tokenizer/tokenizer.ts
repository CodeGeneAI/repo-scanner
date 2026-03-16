import path from "path";
import type { Token } from "./tokens";
import { TokenType } from "./tokens";

interface CommentStyle {
  line?: string;
  blockStart?: string;
  blockEnd?: string;
}

const C_STYLE: CommentStyle = {
  line: "//",
  blockStart: "/*",
  blockEnd: "*/",
};
const HASH_STYLE: CommentStyle = { line: "#" };
const LUA_STYLE: CommentStyle = {
  line: "--",
  blockStart: "--[[",
  blockEnd: "]]",
};
const HTML_STYLE: CommentStyle = { blockStart: "<!--", blockEnd: "-->" };

const COMMENT_MAP: ReadonlyMap<string, CommentStyle> = new Map([
  [".ts", C_STYLE],
  [".tsx", C_STYLE],
  [".js", C_STYLE],
  [".jsx", C_STYLE],
  [".go", C_STYLE],
  [".rs", C_STYLE],
  [".java", C_STYLE],
  [".kt", C_STYLE],
  [".cs", C_STYLE],
  [".cpp", C_STYLE],
  [".c", C_STYLE],
  [".h", C_STYLE],
  [".hpp", C_STYLE],
  [".swift", C_STYLE],
  [".scala", C_STYLE],
  [".dart", C_STYLE],
  [".php", C_STYLE],
  [".py", HASH_STYLE],
  [".rb", HASH_STYLE],
  [".sh", HASH_STYLE],
  [".yaml", HASH_STYLE],
  [".yml", HASH_STYLE],
  [".toml", HASH_STYLE],
  [".lua", LUA_STYLE],
  [".html", HTML_STYLE],
  [".xml", HTML_STYLE],
  [".svg", HTML_STYLE],
]);

/**
 * Common keywords across popular languages.
 * We preserve these as structural tokens rather than normalizing to $ID.
 */
const KEYWORDS = new Set([
  // Control flow
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "return",
  "yield",
  "throw",
  "try",
  "catch",
  "finally",
  "match",
  "when",
  // Declarations
  "function",
  "fn",
  "func",
  "def",
  "class",
  "struct",
  "enum",
  "interface",
  "trait",
  "type",
  "const",
  "let",
  "var",
  "val",
  "mut",
  "static",
  "pub",
  "private",
  "protected",
  "public",
  "abstract",
  "virtual",
  "override",
  "async",
  "await",
  // Module
  "import",
  "export",
  "from",
  "module",
  "package",
  "use",
  "require",
  // Logic
  "and",
  "or",
  "not",
  "in",
  "is",
  "as",
  "new",
  "this",
  "self",
  "super",
  "null",
  "nil",
  "None",
  "true",
  "false",
  "True",
  "False",
  "void",
  "undefined",
  // Type-related
  "int",
  "float",
  "string",
  "bool",
  "boolean",
  "number",
  "any",
  "object",
  "never",
  "unknown",
]);

/** Punctuation and operators that we keep as structural tokens. */
const OPERATORS_AND_PUNCT = new Set([
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ";",
  ",",
  ".",
  ":",
  "=>",
  "->",
  "=",
  "==",
  "===",
  "!=",
  "!==",
  "<",
  ">",
  "<=",
  ">=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&&",
  "||",
  "!",
  "&",
  "|",
  "^",
  "~",
  "?",
  "??",
  "?.",
  "...",
  "::",
]);

/**
 * Multi-character operators sorted by length descending for greedy matching.
 */
const MULTI_CHAR_OPS = [...OPERATORS_AND_PUNCT]
  .filter((op) => op.length > 1)
  .sort((a, b) => b.length - a.length);

/**
 * Strip comments from source code based on file extension.
 * Returns source with comments replaced by spaces (preserving line structure).
 * Handles template literals with ${...} interpolations for JS/TS.
 */
const stripComments = (source: string, ext: string): string => {
  const style = COMMENT_MAP.get(ext);
  if (!style) return source;

  const out: string[] = [];
  let i = 0;

  while (i < source.length) {
    // Block comment
    if (style.blockStart && source.startsWith(style.blockStart, i)) {
      const endIdx = source.indexOf(
        style.blockEnd!,
        i + style.blockStart.length,
      );
      if (endIdx === -1) {
        // Unterminated block comment — skip rest of file
        for (let j = i; j < source.length; j++) {
          out.push(source[j] === "\n" ? "\n" : " ");
        }
        break;
      }
      for (let j = i; j < endIdx + style.blockEnd!.length; j++) {
        out.push(source[j] === "\n" ? "\n" : " ");
      }
      i = endIdx + style.blockEnd!.length;
      continue;
    }

    // Line comment
    if (style.line && source.startsWith(style.line, i)) {
      const newlineIdx = source.indexOf("\n", i);
      if (newlineIdx === -1) {
        for (let j = i; j < source.length; j++) {
          out.push(" ");
        }
        break;
      }
      for (let j = i; j < newlineIdx; j++) {
        out.push(" ");
      }
      i = newlineIdx;
      continue;
    }

    // String literals — skip over them to avoid false comment detection
    const ch = source[i]!;
    if (ch === '"' || ch === "'") {
      // Check for triple-quoted strings (Python """...""" / '''...''')
      if (
        i + 2 < source.length &&
        source[i + 1] === ch &&
        source[i + 2] === ch
      ) {
        i = skipTripleString(source, i, ch, out);
      } else {
        i = skipSimpleString(source, i, ch, out);
      }
      continue;
    }
    if (ch === "`") {
      i = skipTemplateString(source, i, out);
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join("");
};

/** Skip a triple-quoted string (Python """...""" or '''...'''). */
const skipTripleString = (
  source: string,
  start: number,
  quote: string,
  out: string[],
): number => {
  // Push opening triple quote
  out.push(source[start]!, source[start + 1]!, source[start + 2]!);
  let i = start + 3;
  while (i < source.length) {
    if (
      source[i] === quote &&
      i + 2 < source.length &&
      source[i + 1] === quote &&
      source[i + 2] === quote
    ) {
      // Found closing triple quote
      out.push(source[i]!, source[i + 1]!, source[i + 2]!);
      return i + 3;
    }
    out.push(source[i]!);
    i++;
  }
  return i; // Unterminated
};

/** Skip a simple string delimited by `quote` (" or '). */
const skipSimpleString = (
  source: string,
  start: number,
  quote: string,
  out: string[],
): number => {
  out.push(source[start]!);
  let i = start + 1;
  while (i < source.length && source[i] !== quote) {
    if (source[i] === "\\") {
      out.push(source[i]!);
      i++;
      if (i < source.length) {
        out.push(source[i]!);
        i++;
      }
      continue;
    }
    out.push(source[i]!);
    i++;
  }
  if (i < source.length) {
    out.push(source[i]!);
    i++;
  }
  return i;
};

/**
 * Skip a template string (backtick), handling ${...} interpolations.
 * Inside interpolations, we recursively handle nested strings and braces.
 */
const skipTemplateString = (
  source: string,
  start: number,
  out: string[],
): number => {
  out.push(source[start]!); // opening backtick
  let i = start + 1;

  while (i < source.length && source[i] !== "`") {
    if (source[i] === "\\") {
      out.push(source[i]!);
      i++;
      if (i < source.length) {
        out.push(source[i]!);
        i++;
      }
      continue;
    }
    // Template expression: ${...}
    if (source[i] === "$" && i + 1 < source.length && source[i + 1] === "{") {
      out.push("$", "{");
      i += 2;
      i = skipBraceExpression(source, i, out);
      continue;
    }
    out.push(source[i]!);
    i++;
  }
  if (i < source.length) {
    out.push(source[i]!); // closing backtick
    i++;
  }
  return i;
};

/**
 * Skip content inside a ${...} interpolation, tracking brace depth.
 * Handles nested strings and braces correctly.
 */
const skipBraceExpression = (
  source: string,
  start: number,
  out: string[],
): number => {
  let i = start;
  let depth = 1;

  while (i < source.length && depth > 0) {
    const ch = source[i]!;
    if (ch === "{") {
      depth++;
      out.push(ch);
      i++;
    } else if (ch === "}") {
      depth--;
      out.push(ch);
      i++;
    } else if (ch === '"' || ch === "'") {
      i = skipSimpleString(source, i, ch, out);
    } else if (ch === "`") {
      i = skipTemplateString(source, i, out);
    } else {
      out.push(ch);
      i++;
    }
  }
  return i;
};

/**
 * Tokenize source code into a stream of normalized tokens.
 * Language-agnostic character-level tokenizer with keyword preservation.
 *
 * Processes the entire source as a single string (not line-by-line)
 * to correctly handle multiline string literals (backtick templates).
 */
export const tokenize = (source: string, filePath: string): Token[] => {
  const ext = path.extname(filePath).toLowerCase();
  const cleaned = stripComments(source, ext);
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;

  while (pos < cleaned.length) {
    const ch = cleaned[pos]!;

    // Track line numbers
    if (ch === "\n") {
      line++;
      pos++;
      continue;
    }

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\r") {
      pos++;
      continue;
    }

    // String literal (including Python triple-quoted strings)
    if (ch === '"' || ch === "'") {
      const startLine = line;
      const start = pos;

      // Check for triple-quoted string ("""...""" or '''...''')
      if (
        pos + 2 < cleaned.length &&
        cleaned[pos + 1] === ch &&
        cleaned[pos + 2] === ch
      ) {
        pos += 3; // skip opening triple quote
        while (pos < cleaned.length) {
          if (
            cleaned[pos] === ch &&
            pos + 2 < cleaned.length &&
            cleaned[pos + 1] === ch &&
            cleaned[pos + 2] === ch
          ) {
            pos += 3; // skip closing triple quote
            break;
          }
          if (cleaned[pos] === "\n") line++;
          pos++;
        }
      } else {
        pos++;
        while (pos < cleaned.length && cleaned[pos] !== ch) {
          if (cleaned[pos] === "\\") {
            pos++;
            if (pos < cleaned.length) {
              if (cleaned[pos] === "\n") line++;
              pos++;
            }
            continue;
          }
          if (cleaned[pos] === "\n") line++;
          pos++;
        }
        if (pos < cleaned.length) pos++; // closing quote
      }

      tokens.push({
        type: TokenType.StringLiteral,
        normalized: "$STR",
        original: cleaned.slice(start, pos),
        line: startLine,
      });
      continue;
    }

    // Template literal (backtick) with ${...} interpolation support
    if (ch === "`") {
      const startLine = line;
      const start = pos;
      pos++;
      pos = skipTemplateLiteralBody(cleaned, pos, line, (newLine) => {
        line = newLine;
      });
      tokens.push({
        type: TokenType.StringLiteral,
        normalized: "$STR",
        original: cleaned.slice(start, pos),
        line: startLine,
      });
      continue;
    }

    // Numeric literal
    if (
      (ch >= "0" && ch <= "9") ||
      (ch === "." &&
        pos + 1 < cleaned.length &&
        cleaned[pos + 1]! >= "0" &&
        cleaned[pos + 1]! <= "9")
    ) {
      const start = pos;
      // Check for hex/binary/octal prefix
      const isHex =
        ch === "0" &&
        pos + 1 < cleaned.length &&
        (cleaned[pos + 1] === "x" || cleaned[pos + 1] === "X");
      const isBinOct =
        ch === "0" &&
        pos + 1 < cleaned.length &&
        (cleaned[pos + 1] === "b" || cleaned[pos + 1] === "o");

      pos++;
      if (isHex) {
        pos++; // skip x/X
        while (
          pos < cleaned.length &&
          ((cleaned[pos]! >= "0" && cleaned[pos]! <= "9") ||
            (cleaned[pos]! >= "a" && cleaned[pos]! <= "f") ||
            (cleaned[pos]! >= "A" && cleaned[pos]! <= "F") ||
            cleaned[pos] === "_")
        ) {
          pos++;
        }
      } else if (isBinOct) {
        pos++; // skip b/o
        while (
          pos < cleaned.length &&
          ((cleaned[pos]! >= "0" && cleaned[pos]! <= "9") ||
            cleaned[pos] === "_")
        ) {
          pos++;
        }
      } else {
        // Decimal (with optional fractional part and exponent)
        while (
          pos < cleaned.length &&
          ((cleaned[pos]! >= "0" && cleaned[pos]! <= "9") ||
            cleaned[pos] === "." ||
            cleaned[pos] === "_")
        ) {
          pos++;
        }
        // Exponent
        if (
          pos < cleaned.length &&
          (cleaned[pos] === "e" || cleaned[pos] === "E")
        ) {
          pos++;
          if (
            pos < cleaned.length &&
            (cleaned[pos] === "+" || cleaned[pos] === "-")
          ) {
            pos++;
          }
          while (
            pos < cleaned.length &&
            cleaned[pos]! >= "0" &&
            cleaned[pos]! <= "9"
          ) {
            pos++;
          }
        }
      }
      // Consume a single-char type suffix: n (BigInt), f/d/l/u (C/Rust)
      // Only if NOT followed by another alpha (to avoid eating keywords like `in`)
      if (
        pos < cleaned.length &&
        ((cleaned[pos]! >= "a" && cleaned[pos]! <= "z") ||
          (cleaned[pos]! >= "A" && cleaned[pos]! <= "Z")) &&
        (pos + 1 >= cleaned.length || !isAlphaNumeric(cleaned[pos + 1]!))
      ) {
        pos++;
      }
      tokens.push({
        type: TokenType.NumericLiteral,
        normalized: "$NUM",
        original: cleaned.slice(start, pos),
        line,
      });
      continue;
    }

    // Identifier or keyword
    if (isIdentStart(ch)) {
      const start = pos;
      pos++;
      while (pos < cleaned.length && isIdentPart(cleaned[pos]!)) {
        pos++;
      }
      const word = cleaned.slice(start, pos);
      if (KEYWORDS.has(word)) {
        tokens.push({
          type: TokenType.Keyword,
          normalized: word,
          original: word,
          line,
        });
      } else {
        tokens.push({
          type: TokenType.Identifier,
          normalized: "$ID",
          original: word,
          line,
        });
      }
      continue;
    }

    // Multi-character operators
    let matched = false;
    for (const op of MULTI_CHAR_OPS) {
      if (cleaned.startsWith(op, pos)) {
        tokens.push({
          type: TokenType.Operator,
          normalized: op,
          original: op,
          line,
        });
        pos += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Single-character operator/punctuation
    if (OPERATORS_AND_PUNCT.has(ch)) {
      tokens.push({
        type: TokenType.Punctuation,
        normalized: ch,
        original: ch,
        line,
      });
      pos++;
      continue;
    }

    // Skip any other character (decorators @, etc.)
    pos++;
  }

  return tokens;
};

/**
 * Skip the body of a template literal (after opening backtick).
 * Handles ${...} interpolations by tracking brace depth.
 * Returns position after the closing backtick (or end of string).
 */
const skipTemplateLiteralBody = (
  source: string,
  start: number,
  startLine: number,
  updateLine: (line: number) => void,
): number => {
  let pos = start;
  let line = startLine;

  while (pos < source.length && source[pos] !== "`") {
    if (source[pos] === "\\") {
      pos++;
      if (pos < source.length) {
        if (source[pos] === "\n") {
          line++;
          updateLine(line);
        }
        pos++;
      }
      continue;
    }
    // Template expression: ${...}
    if (
      source[pos] === "$" &&
      pos + 1 < source.length &&
      source[pos + 1] === "{"
    ) {
      pos += 2; // skip ${
      let depth = 1;
      while (pos < source.length && depth > 0) {
        if (source[pos] === "{") {
          depth++;
          pos++;
        } else if (source[pos] === "}") {
          depth--;
          pos++;
        } else if (source[pos] === "\n") {
          line++;
          updateLine(line);
          pos++;
        } else if (source[pos] === "`") {
          // Nested template literal
          pos++;
          pos = skipTemplateLiteralBody(source, pos, line, (newLine) => {
            line = newLine;
            updateLine(line);
          });
        } else if (source[pos] === '"' || source[pos] === "'") {
          const quote = source[pos]!;
          pos++;
          while (pos < source.length && source[pos] !== quote) {
            if (source[pos] === "\\") {
              pos++;
              if (pos < source.length) pos++;
              continue;
            }
            pos++;
          }
          if (pos < source.length) pos++;
        } else {
          pos++;
        }
      }
      continue;
    }
    if (source[pos] === "\n") {
      line++;
      updateLine(line);
    }
    pos++;
  }
  if (pos < source.length) pos++; // closing backtick
  return pos;
};

const isIdentStart = (ch: string): boolean =>
  (ch >= "a" && ch <= "z") ||
  (ch >= "A" && ch <= "Z") ||
  ch === "_" ||
  ch === "$";

const isIdentPart = (ch: string): boolean =>
  isIdentStart(ch) || (ch >= "0" && ch <= "9");

const isAlphaNumeric = (ch: string): boolean =>
  (ch >= "a" && ch <= "z") ||
  (ch >= "A" && ch <= "Z") ||
  (ch >= "0" && ch <= "9") ||
  ch === "_";
