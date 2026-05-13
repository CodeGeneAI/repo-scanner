import { describe, expect, test } from "bun:test";
import { Writable } from "stream";
import { renderJson } from "./json";

const capture = (cb: (w: NodeJS.WritableStream) => void): string => {
  let out = "";
  const stream = new Writable({
    write(chunk, _enc, cbk) {
      out += chunk.toString();
      cbk();
    },
  });
  cb(stream as NodeJS.WritableStream);
  return out;
};

// Strip ANSI escape sequences. We split on ESC (char code 27) and reconstruct
// without the CSI sequences, avoiding regex control-character lint rules.
const ESC = String.fromCharCode(27);
const stripAnsi = (s: string): string =>
  s
    .split(ESC)
    .map((part, i) => (i === 0 ? part : part.replace(/^\[[0-9;]*m/, "")))
    .join("");

describe("renderJson", () => {
  const sample = {
    s: "hello",
    n: 42,
    b: true,
    nul: null,
    arr: [1, "two", false],
    nested: { key: "val" },
  };

  test("plain output (no color) matches JSON.stringify with 2-space indent", () => {
    const out = capture((w) => renderJson(sample, w, { color: false }));
    expect(out.replace(/\n$/, "")).toBe(JSON.stringify(sample, null, 2));
  });

  test("colored output contains ANSI escapes for keys, strings, numbers, booleans, null", () => {
    const out = capture((w) => renderJson(sample, w, { color: true }));
    expect(out).toContain(`${ESC}[36m`); // CYAN — keys
    expect(out).toContain(`${ESC}[32m`); // GREEN — strings
    expect(out).toContain(`${ESC}[33m`); // YELLOW — numbers
    expect(out).toContain(`${ESC}[1m`); // BOLD — booleans/null
    expect(out).toContain(`${ESC}[0m`); // RESET
  });

  test("colored output is still valid JSON after stripping ANSI", () => {
    const out = capture((w) => renderJson(sample, w, { color: true }));
    expect(JSON.parse(stripAnsi(out))).toEqual(sample);
  });

  test("backwards-compatible default (no opts arg) emits plain JSON", () => {
    const out = capture((w) => renderJson(sample, w));
    expect(JSON.parse(out)).toEqual(sample);
    expect(out).not.toContain(ESC);
  });

  test("empty array and empty object render correctly", () => {
    const out1 = capture((w) =>
      renderJson({ a: [], b: {} }, w, { color: true }),
    );
    expect(JSON.parse(stripAnsi(out1))).toEqual({ a: [], b: {} });
  });

  test("escapes special characters in strings", () => {
    const v = { s: 'quote " backslash \\ newline \n tab \t' };
    const plain = capture((w) => renderJson(v, w, { color: false }));
    expect(JSON.parse(plain)).toEqual(v);
    const colored = capture((w) => renderJson(v, w, { color: true }));
    expect(JSON.parse(stripAnsi(colored))).toEqual(v);
  });
});
