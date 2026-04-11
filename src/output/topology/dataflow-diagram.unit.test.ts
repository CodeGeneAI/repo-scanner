import { describe, expect, it } from "bun:test";
import type { Component, RepoScanResult } from "../../types";
import { generateDataflowDiagram } from "./dataflow-diagram";

const makeComponent = (
  name: string,
  datastores?: readonly string[],
  externalServices?: readonly { name: string; category: string }[],
): Component => ({
  name,
  path: `services/${name}`,
  kind: "service",
  description: `${name} service`,
  confidence: 1,
  evidence: [],
  metadata: {
    ...(datastores ? { datastores } : {}),
    ...(externalServices ? { externalServices } : {}),
  },
});

const makeResult = (components: Component[]): RepoScanResult =>
  ({
    architecture: {
      monorepo: true,
      components,
    },
    inventory: {},
    buildAndTest: {},
    signals: {},
    scanPath: "/tmp/test",
    timestamp: new Date().toISOString(),
    durationMs: 0,
  }) as unknown as RepoScanResult;

describe("generateDataflowDiagram", () => {
  it("returns null when no components have datastores or external services", () => {
    const result = makeResult([makeComponent("api")]);
    expect(generateDataflowDiagram(result)).toBeNull();
  });

  it("returns null for empty components", () => {
    const result = makeResult([]);
    expect(generateDataflowDiagram(result)).toBeNull();
  });

  it("generates diagram for component with datastores", () => {
    const result = makeResult([makeComponent("api", ["PostgreSQL", "Redis"])]);
    const diagram = generateDataflowDiagram(result)!;
    expect(diagram).not.toBeNull();
    expect(diagram.kind).toBe("dataflow");
    expect(diagram.mermaid).toMatch(/^flowchart LR/);
    expect(diagram.mermaid).toContain("PostgreSQL");
    expect(diagram.mermaid).toContain("Redis");
    // Datastores use cylinder shape [( )]
    expect(diagram.mermaid).toContain("[(");
  });

  it("deduplicates shared datastores across components", () => {
    const result = makeResult([
      makeComponent("api", ["PostgreSQL"]),
      makeComponent("worker", ["PostgreSQL"]),
    ]);
    const diagram = generateDataflowDiagram(result)!;
    // PostgreSQL node should appear once as a declaration
    const matches = diagram.mermaid.match(/\[\(.*PostgreSQL.*\)\]/g);
    expect(matches).toHaveLength(1);
    // But two edges pointing to it
    expect(diagram.mermaid).toContain("-->");
  });

  it("generates external service nodes", () => {
    const result = makeResult([
      makeComponent("payments", undefined, [
        { name: "Stripe", category: "payments" },
      ]),
    ]);
    const diagram = generateDataflowDiagram(result)!;
    expect(diagram.mermaid).toContain("Stripe");
    // External services use double circle ((( )))
    expect(diagram.mermaid).toContain("(((");
  });

  it("handles mixed datastores and external services", () => {
    const result = makeResult([
      makeComponent(
        "api",
        ["PostgreSQL"],
        [{ name: "SendGrid", category: "email" }],
      ),
    ]);
    const diagram = generateDataflowDiagram(result)!;
    expect(diagram.mermaid).toContain("PostgreSQL");
    expect(diagram.mermaid).toContain("SendGrid");
  });

  it("deduplicates external services across components", () => {
    const result = makeResult([
      makeComponent("api", undefined, [{ name: "Auth0", category: "auth" }]),
      makeComponent("worker", undefined, [{ name: "Auth0", category: "auth" }]),
    ]);
    const diagram = generateDataflowDiagram(result)!;
    const auth0Matches = diagram.mermaid.match(/\(\(\(.*Auth0.*\)\)\)/g);
    expect(auth0Matches).toHaveLength(1);
  });
});
