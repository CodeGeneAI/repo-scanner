import { describe, expect, it } from "vitest";
import {
  bodyThrowsNotImplemented,
  countBranches,
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
