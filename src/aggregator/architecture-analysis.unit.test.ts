import { describe, expect, it } from "bun:test";
import type { Component, CrossPackageDependencyGraph } from "../types";
import {
  computeBlastRadius,
  detectCircularDeps,
  detectLayerViolations,
} from "./architecture-analysis";

const makeEdge = (from: string, to: string, isDev = false) => ({
  from,
  to,
  fromName: `@scope/${from.split("/").pop()}`,
  toName: `@scope/${to.split("/").pop()}`,
  ecosystem: "npm" as const,
  isDev,
});

const makeComponent = (
  path: string,
  kind: Component["kind"],
  name?: string,
): Component => ({
  name: name ?? `@scope/${path.split("/").pop()}`,
  path,
  kind,
  description: "",
  confidence: 0.8,
  evidence: [],
});

describe("detectCircularDeps", () => {
  it("finds no cycles in a DAG", () => {
    const graph: CrossPackageDependencyGraph = {
      edges: [
        makeEdge("apps/web", "packages/ui"),
        makeEdge("apps/web", "packages/utils"),
        makeEdge("packages/ui", "packages/utils"),
      ],
      nodes: ["apps/web", "packages/ui", "packages/utils"],
      orphans: [],
    };
    expect(detectCircularDeps(graph)).toEqual([]);
  });

  it("detects a simple 2-node cycle", () => {
    const graph: CrossPackageDependencyGraph = {
      edges: [
        makeEdge("packages/a", "packages/b"),
        makeEdge("packages/b", "packages/a"),
      ],
      nodes: ["packages/a", "packages/b"],
      orphans: [],
    };
    const cycles = detectCircularDeps(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toContain("packages/a");
    expect(cycles[0]).toContain("packages/b");
  });

  it("detects a 3-node cycle", () => {
    const graph: CrossPackageDependencyGraph = {
      edges: [
        makeEdge("packages/a", "packages/b"),
        makeEdge("packages/b", "packages/c"),
        makeEdge("packages/c", "packages/a"),
      ],
      nodes: ["packages/a", "packages/b", "packages/c"],
      orphans: [],
    };
    const cycles = detectCircularDeps(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]!.length).toBe(3);
  });

  it("handles disconnected components", () => {
    const graph: CrossPackageDependencyGraph = {
      edges: [makeEdge("packages/a", "packages/b")],
      nodes: ["packages/a", "packages/b", "packages/c"],
      orphans: ["packages/c"],
    };
    expect(detectCircularDeps(graph)).toEqual([]);
  });
});

describe("detectLayerViolations", () => {
  it("allows app → service → package", () => {
    const graph: CrossPackageDependencyGraph = {
      edges: [
        makeEdge("apps/web", "services/api"),
        makeEdge("services/api", "packages/utils"),
      ],
      nodes: ["apps/web", "services/api", "packages/utils"],
      orphans: [],
    };
    const components = [
      makeComponent("apps/web", "app"),
      makeComponent("services/api", "service"),
      makeComponent("packages/utils", "package"),
    ];
    expect(detectLayerViolations(graph, components)).toEqual([]);
  });

  it("detects package → service violation", () => {
    const graph: CrossPackageDependencyGraph = {
      edges: [makeEdge("packages/utils", "services/api")],
      nodes: ["packages/utils", "services/api"],
      orphans: [],
    };
    const components = [
      makeComponent("packages/utils", "package"),
      makeComponent("services/api", "service"),
    ];
    const violations = detectLayerViolations(graph, components);
    expect(violations.length).toBe(1);
    expect(violations[0]!.fromKind).toBe("package");
    expect(violations[0]!.toKind).toBe("service");
    expect(violations[0]!.reason).toContain("should not depend on");
  });

  it("detects service → app violation", () => {
    const graph: CrossPackageDependencyGraph = {
      edges: [makeEdge("services/api", "apps/web")],
      nodes: ["services/api", "apps/web"],
      orphans: [],
    };
    const components = [
      makeComponent("services/api", "service"),
      makeComponent("apps/web", "app"),
    ];
    const violations = detectLayerViolations(graph, components);
    expect(violations.length).toBe(1);
    expect(violations[0]!.reason).toBe("service should not depend on app");
  });

  it("skips infra and script components", () => {
    const graph: CrossPackageDependencyGraph = {
      edges: [
        makeEdge("infra/deploy", "apps/web"),
        makeEdge("scripts/tools", "services/api"),
      ],
      nodes: ["infra/deploy", "scripts/tools", "apps/web", "services/api"],
      orphans: [],
    };
    const components = [
      makeComponent("infra/deploy", "infra"),
      makeComponent("scripts/tools", "script"),
      makeComponent("apps/web", "app"),
      makeComponent("services/api", "service"),
    ];
    expect(detectLayerViolations(graph, components)).toEqual([]);
  });
});

describe("computeBlastRadius", () => {
  it("returns empty for single component", () => {
    const graph: CrossPackageDependencyGraph = {
      edges: [],
      nodes: ["packages/a"],
      orphans: ["packages/a"],
    };
    const components = [makeComponent("packages/a", "package")];
    const { radiusMap, highImpact } = computeBlastRadius(graph, components);
    expect(radiusMap.size).toBe(0);
    expect(highImpact.length).toBe(0);
  });

  it("computes direct and transitive dependents", () => {
    // A → B → C (C has blast radius of 2)
    const graph: CrossPackageDependencyGraph = {
      edges: [
        makeEdge("apps/a", "packages/b"),
        makeEdge("packages/b", "packages/c"),
      ],
      nodes: ["apps/a", "packages/b", "packages/c"],
      orphans: [],
    };
    const components = [
      makeComponent("apps/a", "app"),
      makeComponent("packages/b", "package"),
      makeComponent("packages/c", "package"),
    ];
    const { radiusMap } = computeBlastRadius(graph, components);

    // C is depended on by B (directly) and A (transitively)
    const cRadius = radiusMap.get("packages/c");
    expect(cRadius).toBeDefined();
    expect(cRadius!.directDependents).toBe(1);
    expect(cRadius!.transitiveDependents).toBe(2);
    expect(cRadius!.score).toBe(100); // 2 out of 2 other components

    // B is depended on by A only
    const bRadius = radiusMap.get("packages/b");
    expect(bRadius).toBeDefined();
    expect(bRadius!.directDependents).toBe(1);
    expect(bRadius!.transitiveDependents).toBe(1);
    expect(bRadius!.score).toBe(50); // 1 out of 2

    // A has no dependents
    const aRadius = radiusMap.get("apps/a");
    expect(aRadius).toBeDefined();
    expect(aRadius!.directDependents).toBe(0);
    expect(aRadius!.transitiveDependents).toBe(0);
    expect(aRadius!.score).toBe(0);
  });

  it("returns top 10 high impact components", () => {
    const edges = [];
    const nodes = [];
    const components: Component[] = [];

    // Create a hub: 15 components all depend on packages/core
    for (let i = 0; i < 15; i++) {
      const name = `packages/pkg-${i}`;
      nodes.push(name);
      components.push(makeComponent(name, "package"));
      edges.push(makeEdge(name, "packages/core"));
    }
    nodes.push("packages/core");
    components.push(makeComponent("packages/core", "package"));

    const graph: CrossPackageDependencyGraph = {
      edges,
      nodes,
      orphans: [],
    };

    const { highImpact } = computeBlastRadius(graph, components);
    // Only packages/core has dependents (all 15 depend on it)
    expect(highImpact.length).toBeGreaterThanOrEqual(1);
    expect(highImpact[0]!.path).toBe("packages/core");
    expect(highImpact[0]!.transitiveDependents).toBe(15);
  });
});
