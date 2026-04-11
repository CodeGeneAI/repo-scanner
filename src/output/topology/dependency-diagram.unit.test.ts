import { describe, expect, it } from "bun:test";
import type { RepoScanResult } from "../../types";
import { generateDependencyDiagram } from "./dependency-diagram";

const makeResult = (
  overrides: Partial<RepoScanResult["architecture"]> = {},
): RepoScanResult =>
  ({
    architecture: {
      monorepo: true,
      components: [],
      ...overrides,
    },
    inventory: {},
    buildAndTest: {},
    signals: {},
    scanPath: "/tmp/test",
    timestamp: new Date().toISOString(),
    durationMs: 0,
  }) as unknown as RepoScanResult;

describe("generateDependencyDiagram", () => {
  it("returns null when no crossPackageDeps exist", () => {
    const result = makeResult({});
    expect(generateDependencyDiagram(result)).toBeNull();
  });

  it("returns null when crossPackageDeps has no edges", () => {
    const result = makeResult({
      crossPackageDeps: { nodes: ["a"], edges: [], orphans: [] },
    });
    expect(generateDependencyDiagram(result)).toBeNull();
  });

  it("produces flowchart LR header", () => {
    const result = makeResult({
      crossPackageDeps: {
        nodes: ["a", "b"],
        edges: [
          {
            from: "a",
            to: "b",
            fromName: "a",
            toName: "b",
            ecosystem: "npm",
            isDev: false,
          },
        ],
        orphans: [],
      },
    });
    const diagram = generateDependencyDiagram(result)!;
    expect(diagram).not.toBeNull();
    expect(diagram.kind).toBe("dependency");
    expect(diagram.mermaid).toMatch(/^flowchart LR/);
  });

  it("renders all nodes and edges", () => {
    const result = makeResult({
      crossPackageDeps: {
        nodes: ["pkgA", "pkgB", "pkgC"],
        edges: [
          {
            from: "pkgA",
            to: "pkgB",
            fromName: "pkgA",
            toName: "pkgB",
            ecosystem: "npm",
            isDev: false,
          },
          {
            from: "pkgB",
            to: "pkgC",
            fromName: "pkgB",
            toName: "pkgC",
            ecosystem: "npm",
            isDev: false,
          },
        ],
        orphans: [],
      },
    });
    const diagram = generateDependencyDiagram(result)!;
    expect(diagram.mermaid).toContain("pkgA");
    expect(diagram.mermaid).toContain("pkgB");
    expect(diagram.mermaid).toContain("pkgC");
    expect(diagram.mermaid).toContain("-->");
  });

  it("highlights circular dependencies with thick styling", () => {
    const result = makeResult({
      crossPackageDeps: {
        nodes: ["a", "b"],
        edges: [
          {
            from: "a",
            to: "b",
            fromName: "a",
            toName: "b",
            ecosystem: "npm",
            isDev: false,
          },
          {
            from: "b",
            to: "a",
            fromName: "b",
            toName: "a",
            ecosystem: "npm",
            isDev: false,
          },
        ],
        orphans: [],
      },
      circularDeps: [["a", "b", "a"]],
    });
    const diagram = generateDependencyDiagram(result)!;
    // Circular edges should use thick arrows
    expect(diagram.mermaid).toContain("==>");
  });

  it("annotates layer violations on edges", () => {
    const result = makeResult({
      crossPackageDeps: {
        nodes: ["pkg", "app"],
        edges: [
          {
            from: "pkg",
            to: "app",
            fromName: "pkg",
            toName: "app",
            ecosystem: "npm",
            isDev: false,
          },
        ],
        orphans: [],
      },
      layerViolations: [
        {
          from: "pkg",
          to: "app",
          fromKind: "package",
          toKind: "app",
          reason: "package depends on app",
        },
      ],
    });
    const diagram = generateDependencyDiagram(result)!;
    expect(diagram.mermaid).toContain("violation");
  });

  it("shows orphans in a separate subgraph", () => {
    const result = makeResult({
      crossPackageDeps: {
        nodes: ["a", "b", "orphan1"],
        edges: [
          {
            from: "a",
            to: "b",
            fromName: "a",
            toName: "b",
            ecosystem: "npm",
            isDev: false,
          },
        ],
        orphans: ["orphan1"],
      },
    });
    const diagram = generateDependencyDiagram(result)!;
    expect(diagram.mermaid).toContain("Orphans");
    expect(diagram.mermaid).toContain("orphan1");
  });

  it("shows ecosystem on edge labels", () => {
    const result = makeResult({
      crossPackageDeps: {
        nodes: ["a", "b"],
        edges: [
          {
            from: "a",
            to: "b",
            fromName: "a",
            toName: "b",
            ecosystem: "pypi",
            isDev: false,
          },
        ],
        orphans: [],
      },
    });
    const diagram = generateDependencyDiagram(result)!;
    expect(diagram.mermaid).toContain("pypi");
  });
});
