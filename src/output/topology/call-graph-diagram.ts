import type { RepoScanResult } from "../../types";
import { escapeLabel, toNodeId } from "./sanitize";
import type { DiagramOutput } from "./types";

export const generateCallGraphDiagram = (
  result: RepoScanResult,
): DiagramOutput | null => {
  const callGraph = result.inventory.callGraph;
  if (!callGraph || callGraph.nodes.length === 0) return null;

  const lines: string[] = ["flowchart LR"];
  const seen = new Set<string>();

  for (const node of callGraph.nodes) {
    const nodeId = toNodeId(`fn-${node.id}`, seen);
    const label = escapeLabel(`${node.name}\\n${node.file}:${node.line}`);
    lines.push(`  ${nodeId}[${label}]`);
  }

  for (const edge of callGraph.edges) {
    const callerId = toNodeId(`fn-${edge.callerId}`);
    const calleeId = toNodeId(`fn-${edge.calleeId}`);
    lines.push(`  ${callerId} --> ${calleeId}`);
  }

  return {
    kind: "call-graph",
    title: "Call Graph",
    mermaid: lines.join("\n"),
  };
};
