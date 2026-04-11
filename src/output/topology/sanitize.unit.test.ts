import { describe, expect, it } from "bun:test";
import {
  escapeLabel,
  extractShortLabel,
  renderSubgraph,
  toNodeId,
  truncateLabel,
} from "./sanitize";

describe("toNodeId", () => {
  it("replaces slashes with underscores", () => {
    expect(toNodeId("apps/web-app")).toBe("apps_web_app");
  });

  it("strips @ and replaces / in scoped packages", () => {
    expect(toNodeId("@scope/pkg")).toBe("scope_pkg");
  });

  it("returns fallback for empty string", () => {
    expect(toNodeId("")).toBe("node_0");
  });

  it("prefixes leading digits", () => {
    expect(toNodeId("123-start")).toBe("_123_start");
  });

  it("replaces dots and spaces", () => {
    expect(toNodeId("my.service name")).toBe("my_service_name");
  });

  it("collapses consecutive underscores", () => {
    expect(toNodeId("a//b--c")).toBe("a_b_c");
  });

  it("generates unique IDs when seen set is provided", () => {
    const seen = new Set<string>();
    const id1 = toNodeId("apps/web", seen);
    const id2 = toNodeId("apps_web", seen);
    expect(id1).not.toBe(id2);
    expect(id2).toMatch(/^apps_web_\d+$/);
  });

  it("guarantees unique IDs for multiple empty strings with seen set", () => {
    const seen = new Set<string>();
    const id1 = toNodeId("", seen);
    const id2 = toNodeId("", seen);
    expect(id1).toBe("node_0");
    expect(id2).toBe("node_0_1");
    expect(id1).not.toBe(id2);
  });

  it("handles unicode by stripping non-alphanumeric chars", () => {
    const id = toNodeId("café-service");
    expect(id).toBe("caf_service");
  });

  it("handles very long names by truncating", () => {
    const long = "a".repeat(200);
    const id = toNodeId(long);
    expect(id.length).toBeLessThanOrEqual(100);
  });
});

describe("escapeLabel", () => {
  it("wraps label with double quotes when it contains special chars", () => {
    const result = escapeLabel("my-service (v2)");
    expect(result).toBe('"my-service (v2)"');
  });

  it("returns simple labels without quotes", () => {
    expect(escapeLabel("WebApp")).toBe("WebApp");
  });

  it("escapes internal double quotes", () => {
    const result = escapeLabel('He said "hello"');
    expect(result).toBe('"He said #quot;hello#quot;"');
  });

  it("escapes pipe characters using HTML numeric entity", () => {
    const result = escapeLabel("React | web | :3000");
    expect(result).toBe('"React #124; web #124; :3000"');
    expect(result).not.toContain("|");
  });

  it("handles empty string", () => {
    expect(escapeLabel("")).toBe('""');
  });

  it("wraps labels with slashes", () => {
    const result = escapeLabel("apps/web");
    expect(result).toBe('"apps/web"');
  });

  it("converts backslash-n to <br/>", () => {
    const result = escapeLabel("handler\\nsrc/a.ts:10");
    expect(result).toBe('"handler<br/>src/a.ts:10"');
  });

  it("converts multiple backslash-n sequences to <br/>", () => {
    const result = escapeLabel("a\\nb\\nc");
    expect(result).toBe('"a<br/>b<br/>c"');
  });

  it("handles backslash-n combined with quotes and pipes", () => {
    const result = escapeLabel('name\\n"port"|8080');
    expect(result).toBe('"name<br/>#quot;port#quot;#124;8080"');
  });

  it("passes through <br/> unchanged", () => {
    const result = escapeLabel("name<br/>:3000");
    expect(result).toBe('"name<br/>:3000"');
  });

  it("wraps mermaid reserved keywords in quotes", () => {
    expect(escapeLabel("if")).toBe('"if"');
    expect(escapeLabel("end")).toBe('"end"');
    expect(escapeLabel("subgraph")).toBe('"subgraph"');
    expect(escapeLabel("class")).toBe('"class"');
  });

  it("does not quote non-reserved alphanumeric labels", () => {
    expect(escapeLabel("WebApp")).toBe("WebApp");
    expect(escapeLabel("handler")).toBe("handler");
  });
});

describe("truncateLabel", () => {
  it("returns short labels unchanged", () => {
    expect(truncateLabel("Web App", 20)).toBe("Web App");
  });

  it("truncates long labels with ellipsis", () => {
    const result = truncateLabel("very-long-service-name-here", 15);
    expect(result).toBe("very-long-se...");
    expect(result.length).toBe(15);
  });

  it("uses default max length of 40", () => {
    const long = "a".repeat(50);
    const result = truncateLabel(long);
    expect(result.length).toBe(40);
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles string exactly at max length", () => {
    const exact = "a".repeat(20);
    expect(truncateLabel(exact, 20)).toBe(exact);
  });
});

describe("extractShortLabel", () => {
  it("extracts last path segment", () => {
    expect(extractShortLabel("packages/utils")).toBe("utils");
  });

  it("handles deeply nested paths", () => {
    expect(extractShortLabel("a/b/c/d")).toBe("d");
  });

  it("returns the string itself when no slashes", () => {
    expect(extractShortLabel("utils")).toBe("utils");
  });

  it("handles empty string", () => {
    expect(extractShortLabel("")).toBe("");
  });
});

describe("renderSubgraph", () => {
  it("renders a subgraph block", () => {
    const lines: string[] = [];
    renderSubgraph(lines, "Apps", (sub) => {
      sub.push("    A[Web]");
    });
    expect(lines).toEqual(["", "  subgraph Apps", "    A[Web]", "  end"]);
  });

  it("skips subgraph entirely when no nodes are rendered", () => {
    const lines: string[] = [];
    renderSubgraph(lines, "Empty", () => {});
    expect(lines).toEqual([]);
  });
});
