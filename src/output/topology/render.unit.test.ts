import { describe, expect, it } from "bun:test";
import {
  renderTopologyMarkdown,
  renderTopologyRaw,
  renderTopologyToString,
} from "./render";
import type { TopologyResult } from "./types";

const makeTopo = (count: number): TopologyResult => ({
  diagrams: Array.from({ length: count }, (_, i) => ({
    kind: "architecture" as const,
    title: `Diagram ${i + 1}`,
    mermaid: `flowchart TD\n  A${i} --> B${i}`,
  })),
});

describe("renderTopologyMarkdown", () => {
  it("renders single diagram with header and fenced code block", () => {
    const result = renderTopologyMarkdown(makeTopo(1));
    expect(result).toContain("## Diagram 1");
    expect(result).toContain("```mermaid");
    expect(result).toContain("flowchart TD");
    expect(result).toContain("```");
  });

  it("renders multiple diagrams separated by headers", () => {
    const result = renderTopologyMarkdown(makeTopo(2));
    expect(result).toContain("## Diagram 1");
    expect(result).toContain("## Diagram 2");
    expect((result.match(/```mermaid/g) ?? []).length).toBe(2);
  });

  it("handles empty diagrams array", () => {
    const result = renderTopologyMarkdown({ diagrams: [] });
    expect(result).toContain("# Topology");
    expect(result).not.toContain("```mermaid");
  });

  it("includes a top-level heading", () => {
    const result = renderTopologyMarkdown(makeTopo(1));
    expect(result).toMatch(/^# Topology\n/);
  });
});

describe("renderTopologyRaw", () => {
  it("renders diagrams separated by mermaid comments", () => {
    const result = renderTopologyRaw(makeTopo(2));
    expect(result).toContain("%% --- Diagram 1 ---");
    expect(result).toContain("%% --- Diagram 2 ---");
    expect(result).toContain("flowchart TD");
  });

  it("handles single diagram without separator", () => {
    const result = renderTopologyRaw(makeTopo(1));
    expect(result).toContain("flowchart TD");
  });

  it("handles empty diagrams", () => {
    const result = renderTopologyRaw({ diagrams: [] });
    expect(result).toBe("");
  });
});

describe("renderTopologyToString", () => {
  it("delegates to markdown renderer", () => {
    const result = renderTopologyToString(makeTopo(1), "markdown");
    expect(result).toContain("```mermaid");
  });

  it("delegates to raw renderer", () => {
    const result = renderTopologyToString(makeTopo(1), "raw");
    expect(result).not.toContain("```mermaid");
    expect(result).toContain("flowchart TD");
  });
});
