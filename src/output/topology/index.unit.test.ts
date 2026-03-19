import { describe, expect, it } from "vitest";
import type { Component, RepoScanResult } from "../../types";
import { generateTopology } from "./index";

const makeComponent = (
  name: string,
  kind: Component["kind"],
  metadata?: Component["metadata"],
): Component => ({
  name,
  path: `${kind}s/${name}`,
  kind,
  description: "",
  confidence: 1,
  evidence: [],
  metadata,
});

const makeFullResult = (): RepoScanResult =>
  ({
    architecture: {
      monorepo: true,
      components: [
        makeComponent("web", "app", {
          frameworks: ["React"],
          platform: "web",
          apiSurface: { endpointCount: 0, protocols: [] },
        }),
        makeComponent("api", "service", {
          datastores: ["PostgreSQL"],
          externalServices: [{ name: "Stripe", category: "payments" }],
          apiSurface: { endpointCount: 10, protocols: ["REST"] },
        }),
        makeComponent("utils", "package"),
      ],
      crossPackageDeps: {
        nodes: ["apps/web", "services/api", "packages/utils"],
        edges: [
          {
            from: "apps/web",
            to: "services/api",
            fromName: "web",
            toName: "api",
            ecosystem: "npm",
            isDev: false,
          },
          {
            from: "services/api",
            to: "packages/utils",
            fromName: "api",
            toName: "utils",
            ecosystem: "npm",
            isDev: false,
          },
        ],
        orphans: [],
      },
      circularDeps: [],
      layerViolations: [],
    },
    inventory: {},
    buildAndTest: {},
    signals: {},
    scanPath: "/tmp/test",
    timestamp: new Date().toISOString(),
    durationMs: 0,
  }) as unknown as RepoScanResult;

describe("generateTopology", () => {
  it("generates all applicable diagrams by default", () => {
    const result = generateTopology(makeFullResult());
    expect(result.diagrams.length).toBeGreaterThanOrEqual(3);
    const kinds = result.diagrams.map((d) => d.kind);
    expect(kinds).toContain("architecture");
    expect(kinds).toContain("dependency");
    expect(kinds).toContain("dataflow");
    expect(kinds).toContain("api-topology");
  });

  it("filters to requested kinds", () => {
    const result = generateTopology(makeFullResult(), ["architecture"]);
    expect(result.diagrams).toHaveLength(1);
    expect(result.diagrams[0]!.kind).toBe("architecture");
  });

  it("skips dataflow when no datastores/services", () => {
    const bare = {
      ...makeFullResult(),
      architecture: {
        monorepo: false,
        components: [makeComponent("cli", "app")],
      },
    } as unknown as RepoScanResult;

    const result = generateTopology(bare, ["dataflow"]);
    expect(result.diagrams).toHaveLength(0);
  });

  it("skips api-topology when no API surfaces", () => {
    const bare = {
      ...makeFullResult(),
      architecture: {
        monorepo: false,
        components: [makeComponent("worker", "service")],
      },
    } as unknown as RepoScanResult;

    const result = generateTopology(bare, ["api-topology"]);
    expect(result.diagrams).toHaveLength(0);
  });

  it("each diagram has non-empty kind, title, and mermaid", () => {
    const result = generateTopology(makeFullResult());
    for (const d of result.diagrams) {
      expect(d.kind).toBeTruthy();
      expect(d.title).toBeTruthy();
      expect(d.mermaid.length).toBeGreaterThan(0);
    }
  });

  it("generates erd diagram when databaseSchema is present", () => {
    const full = makeFullResult();
    const withSchema = {
      ...full,
      inventory: {
        databaseSchema: {
          tables: [
            {
              name: "users",
              columns: [{ name: "id", type: "int", isPrimaryKey: true }],
              source: { file: "schema.sql", parser: "sql", confidence: 0.95 },
            },
          ],
          relationships: [],
          summary: { totalTables: 1, totalColumns: 1, totalRelationships: 0 },
        },
      },
    } as unknown as RepoScanResult;

    const result = generateTopology(withSchema, ["erd"]);
    expect(result.diagrams).toHaveLength(1);
    expect(result.diagrams[0]!.kind).toBe("erd");
    expect(result.diagrams[0]!.mermaid).toContain("erDiagram");
  });

  it("skips erd when no databaseSchema", () => {
    const result = generateTopology(makeFullResult(), ["erd"]);
    expect(result.diagrams).toHaveLength(0);
  });

  it("includes erd in default generation when schema is present", () => {
    const full = makeFullResult();
    const withSchema = {
      ...full,
      inventory: {
        databaseSchema: {
          tables: [
            {
              name: "users",
              columns: [{ name: "id", type: "int" }],
              source: { file: "schema.sql", parser: "sql", confidence: 0.95 },
            },
          ],
          relationships: [],
          summary: { totalTables: 1, totalColumns: 1, totalRelationships: 0 },
        },
      },
    } as unknown as RepoScanResult;

    const result = generateTopology(withSchema);
    const kinds = result.diagrams.map((d) => d.kind);
    expect(kinds).toContain("erd");
  });

  it("handles empty result gracefully", () => {
    const empty = {
      architecture: { monorepo: false, components: [] },
      inventory: {},
      buildAndTest: {},
      signals: {},
      scanPath: "/tmp",
      timestamp: new Date().toISOString(),
      durationMs: 0,
    } as unknown as RepoScanResult;

    const result = generateTopology(empty);
    // Architecture diagram is always generated (even if empty)
    expect(result.diagrams.length).toBeGreaterThanOrEqual(1);
    expect(result.diagrams[0]!.kind).toBe("architecture");
  });

  it("generates call-graph diagram when callGraph is present", () => {
    const full = makeFullResult();
    const withCallGraph = {
      ...full,
      inventory: {
        callGraph: {
          nodes: [
            { id: "n1", name: "handler", file: "src/a.ts", line: 1 },
            { id: "n2", name: "service", file: "src/b.ts", line: 2 },
          ],
          edges: [
            {
              callerId: "n1",
              calleeId: "n2",
              line: 1,
              caller: { name: "handler", file: "src/a.ts" },
              callee: { name: "service", file: "src/b.ts" },
            },
          ],
        },
      },
    } as unknown as RepoScanResult;

    const result = generateTopology(withCallGraph, ["call-graph"]);
    expect(result.diagrams).toHaveLength(1);
    expect(result.diagrams[0]!.kind).toBe("call-graph");
  });
});
