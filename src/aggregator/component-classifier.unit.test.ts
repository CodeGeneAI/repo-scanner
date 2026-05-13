import { describe, expect, test } from "bun:test";
import { classifyComponent } from "./component-classifier";

describe("classifyComponent: round-2 fixes", () => {
  test("Cargo crates path → library", () => {
    expect(classifyComponent({ path: "crates/globset" })).toBe("library");
    expect(classifyComponent({ path: "crates/grep/searcher" })).toBe("library");
  });

  test("hint with manifestPath but no path rule defaults to package", () => {
    expect(
      classifyComponent({
        path: "svc-a",
        manifestPath: "/repo/svc-a/go.mod",
      }),
    ).toBe("package");
  });

  test("hint with no manifestPath and no path rule still returns undefined", () => {
    expect(classifyComponent({ path: "random-folder" })).toBeUndefined();
  });

  test("name heuristics still upgrade an otherwise-package hint", () => {
    expect(
      classifyComponent({
        path: "svc-a",
        name: "api-gateway",
        manifestPath: "/repo/svc-a/go.mod",
      }),
    ).toBe("service");
  });
});
