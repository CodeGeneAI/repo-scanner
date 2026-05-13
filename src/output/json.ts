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
  const out: string[] = [];
  writeValue(value, out, color, 0);
  out.push("\n");
  // Buffer everything into a single write so a broken pipe (e.g. `| head -5`)
  // produces at most one EPIPE we can ignore, instead of crashing mid-stream.
  try {
    stream.write(out.join(""));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "EPIPE") throw err;
  }
};

const writeValue = (
  v: unknown,
  out: string[],
  color: boolean,
  indent: number,
): void => {
  if (v === null) {
    out.push(color ? `${ANSI.BOLD}null${ANSI.RESET}` : "null");
    return;
  }
  if (typeof v === "boolean") {
    out.push(color ? `${ANSI.BOLD}${v}${ANSI.RESET}` : String(v));
    return;
  }
  if (typeof v === "number") {
    out.push(color ? `${ANSI.YELLOW}${v}${ANSI.RESET}` : String(v));
    return;
  }
  if (typeof v === "string") {
    const literal = JSON.stringify(v);
    out.push(color ? `${ANSI.GREEN}${literal}${ANSI.RESET}` : literal);
    return;
  }
  if (Array.isArray(v)) {
    writeArray(v, out, color, indent);
    return;
  }
  if (typeof v === "object") {
    writeObject(v as Record<string, unknown>, out, color, indent);
    return;
  }
  // Fallback: undefined/function/symbol — emit null to keep output valid JSON.
  out.push("null");
};

const writeArray = (
  arr: readonly unknown[],
  out: string[],
  color: boolean,
  indent: number,
): void => {
  if (arr.length === 0) {
    out.push("[]");
    return;
  }
  const padInner = "  ".repeat(indent + 1);
  const padOuter = "  ".repeat(indent);
  out.push("[\n");
  arr.forEach((item, i) => {
    out.push(padInner);
    writeValue(item, out, color, indent + 1);
    if (i < arr.length - 1) out.push(",");
    out.push("\n");
  });
  out.push(`${padOuter}]`);
};

const writeObject = (
  obj: Record<string, unknown>,
  out: string[],
  color: boolean,
  indent: number,
): void => {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    out.push("{}");
    return;
  }
  const padInner = "  ".repeat(indent + 1);
  const padOuter = "  ".repeat(indent);
  out.push("{\n");
  keys.forEach((k, i) => {
    out.push(padInner);
    const keyLit = JSON.stringify(k);
    out.push(color ? `${ANSI.CYAN}${keyLit}${ANSI.RESET}` : keyLit);
    out.push(": ");
    writeValue(obj[k], out, color, indent + 1);
    if (i < keys.length - 1) out.push(",");
    out.push("\n");
  });
  out.push(`${padOuter}}`);
};
