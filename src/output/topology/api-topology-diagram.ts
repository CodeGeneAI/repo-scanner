import type { RepoScanResult } from "../../types";
import { escapeLabel, renderSubgraph, stripScope, toNodeId } from "./sanitize";
import type { DiagramOutput } from "./types";

export const generateApiTopologyDiagram = (
  result: RepoScanResult,
): DiagramOutput | null => {
  const components = result.architecture.components;

  // Only include apps and services with API surfaces
  const VISIBLE_KINDS = new Set(["app", "service"]);
  const apiComponents = components.filter(
    (c) =>
      VISIBLE_KINDS.has(c.kind) &&
      c.metadata?.apiSurface &&
      c.metadata.apiSurface.protocols.length > 0 &&
      c.metadata.apiSurface.endpointCount > 0,
  );

  if (apiComponents.length === 0) return null;

  const lines: string[] = ["flowchart LR"];
  const seen = new Set<string>();

  // Collect all protocols
  const protocols = new Set<string>();
  for (const comp of apiComponents) {
    for (const proto of comp.metadata!.apiSurface!.protocols) {
      protocols.add(proto);
    }
  }

  // Create protocol nodes
  const protocolIds = new Map<string, string>();
  renderSubgraph(lines, "Protocols", (subLines) => {
    for (const proto of protocols) {
      const id = toNodeId(`proto_${proto}`, seen);
      protocolIds.set(proto, id);
      subLines.push(`    ${id}{{${escapeLabel(proto)}}}`);
    }
  });

  // Create component nodes
  const compIds = new Map<string, string>();
  renderSubgraph(lines, "Services", (subLines) => {
    for (const comp of apiComponents) {
      const id = toNodeId(comp.path || comp.name, seen);
      compIds.set(comp.path || comp.name, id);
      subLines.push(`    ${id}[${escapeLabel(stripScope(comp.name))}]`);
    }
  });

  // Edges: component → protocol with endpoint count
  lines.push("");
  for (const comp of apiComponents) {
    const compId = compIds.get(comp.path || comp.name)!;
    const surface = comp.metadata!.apiSurface!;
    const countPerProtocol =
      surface.protocols.length > 1
        ? Math.round(surface.endpointCount / surface.protocols.length)
        : surface.endpointCount;

    for (const proto of surface.protocols) {
      const protoId = protocolIds.get(proto)!;
      const count =
        surface.protocols.length === 1
          ? surface.endpointCount
          : countPerProtocol;
      lines.push(`  ${compId} -->|${count} endpoints| ${protoId}`);
    }
  }

  // Styling
  lines.push("");
  lines.push("  classDef proto fill:#8b5cf6,stroke:#7c3aed,color:#fff");
  lines.push("  classDef svc fill:#10b981,stroke:#059669,color:#fff");

  const protoIdList = [...protocolIds.values()];
  const svcIdList = [...compIds.values()];

  if (protoIdList.length > 0) {
    lines.push(`  class ${protoIdList.join(",")} proto`);
  }
  if (svcIdList.length > 0) {
    lines.push(`  class ${svcIdList.join(",")} svc`);
  }

  return {
    kind: "api-topology",
    title: "API Topology",
    mermaid: lines.join("\n"),
  };
};
