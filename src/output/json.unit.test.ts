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

describe("renderJson EPIPE handling", () => {
  test("swallows EPIPE so a broken downstream pipe does not crash", () => {
    const stream = new Writable({
      write(_chunk, _enc, cbk) {
        const err = new Error("EPIPE") as NodeJS.ErrnoException;
        err.code = "EPIPE";
        cbk(err);
      },
    }) as NodeJS.WritableStream;
    // Force the throw path by overriding write to throw synchronously.
    const original = stream.write.bind(stream);
    stream.write = ((chunk: unknown): boolean => {
      const err = new Error("EPIPE") as NodeJS.ErrnoException;
      err.code = "EPIPE";
      throw err;
    }) as typeof stream.write;
    // Should not throw.
    expect(() => renderJson({ a: 1 }, stream)).not.toThrow();
    // Reattach to avoid unused-variable lint flag.
    stream.write = original;
  });

  test("rethrows non-EPIPE errors", () => {
    const stream = new Writable({
      write(_chunk, _enc, cbk) {
        cbk();
      },
    }) as NodeJS.WritableStream;
    stream.write = ((): boolean => {
      throw new Error("disk full");
    }) as typeof stream.write;
    expect(() => renderJson({ a: 1 }, stream)).toThrow(/disk full/);
  });
});

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
