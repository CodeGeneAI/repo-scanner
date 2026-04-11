import { describe, expect, it } from "bun:test";
import type { FileAnalysis, MethodInfo } from "../queries/types";
import { analyzeLsp } from "./lsp";

/** Create a minimal FileAnalysis with overrides. */
const makeAnalysis = (overrides: Partial<FileAnalysis> = {}): FileAnalysis => ({
  classes: [],
  imports: [],
  interfaces: [],
  instantiations: [],
  typeChecks: [],
  ...overrides,
});

/** Create a minimal MethodInfo with overrides. */
const makeMethod = (overrides: Partial<MethodInfo> = {}): MethodInfo => ({
  name: "someMethod",
  line: 1,
  complexity: 1,
  isOverride: false,
  isEmpty: false,
  throwsNotImplemented: false,
  ...overrides,
});

describe("analyzeLsp", () => {
  it("returns score 100 for empty file map", () => {
    const result = analyzeLsp(new Map());

    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
    expect(result.summary).toBe("No LSP violations detected");
  });

  it("flags override that throws NotImplemented as error", () => {
    const fileMap = new Map([
      [
        "src/child.ts",
        makeAnalysis({
          classes: [
            {
              name: "ChildClass",
              line: 1,
              methods: [
                makeMethod({
                  name: "doWork",
                  line: 5,
                  isOverride: true,
                  throwsNotImplemented: true,
                }),
              ],
              fieldCount: 0,
              loc: 20,
            },
          ],
        }),
      ],
    ]);

    const result = analyzeLsp(fileMap);

    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    const violation = result.violations[0]!;
    expect(violation.severity).toBe("error");
    expect(violation.entity).toBe("ChildClass.doWork");
    expect(violation.message).toContain("NotImplementedError");
  });

  it("flags empty override as warning", () => {
    const fileMap = new Map([
      [
        "src/child.ts",
        makeAnalysis({
          classes: [
            {
              name: "ChildClass",
              line: 1,
              methods: [
                makeMethod({
                  name: "onEvent",
                  line: 10,
                  isOverride: true,
                  isEmpty: true,
                }),
              ],
              fieldCount: 0,
              loc: 15,
            },
          ],
        }),
      ],
    ]);

    const result = analyzeLsp(fileMap);

    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    const violation = result.violations[0]!;
    expect(violation.severity).toBe("warning");
    expect(violation.entity).toBe("ChildClass.onEvent");
    expect(violation.message).toContain("empty body");
  });

  it("ignores non-override methods", () => {
    const fileMap = new Map([
      [
        "src/normal.ts",
        makeAnalysis({
          classes: [
            {
              name: "NormalClass",
              line: 1,
              methods: [
                makeMethod({
                  name: "regularMethod",
                  isOverride: false,
                  isEmpty: true,
                }),
                makeMethod({
                  name: "anotherMethod",
                  isOverride: false,
                  throwsNotImplemented: true,
                }),
              ],
              fieldCount: 0,
              loc: 20,
            },
          ],
        }),
      ],
    ]);

    const result = analyzeLsp(fileMap);

    expect(result.violations).toHaveLength(0);
    expect(result.score).toBe(100);
  });
});
