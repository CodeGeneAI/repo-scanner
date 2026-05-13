import { ANSI } from "./ansi";

export interface RenderJsonOptions {
  readonly color?: boolean;
}

export const renderJson = (
  value: unknown,
  stream: NodeJS.WritableStream,
  opts: RenderJsonOptions = {},
): void => {
  const color = opts.color === true;
  writeValue(value, stream, color, 0);
  stream.write("\n");
};

const writeValue = (
  v: unknown,
  s: NodeJS.WritableStream,
  color: boolean,
  indent: number,
): void => {
  if (v === null) {
    s.write(color ? `${ANSI.BOLD}null${ANSI.RESET}` : "null");
    return;
  }
  if (typeof v === "boolean") {
    s.write(color ? `${ANSI.BOLD}${v}${ANSI.RESET}` : String(v));
    return;
  }
  if (typeof v === "number") {
    s.write(color ? `${ANSI.YELLOW}${v}${ANSI.RESET}` : String(v));
    return;
  }
  if (typeof v === "string") {
    const literal = JSON.stringify(v);
    s.write(color ? `${ANSI.GREEN}${literal}${ANSI.RESET}` : literal);
    return;
  }
  if (Array.isArray(v)) {
    writeArray(v, s, color, indent);
    return;
  }
  if (typeof v === "object") {
    writeObject(v as Record<string, unknown>, s, color, indent);
    return;
  }
  // Fallback: undefined/function/symbol — emit null to keep output valid JSON.
  s.write("null");
};

const writeArray = (
  arr: readonly unknown[],
  s: NodeJS.WritableStream,
  color: boolean,
  indent: number,
): void => {
  if (arr.length === 0) {
    s.write("[]");
    return;
  }
  const padInner = "  ".repeat(indent + 1);
  const padOuter = "  ".repeat(indent);
  s.write("[\n");
  arr.forEach((item, i) => {
    s.write(padInner);
    writeValue(item, s, color, indent + 1);
    if (i < arr.length - 1) s.write(",");
    s.write("\n");
  });
  s.write(`${padOuter}]`);
};

const writeObject = (
  obj: Record<string, unknown>,
  s: NodeJS.WritableStream,
  color: boolean,
  indent: number,
): void => {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    s.write("{}");
    return;
  }
  const padInner = "  ".repeat(indent + 1);
  const padOuter = "  ".repeat(indent);
  s.write("{\n");
  keys.forEach((k, i) => {
    s.write(padInner);
    const keyLit = JSON.stringify(k);
    s.write(color ? `${ANSI.CYAN}${keyLit}${ANSI.RESET}` : keyLit);
    s.write(": ");
    writeValue(obj[k], s, color, indent + 1);
    if (i < keys.length - 1) s.write(",");
    s.write("\n");
  });
  s.write(`${padOuter}}`);
};
