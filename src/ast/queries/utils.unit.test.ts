import { describe, expect, it } from "bun:test";
import type { QueryCapture, QueryMatch } from "web-tree-sitter";
import {
  bodyThrowsNotImplemented,
  countBranches,
  findCapture,
  findEnclosingFunction,
  isEmptyBody,
} from "./utils";

describe("countBranches", () => {
  it("returns 0 for null node", () => {
    expect(countBranches(null, new Set(["if_statement"]))).toBe(0);
  });
});

describe("findEnclosingFunction", () => {
  it('returns "<module>" for null node', () => {
    expect(findEnclosingFunction(null, new Set(["function_declaration"]))).toBe(
      "<module>",
    );
  });
});

describe("findCapture", () => {
  it("returns the capture matching the requested name", () => {
    const classNameCapture = {
      name: "class_name",
      node: { text: "UserService" },
      patternIndex: 0,
    } as unknown as QueryCapture;
    const classBodyCapture = {
      name: "class_body",
      node: { text: "{ }" },
      patternIndex: 0,
    } as unknown as QueryCapture;

    const capture = findCapture(
      {
        captures: [classNameCapture, classBodyCapture],
        patternIndex: 0,
      } as QueryMatch,
      "class_body",
    );

    expect(capture).toBe(classBodyCapture);
  });
});

describe("isEmptyBody", () => {
  it("returns true for null node", () => {
    expect(isEmptyBody(null)).toBe(true);
  });

  it('returns true for "{}"', () => {
    const fakeNode = { text: "{}" } as any;
    expect(isEmptyBody(fakeNode)).toBe(true);
  });

  it("returns false for non-empty body", () => {
    const fakeNode = { text: "{ return this.value + 1; }" } as any;
    expect(isEmptyBody(fakeNode)).toBe(false);
  });
});

describe("bodyThrowsNotImplemented", () => {
  it("returns false for null node", () => {
    expect(bodyThrowsNotImplemented(null)).toBe(false);
  });
});
