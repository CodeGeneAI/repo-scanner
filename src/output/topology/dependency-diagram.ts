import type { RepoScanResult } from "../../types";
import { collapseEdges } from "./collapsing";
import {
  escapeLabel,
  extractShortLabel,
  renderSubgraph,
  stripScope,
  toNodeId,
} from "./sanitize";
import type { DiagramOutput } from "./types";

/**
 * Build a lookup set of edges involved in circular dependencies.
 * Key format: "from->to"
 */
const buildCircularEdgeSet = (
  circularDeps: RepoScanResult["architecture"]["circularDeps"],
): Set<string> => {
  const set = new Set<string>();
  if (!circularDeps) return set;

  for (const cycle of circularDeps) {
    for (let i = 0; i < cycle.length - 1; i++) {
      set.add(`${cycle[i]}->${cycle[i + 1]}`);
    }
  }
  return set;
};

/**
 * Build a lookup set of edges involved in layer violations.
 * Key format: "from->to"
 */
const buildViolationEdgeSet = (
  layerViolations: RepoScanResult["architecture"]["layerViolations"],
): Set<string> => {
  const set = new Set<string>();
  if (!layerViolations) return set;

  for (const v of layerViolations) {
    set.add(`${v.from}->${v.to}`);
  }
  return set;
};

export const generateDependencyDiagram = (
  result: RepoScanResult,
): DiagramOutput | null => {
  const deps = result.architecture.crossPackageDeps;
  if (!deps || deps.edges.length === 0) return null;

  // Apply edge collapsing for large repos
  const { edges: visibleEdges } = collapseEdges(deps.edges);

  const lines: string[] = ["flowchart LR"];
  const seen = new Set<string>();

  // Build path → component name lookup
  const pathToName = new Map<string, string>();
  for (const comp of result.architecture.components) {
    pathToName.set(comp.path, comp.name);
  }

  // Map path → node ID
  const pathToId = new Map<string, string>();
  for (const node of deps.nodes) {
    const id = toNodeId(node, seen);
    pathToId.set(node, id);
  }

  // Render node declarations
  lines.push("");
  for (const node of deps.nodes) {
    const id = pathToId.get(node)!;
    const compName = pathToName.get(node);
    const label = compName ? stripScope(compName) : extractShortLabel(node);
    lines.push(`  ${id}[${escapeLabel(label)}]`);
  }

  // Build edge lookup sets
  const circularEdges = buildCircularEdgeSet(result.architecture.circularDeps);
  const violationEdges = buildViolationEdgeSet(
    result.architecture.layerViolations,
  );

  // Render edges
  const circularNodeIds = new Set<string>();
  lines.push("");
  for (const edge of visibleEdges) {
    const fromId = pathToId.get(edge.from) ?? toNodeId(edge.from, seen);
    const toId = pathToId.get(edge.to) ?? toNodeId(edge.to, seen);
    const edgeKey = `${edge.from}->${edge.to}`;

    const isCircular = circularEdges.has(edgeKey);
    const isViolation = violationEdges.has(edgeKey);

    let label = edge.ecosystem;
    if (isViolation) {
      label += " violation";
    }

    if (isCircular) {
      circularNodeIds.add(fromId);
      circularNodeIds.add(toId);
      lines.push(`  ${fromId} ==>|${label}| ${toId}`);
    } else if (edge.isDev) {
      lines.push(`  ${fromId} -.->|${label}| ${toId}`);
    } else {
      lines.push(`  ${fromId} -->|${label}| ${toId}`);
    }
  }

  // Render orphans
  if (deps.orphans.length > 0) {
    renderSubgraph(lines, "Orphans", (subLines) => {
      for (const orphan of deps.orphans) {
        const id = pathToId.get(orphan) ?? toNodeId(orphan, seen);
        const compName = pathToName.get(orphan);
        const label = compName
          ? stripScope(compName)
          : extractShortLabel(orphan);
        subLines.push(`    ${id}[${escapeLabel(label)}]`);
      }
    });
  }

  // Style nodes involved in circular dependencies
  if (circularNodeIds.size > 0) {
    lines.push("");
    lines.push("  classDef circular fill:#fee,stroke:#f00,stroke-width:2px");
    lines.push(`  class ${[...circularNodeIds].join(",")} circular`);
  }

  return {
    kind: "dependency",
    title: "Dependency Graph",
    mermaid: lines.join("\n"),
  };
};
