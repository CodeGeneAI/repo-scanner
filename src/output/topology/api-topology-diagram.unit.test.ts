import { describe, expect, it } from "bun:test";
import type { Component, RepoScanResult } from "../../types";
import { generateApiTopologyDiagram } from "./api-topology-diagram";

const makeComponent = (
  name: string,
  apiSurface?: { endpointCount: number; protocols: readonly string[] },
): Component => ({
  name,
  path: `services/${name}`,
  kind: "service",
  description: `${name} service`,
  confidence: 1,
  evidence: [],
  metadata: apiSurface ? { apiSurface } : {},
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

describe("generateApiTopologyDiagram", () => {
  it("returns null when no components have API surfaces", () => {
    const result = makeResult([makeComponent("worker")]);
    expect(generateApiTopologyDiagram(result)).toBeNull();
  });

  it("returns null for empty components", () => {
    const result = makeResult([]);
    expect(generateApiTopologyDiagram(result)).toBeNull();
  });

  it("generates diagram for component with REST API", () => {
    const result = makeResult([
      makeComponent("api", { endpointCount: 10, protocols: ["REST"] }),
    ]);
    const diagram = generateApiTopologyDiagram(result)!;
    expect(diagram).not.toBeNull();
    expect(diagram.kind).toBe("api-topology");
    expect(diagram.mermaid).toMatch(/^flowchart LR/);
    expect(diagram.mermaid).toContain("REST");
    expect(diagram.mermaid).toContain("10");
  });

  it("groups by protocol in separate subgraphs", () => {
    const result = makeResult([
      makeComponent("api", { endpointCount: 10, protocols: ["REST"] }),
      makeComponent("gateway", {
        endpointCount: 5,
        protocols: ["GraphQL"],
      }),
    ]);
    const diagram = generateApiTopologyDiagram(result)!;
    expect(diagram.mermaid).toContain("REST");
    expect(diagram.mermaid).toContain("GraphQL");
  });

  it("handles component with multiple protocols", () => {
    const result = makeResult([
      makeComponent("api", {
        endpointCount: 15,
        protocols: ["REST", "WebSocket"],
      }),
    ]);
    const diagram = generateApiTopologyDiagram(result)!;
    expect(diagram.mermaid).toContain("REST");
    expect(diagram.mermaid).toContain("WebSocket");
  });

  it("shows endpoint count on edge labels", () => {
    const result = makeResult([
      makeComponent("api", { endpointCount: 42, protocols: ["REST"] }),
    ]);
    const diagram = generateApiTopologyDiagram(result)!;
    expect(diagram.mermaid).toContain("42");
  });
});
