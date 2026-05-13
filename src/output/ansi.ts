export const ANSI = {
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  YELLOW: "\x1b[33m",
  CYAN: "\x1b[36m",
  GREEN: "\x1b[32m",
  RESET: "\x1b[0m",
} as const;

/**
 * Decide whether to emit ANSI color escapes.
 *
 * Rules (highest precedence first):
 * 1. Explicit user override: `--no-color` flag → false.
 * 2. NO_COLOR env var (any non-empty value) → false. See https://no-color.org.
 * 3. stdout is a TTY → true.
 * 4. Otherwise → false.
 */
export const shouldColor = (opts: {
  noColor: boolean;
  isTTY: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean => {
  if (opts.noColor) return false;
  const env = opts.env ?? process.env;
  if (env.NO_COLOR && env.NO_COLOR.length > 0) return false;
  return opts.isTTY;
};
