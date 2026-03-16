import { describe, expect, it } from "bun:test";
import { tokenize } from "./tokenizer";
import { TokenType } from "./tokens";

describe("tokenizer", () => {
  it("tokenizes identifiers as $ID", () => {
    const tokens = tokenize("foo bar baz", "test.ts");
    expect(tokens).toHaveLength(3);
    for (const t of tokens) {
      expect(t.type).toBe(TokenType.Identifier);
      expect(t.normalized).toBe("$ID");
    }
    expect(tokens[0]!.original).toBe("foo");
    expect(tokens[1]!.original).toBe("bar");
    expect(tokens[2]!.original).toBe("baz");
  });

  it("preserves keywords", () => {
    const tokens = tokenize("if (x) return y", "test.ts");
    expect(tokens[0]!.normalized).toBe("if");
    expect(tokens[0]!.type).toBe(TokenType.Keyword);
    expect(tokens[1]!.normalized).toBe("(");
    expect(tokens[2]!.normalized).toBe("$ID"); // x
    expect(tokens[3]!.normalized).toBe(")");
    expect(tokens[4]!.normalized).toBe("return");
    expect(tokens[5]!.normalized).toBe("$ID"); // y
  });

  it("normalizes string literals to $STR", () => {
    const tokens = tokenize('const x = "hello world"', "test.ts");
    const strToken = tokens.find((t) => t.type === TokenType.StringLiteral);
    expect(strToken).toBeDefined();
    expect(strToken!.normalized).toBe("$STR");
    expect(strToken!.original).toBe('"hello world"');
  });

  it("normalizes numeric literals to $NUM", () => {
    const tokens = tokenize("const x = 42", "test.ts");
    const numToken = tokens.find((t) => t.type === TokenType.NumericLiteral);
    expect(numToken).toBeDefined();
    expect(numToken!.normalized).toBe("$NUM");
    expect(numToken!.original).toBe("42");
  });

  it("handles hex numbers", () => {
    const tokens = tokenize("0xFF", "test.ts");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.normalized).toBe("$NUM");
  });

  it("strips C-style line comments", () => {
    const tokens = tokenize("x // this is a comment\ny", "test.ts");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.original).toBe("x");
    expect(tokens[1]!.original).toBe("y");
  });

  it("strips C-style block comments", () => {
    const tokens = tokenize("x /* comment */ y", "test.ts");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.original).toBe("x");
    expect(tokens[1]!.original).toBe("y");
  });

  it("strips hash comments for Python", () => {
    const tokens = tokenize("x # comment\ny", "test.py");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.original).toBe("x");
    expect(tokens[1]!.original).toBe("y");
  });

  it("tracks line numbers correctly", () => {
    const tokens = tokenize("a\nb\nc", "test.ts");
    expect(tokens[0]!.line).toBe(1);
    expect(tokens[1]!.line).toBe(2);
    expect(tokens[2]!.line).toBe(3);
  });

  it("tokenizes operators and punctuation", () => {
    const tokens = tokenize("a === b", "test.ts");
    expect(tokens).toHaveLength(3);
    expect(tokens[1]!.normalized).toBe("===");
    expect(tokens[1]!.type).toBe(TokenType.Operator);
  });

  it("handles multi-char operators greedily", () => {
    const tokens = tokenize("a => b", "test.ts");
    const arrow = tokens.find((t) => t.normalized === "=>");
    expect(arrow).toBeDefined();
  });

  it("produces identical normalized output for renamed variables", () => {
    const code1 = "function add(a, b) { return a + b; }";
    const code2 = "function sum(x, y) { return x + y; }";
    const t1 = tokenize(code1, "a.ts").map((t) => t.normalized);
    const t2 = tokenize(code2, "b.ts").map((t) => t.normalized);
    expect(t1).toEqual(t2);
  });

  it("does not skip string contents that look like comments", () => {
    const tokens = tokenize('const x = "// not a comment"', "test.ts");
    const strToken = tokens.find((t) => t.type === TokenType.StringLiteral);
    expect(strToken).toBeDefined();
    expect(strToken!.original).toBe('"// not a comment"');
  });

  it("handles escaped quotes in strings", () => {
    const tokens = tokenize('const x = "he said \\"hi\\""', "test.ts");
    const strToken = tokens.find((t) => t.type === TokenType.StringLiteral);
    expect(strToken).toBeDefined();
    expect(strToken!.normalized).toBe("$STR");
  });

  it("handles files with no recognized comment style", () => {
    const tokens = tokenize("hello world", "test.unknown");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.normalized).toBe("$ID");
  });

  it("does not greedily consume identifiers after numbers (0in)", () => {
    const tokens = tokenize("for x in range(0, 10)", "test.py");
    const inToken = tokens.find(
      (t) => t.original === "in" && t.normalized === "in",
    );
    expect(inToken).toBeDefined();
    expect(inToken!.type).toBe(TokenType.Keyword);
  });

  it("handles multiline backtick template literals", () => {
    const code = "const s = `line1\nline2\nline3`\nconst x = 1";
    const tokens = tokenize(code, "test.ts");
    const strToken = tokens.find((t) => t.type === TokenType.StringLiteral);
    expect(strToken).toBeDefined();
    expect(strToken!.normalized).toBe("$STR");
    expect(strToken!.line).toBe(1);
    // x should be on line 4
    const xToken = tokens.find((t) => t.original === "x");
    expect(xToken).toBeDefined();
    expect(xToken!.line).toBe(4);
  });

  it("handles CRLF line endings", () => {
    const code = "a\r\nb\r\nc";
    const tokens = tokenize(code, "test.ts");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]!.line).toBe(1);
    expect(tokens[1]!.line).toBe(2);
    expect(tokens[2]!.line).toBe(3);
  });

  it("handles unterminated block comment gracefully", () => {
    const tokens = tokenize("x /* unterminated", "test.ts");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.original).toBe("x");
  });

  it("handles unterminated string literal gracefully", () => {
    const tokens = tokenize('const x = "unterminated', "test.ts");
    // Should not crash or infinite loop
    expect(tokens.length).toBeGreaterThanOrEqual(2);
  });

  it("handles BigInt suffix (n)", () => {
    const tokens = tokenize("const x = 100n", "test.ts");
    const numToken = tokens.find((t) => t.type === TokenType.NumericLiteral);
    expect(numToken).toBeDefined();
    expect(numToken!.normalized).toBe("$NUM");
    expect(numToken!.original).toContain("100");
  });

  it("produces same tokens regardless of whitespace", () => {
    const code1 = "if (x) { return y; }";
    const code2 = "if  (  x  )  {  return  y  ;  }";
    const t1 = tokenize(code1, "a.ts").map((t) => t.normalized);
    const t2 = tokenize(code2, "b.ts").map((t) => t.normalized);
    expect(t1).toEqual(t2);
  });

  it("handles empty file", () => {
    const tokens = tokenize("", "test.ts");
    expect(tokens).toHaveLength(0);
  });

  it("handles comment-only file", () => {
    const tokens = tokenize("// just a comment\n// another", "test.ts");
    expect(tokens).toHaveLength(0);
  });

  it("handles Lua comments", () => {
    const tokens = tokenize("x -- comment\ny", "test.lua");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.original).toBe("x");
    expect(tokens[1]!.original).toBe("y");
  });

  it("handles HTML comments", () => {
    const tokens = tokenize("x <!-- comment --> y", "test.html");
    expect(tokens).toHaveLength(2);
  });

  it("handles Python triple-quoted strings", () => {
    const code = 'x = """hello # world\nmore text"""\ny = 1';
    const tokens = tokenize(code, "test.py");
    // # inside triple-quoted string should NOT be treated as comment
    const strToken = tokens.find((t) => t.type === TokenType.StringLiteral);
    expect(strToken).toBeDefined();
    expect(strToken!.normalized).toBe("$STR");
    // y should be on line 3
    const yToken = tokens.find((t) => t.original === "y");
    expect(yToken).toBeDefined();
    expect(yToken!.line).toBe(3);
  });

  it("handles Python triple single-quoted strings", () => {
    const code = "x = '''multi\nline'''\ny = 1";
    const tokens = tokenize(code, "test.py");
    const strToken = tokens.find((t) => t.type === TokenType.StringLiteral);
    expect(strToken).toBeDefined();
    expect(strToken!.normalized).toBe("$STR");
  });

  it("handles template literal with ${} interpolation", () => {
    const code = "const s = `hello ${name} world`";
    const tokens = tokenize(code, "test.ts");
    // The whole template literal should be one $STR token
    const strToken = tokens.find((t) => t.type === TokenType.StringLiteral);
    expect(strToken).toBeDefined();
    expect(strToken!.normalized).toBe("$STR");
  });
});
