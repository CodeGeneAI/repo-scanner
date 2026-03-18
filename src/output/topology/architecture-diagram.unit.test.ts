import { describe, expect, it } from "vitest";
import type { Component, RepoScanResult } from "../../types";
import { generateArchitectureDiagram } from "./architecture-diagram";

const makeResult = (
  components: Component[],
  crossPackageDeps?: RepoScanResult["architecture"]["crossPackageDeps"],
): RepoScanResult =>
  ({
    architecture: {
      monorepo: components.length > 1,
      components,
      crossPackageDeps,
    },
    inventory: {},
    buildAndTest: {},
    signals: {},
    scanPath: "/tmp/test",
    timestamp: new Date().toISOString(),
    durationMs: 0,
  }) as unknown as RepoScanResult;

const makeComponent = (
  name: string,
  kind: Component["kind"],
  path?: string,
  metadata?: Component["metadata"],
  secondaryKinds?: Component["secondaryKinds"],
): Component => ({
  name,
  path: path ?? `${kind}s/${name}`,
  kind,
  description: `${name} component`,
  confidence: 1,
  evidence: [],
  metadata,
  ...(secondaryKinds ? { secondaryKinds } : {}),
});

describe("generateArchitectureDiagram", () => {
  it("produces valid flowchart LR header", () => {
    const result = makeResult([]);
    const diagram = generateArchitectureDiagram(result)!;
    expect(diagram.kind).toBe("architecture");
    expect(diagram.mermaid).toMatch(/^flowchart LR/);
  });

  it("generates a node for a single app component", () => {
    const result = makeResult([makeComponent("web", "app")]);
    const diagram = generateArchitectureDiagram(result)!;
    expect(diagram.mermaid).toContain("web");
    expect(diagram.mermaid).toContain("Apps");
  });

  it("only shows apps and services (filters out packages, scripts, etc.)", () => {
    const result = makeResult([
      makeComponent("web", "app"),
      makeComponent("api", "service"),
      makeComponent("utils", "package"),
      makeComponent("e2e", "script"),
    ]);
    const diagram = generateArchitectureDiagram(result)!;
    expect(diagram.mermaid).toContain("subgraph Apps");
    expect(diagram.mermaid).toContain("subgraph Services");
    expect(diagram.mermaid).not.toContain("subgraph Packages");
    expect(diagram.mermaid).not.toContain("subgraph Scripts");
  });

  it("separates workers into a nested subgraph inside Services", () => {
    const result = makeResult([
      makeComponent("api", "service", "services/api", { platform: "api" }),
      makeComponent("worker", "service", "services/worker", {
        platform: "worker",
      }),
    ]);
    const diagram = generateArchitectureDiagram(result)!;
    expect(diagram.mermaid).toContain("subgraph Services");
    expect(diagram.mermaid).toContain("subgraph Workers");
    // Worker uses hexagon shape
    expect(diagram.mermaid).toMatch(/\{\{.*worker.*\}\}/);
  });

  it("renders edges between visible components", () => {
    const components = [
      makeComponent("web", "app"),
      makeComponent("api", "service"),
    ];
    const deps = {
      nodes: ["apps/web", "services/api"],
      edges: [
        {
          from: "apps/web",
          to: "services/api",
          fromName: "web",
          toName: "api",
          ecosystem: "npm",
          isDev: false,
        },
      ],
      orphans: [],
    };
    const diagram = generateArchitectureDiagram(makeResult(components, deps))!;
    expect(diagram.mermaid).toContain("-->");
  });

  it("renders dev dependencies as dashed edges", () => {
    const components = [
      makeComponent("web", "app"),
      makeComponent("api", "service"),
    ];
    const deps = {
      nodes: ["apps/web", "services/api"],
      edges: [
        {
          from: "apps/web",
          to: "services/api",
          fromName: "web",
          toName: "api",
          ecosystem: "npm",
          isDev: true,
        },
      ],
      orphans: [],
    };
    const diagram = generateArchitectureDiagram(makeResult(components, deps))!;
    expect(diagram.mermaid).toContain("-.->");
  });

  it("includes port annotations in labels", () => {
    const components = [
      makeComponent("web", "app", "apps/web", {
        platform: "web",
        frameworks: ["React"],
        ports: [3000],
      }),
    ];
    const diagram = generateArchitectureDiagram(makeResult(components))!;
    expect(diagram.mermaid).toContain(":3000");
  });

  it("handles empty components gracefully", () => {
    const result = makeResult([]);
    const diagram = generateArchitectureDiagram(result)!;
    expect(diagram.kind).toBe("architecture");
    expect(diagram.mermaid).toContain("flowchart LR");
    expect(diagram.title).toBeTruthy();
  });

  it("strips scopes from component names in labels", () => {
    const result = makeResult([
      makeComponent("@codegeneai/web", "app", "apps/web"),
      makeComponent("@codegeneai/api", "service", "services/api"),
    ]);
    const diagram = generateArchitectureDiagram(result)!;
    expect(diagram.mermaid).toContain("web");
    expect(diagram.mermaid).toContain("api");
    expect(diagram.mermaid).not.toContain("@codegeneai");
  });

  it("applies classDef styling for apps, services, and workers", () => {
    const result = makeResult([
      makeComponent("web", "app"),
      makeComponent("api", "service"),
      makeComponent("worker", "service", "services/worker", {
        platform: "worker",
      }),
    ]);
    const diagram = generateArchitectureDiagram(result)!;
    expect(diagram.mermaid).toContain("classDef app");
    expect(diagram.mermaid).toContain("classDef svc");
    expect(diagram.mermaid).toContain("classDef worker");
  });

  it("promotes packages with secondary kind 'app' to Apps subgraph", () => {
    const result = makeResult([
      makeComponent("web", "app"),
      makeComponent("ui", "package", "packages/ui", undefined, ["app"]),
    ]);
    const diagram = generateArchitectureDiagram(result)!;
    // ui should appear in the Apps subgraph (promoted from package)
    const appsSection =
      diagram.mermaid.split("subgraph Apps")[1]?.split("end")[0] ?? "";
    expect(appsSection).toContain("ui");
  });
});
