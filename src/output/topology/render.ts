import type { TopologyResult } from "./types";

/**
 * Render topology diagrams as a markdown document with fenced mermaid code blocks.
 */
export const renderTopologyMarkdown = (topology: TopologyResult): string => {
  const lines: string[] = ["# Topology", ""];

  for (const diagram of topology.diagrams) {
    lines.push(`## ${diagram.title}`, "");
    lines.push("```mermaid");
    lines.push(diagram.mermaid);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
};

/**
 * Render topology diagrams as raw mermaid syntax, separated by comments.
 */
export const renderTopologyRaw = (topology: TopologyResult): string => {
  if (topology.diagrams.length === 0) return "";

  const lines: string[] = [];

  for (const diagram of topology.diagrams) {
    lines.push(`%% --- ${diagram.title} ---`);
    lines.push(diagram.mermaid);
    lines.push("");
  }

  return lines.join("\n");
};

/**
 * Render topology to a string in the specified format.
 */
export const renderTopologyToString = (
  topology: TopologyResult,
  format: "markdown" | "raw",
): string => {
  if (format === "markdown") {
    return renderTopologyMarkdown(topology);
  }
  return renderTopologyRaw(topology);
};
