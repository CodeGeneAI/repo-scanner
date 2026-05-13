import { describe, expect, test } from "bun:test";
import { shouldColor } from "./ansi";

describe("shouldColor", () => {
  test("returns false when noColor flag is true regardless of TTY", () => {
    expect(shouldColor({ noColor: true, isTTY: true, env: {} })).toBe(false);
  });

  test("returns false when NO_COLOR env var is set (any non-empty value)", () => {
    expect(
      shouldColor({ noColor: false, isTTY: true, env: { NO_COLOR: "1" } }),
    ).toBe(false);
    expect(
      shouldColor({
        noColor: false,
        isTTY: true,
        env: { NO_COLOR: "anything" },
      }),
    ).toBe(false);
  });

  test("treats empty-string NO_COLOR as 'not set' (allows color)", () => {
    expect(
      shouldColor({ noColor: false, isTTY: true, env: { NO_COLOR: "" } }),
    ).toBe(true);
  });

  test("returns true when TTY and no overrides", () => {
    expect(shouldColor({ noColor: false, isTTY: true, env: {} })).toBe(true);
  });

  test("returns false when stdout is not a TTY", () => {
    expect(shouldColor({ noColor: false, isTTY: false, env: {} })).toBe(false);
  });
});
