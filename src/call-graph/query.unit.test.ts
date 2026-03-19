import { describe, expect, it } from "bun:test";
import type { CallGraph } from "../types";
import { getCallChain, getCalleesOf, getCallersOf } from "./query";

const graph: CallGraph = {
  nodes: [
    { id: "a", name: "handler", file: "src/a.ts", line: 1 },
    { id: "b", name: "service", file: "src/b.ts", line: 1 },
    { id: "c", name: "repo", file: "src/c.ts", line: 1 },
  ],
  edges: [
    {
      callerId: "a",
      calleeId: "b",
      line: 1,
      caller: { name: "handler", file: "src/a.ts" },
      callee: { name: "service", file: "src/b.ts" },
    },
    {
      callerId: "b",
      calleeId: "c",
      line: 2,
      caller: { name: "service", file: "src/b.ts" },
      callee: { name: "repo", file: "src/c.ts" },
    },
  ],
};

describe("call graph query", () => {
  it("returns transitive callees", () => {
    expect(getCalleesOf(graph, "handler", "src/a.ts")).toEqual(["b", "c"]);
  });

  it("returns transitive callers", () => {
    expect(getCallersOf(graph, "repo", "src/c.ts")).toEqual(["b", "a"]);
  });

  it("returns shortest chain", () => {
    expect(
      getCallChain(
        graph,
        { name: "handler", file: "src/a.ts" },
        { name: "repo", file: "src/c.ts" },
      ),
    ).toEqual(["a", "b", "c"]);
  });
});
