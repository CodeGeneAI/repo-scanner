import type { Component, ComponentKind, RepoScanResult } from "../../types";
import { collapseComponents, collapseEdges } from "./collapsing";
import { escapeLabel, stripScope, toNodeId, truncateLabel } from "./sanitize";
import type { DiagramOutput } from "./types";

/** Kinds to include in the architecture diagram (production-relevant). */
const VISIBLE_KINDS = new Set<ComponentKind>(["app", "service"]);

const buildLabel = (component: Component): string => {
  const name = stripScope(component.name);
  const meta = component.metadata;
  if (!meta) return truncateLabel(name, 50);

  const annotations: string[] = [];
  if (meta.ports && meta.ports.length > 0) {
    annotations.push(`:${meta.ports.join(",")}`);
  }
  if (annotations.length > 0) {
    // Truncate name before composing to avoid splitting <br/> mid-token
    return `${truncateLabel(name, 40)}<br/>${annotations.join(" ")}`;
  }
  return truncateLabel(name, 50);
};

const nodeShape = (
  indent: string,
  id: string,
  label: string,
  platform?: string,
): string => {
  const escaped = escapeLabel(label);
  if (platform === "worker") {
    return `${indent}${id}{{${escaped}}}`;
  }
  if (platform === "web") {
    return `${indent}${id}([${escaped}])`;
  }
  return `${indent}${id}[${escaped}]`;
};

/**
 * Determine the effective kind for grouping, considering secondaryKinds.
 * Components with "app" as a secondary kind are promoted to the Apps subgraph.
 */
const effectiveKind = (comp: Component): ComponentKind => {
  if (comp.kind !== "app" && comp.secondaryKinds?.includes("app")) {
    return "app";
  }
  return comp.kind;
};

const isWorker = (comp: Component): boolean =>
  comp.metadata?.platform === "worker";

export const generateArchitectureDiagram = (
  result: RepoScanResult,
): DiagramOutput => {
  const lines: string[] = ["flowchart LR"];
  const seen = new Set<string>();

  // Only include production-relevant component kinds (apps + services)
  const rawComponents = result.architecture.components.filter((c) =>
    VISIBLE_KINDS.has(effectiveKind(c)),
  );

  // Apply collapsing for large repos
  const { components } = collapseComponents(rawComponents);

  // Map component path → node ID for edge lookup
  const pathToId = new Map<string, string>();
  // Map component name → node ID for edge lookup by name
  const nameToId = new Map<string, string>();

  // Separate into apps, API services, and workers
  const apps: Component[] = [];
  const apiServices: Component[] = [];
  const workers: Component[] = [];

  for (const comp of components) {
    const kind = effectiveKind(comp);
    if (kind === "app") {
      apps.push(comp);
    } else if (isWorker(comp)) {
      workers.push(comp);
    } else {
      apiServices.push(comp);
    }
  }

  // Helper to register a component node
  const registerNode = (comp: Component): string => {
    const id = toNodeId(comp.path || comp.name, seen);
    pathToId.set(comp.path, id);
    nameToId.set(comp.name, id);
    return id;
  };

  // Render Apps subgraph
  if (apps.length > 0) {
    lines.push("");
    lines.push("  subgraph Apps");
    for (const comp of apps) {
      const id = registerNode(comp);
      const label = buildLabel(comp);
      lines.push(nodeShape("    ", id, label, comp.metadata?.platform));
    }
    lines.push("  end");
  }

  // Render Services subgraph with nested Workers subgraph
  if (apiServices.length > 0 || workers.length > 0) {
    lines.push("");
    lines.push("  subgraph Services");

    // API services
    for (const comp of apiServices) {
      const id = registerNode(comp);
      const label = buildLabel(comp);
      lines.push(nodeShape("    ", id, label, comp.metadata?.platform));
    }

    // Workers as nested subgraph
    if (workers.length > 0) {
      lines.push("");
      lines.push("    subgraph Workers");
      for (const comp of workers) {
        const id = registerNode(comp);
        const label = buildLabel(comp);
        lines.push(nodeShape("      ", id, label, "worker"));
      }
      lines.push("    end");
    }

    lines.push("  end");
  }

  // Render edges between visible components only
  const deps = result.architecture.crossPackageDeps;
  if (deps) {
    const { edges } = collapseEdges(deps.edges);
    const renderedEdges = new Set<string>();

    lines.push("");
    for (const edge of edges) {
      const fromId = pathToId.get(edge.from) ?? nameToId.get(edge.fromName);
      const toId = pathToId.get(edge.to) ?? nameToId.get(edge.toName);

      // Only render edges where both endpoints are declared visible nodes
      if (!fromId || !toId) continue;
      if (fromId === toId) continue;

      const edgeKey = `${fromId}->${toId}`;
      if (renderedEdges.has(edgeKey)) continue;
      renderedEdges.add(edgeKey);

      if (edge.isDev) {
        lines.push(`  ${fromId} -.-> ${toId}`);
      } else {
        lines.push(`  ${fromId} --> ${toId}`);
      }
    }
  }

  return {
    kind: "architecture",
    title: "Architecture Overview",
    mermaid: lines.join("\n"),
  };
};
