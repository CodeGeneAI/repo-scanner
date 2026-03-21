import type { RepoScanResult } from "../../types";
import { escapeLabel, renderSubgraph, stripScope, toNodeId } from "./sanitize";
import type { DiagramOutput } from "./types";

export const generateDataflowDiagram = (
  result: RepoScanResult,
): DiagramOutput | null => {
  // Only include apps and services (not packages, scripts, e2e, test-utils)
  const VISIBLE_KINDS = new Set(["app", "service"]);
  const components = result.architecture.components.filter((c) =>
    VISIBLE_KINDS.has(c.kind),
  );

  // Check if any component has datastores or external services
  const hasDataflow = components.some(
    (c) =>
      (c.metadata?.datastores && c.metadata.datastores.length > 0) ||
      (c.metadata?.externalServices && c.metadata.externalServices.length > 0),
  );

  if (!hasDataflow) return null;

  const lines: string[] = ["flowchart LR"];
  const seen = new Set<string>();

  // Track deduplicated datastores and external services
  const datastoreIds = new Map<string, string>(); // name → nodeId
  const serviceIds = new Map<string, string>(); // name → nodeId
  const componentIds = new Map<string, string>(); // path → nodeId

  // Collect edges
  const edges: { from: string; to: string }[] = [];

  // First pass: collect all unique datastores, services, and component nodes
  for (const comp of components) {
    const meta = comp.metadata;
    if (!meta) continue;

    const hasDs = meta.datastores && meta.datastores.length > 0;
    const hasSvc = meta.externalServices && meta.externalServices.length > 0;
    if (!hasDs && !hasSvc) continue;

    // Register component node
    if (!componentIds.has(comp.path)) {
      const id = toNodeId(comp.path || comp.name, seen);
      componentIds.set(comp.path, id);
    }
    const compId = componentIds.get(comp.path)!;

    // Register datastores
    if (meta.datastores) {
      for (const ds of meta.datastores) {
        if (!datastoreIds.has(ds)) {
          const id = toNodeId(`ds_${ds}`, seen);
          datastoreIds.set(ds, id);
        }
        edges.push({ from: compId, to: datastoreIds.get(ds)! });
      }
    }

    // Register external services
    if (meta.externalServices) {
      for (const svc of meta.externalServices) {
        if (!serviceIds.has(svc.name)) {
          const id = toNodeId(`svc_${svc.name}`, seen);
          serviceIds.set(svc.name, id);
        }
        edges.push({ from: compId, to: serviceIds.get(svc.name)! });
      }
    }
  }

  // Render component nodes
  renderSubgraph(lines, "Components", (subLines) => {
    for (const [path, id] of componentIds) {
      const comp = components.find((c) => c.path === path);
      const label = comp
        ? stripScope(comp.name)
        : (path.split("/").pop() ?? path);
      subLines.push(`    ${id}[${escapeLabel(label)}]`);
    }
  });

  // Render datastore nodes
  if (datastoreIds.size > 0) {
    renderSubgraph(lines, "Datastores", (subLines) => {
      for (const [name, id] of datastoreIds) {
        subLines.push(`    ${id}[(${escapeLabel(name)})]`);
      }
    });
  }

  // Render external service nodes
  if (serviceIds.size > 0) {
    renderSubgraph(lines, "External Services", (subLines) => {
      for (const [name, id] of serviceIds) {
        subLines.push(`    ${id}(((${escapeLabel(name)})))`);
      }
    });
  }

  // Render edges
  lines.push("");
  for (const edge of edges) {
    lines.push(`  ${edge.from} --> ${edge.to}`);
  }

  return {
    kind: "dataflow",
    title: "Data Flow",
    mermaid: lines.join("\n"),
  };
};
