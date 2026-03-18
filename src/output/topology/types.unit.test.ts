import { describe, expect, it } from "vitest";
import type {
  CliOptions,
  DiagramKind,
  DiagramOutput,
  TopologyResult,
} from "../../types";
import { ALL_DIAGRAM_KINDS } from "./types";

describe("topology types", () => {
  it("DiagramKind accepts all four valid values", () => {
    const kinds: DiagramKind[] = [
      "architecture",
      "dependency",
      "dataflow",
      "api-topology",
    ];
    expect(kinds).toHaveLength(4);
  });

  it("ALL_DIAGRAM_KINDS is the single source of truth for valid kinds", () => {
    expect(ALL_DIAGRAM_KINDS).toEqual([
      "architecture",
      "dependency",
      "dataflow",
      "api-topology",
    ]);
  });

  it("DiagramOutput has required fields", () => {
    const output: DiagramOutput = {
      kind: "architecture",
      title: "Architecture Overview",
      mermaid: "flowchart TD\n  A --> B",
    };
    expect(output.kind).toBe("architecture");
    expect(output.title).toBe("Architecture Overview");
    expect(output.mermaid).toContain("flowchart TD");
  });

  it("TopologyResult has a diagrams array", () => {
    const result: TopologyResult = { diagrams: [] };
    expect(result.diagrams).toEqual([]);
  });

  it("TopologyResult can hold multiple diagrams", () => {
    const result: TopologyResult = {
      diagrams: [
        {
          kind: "architecture",
          title: "Architecture",
          mermaid: "flowchart TD",
        },
        { kind: "dependency", title: "Dependencies", mermaid: "flowchart LR" },
      ],
    };
    expect(result.diagrams).toHaveLength(2);
  });

  it("CliOptions includes topology fields", () => {
    const opts = {
      topology: true,
      topologyDiagrams: ["architecture", "dataflow"] as DiagramKind[],
      topologyOutput: "./out.md",
    } satisfies Pick<
      CliOptions,
      "topology" | "topologyDiagrams" | "topologyOutput"
    >;
    expect(opts.topology).toBe(true);
    expect(opts.topologyDiagrams).toEqual(["architecture", "dataflow"]);
    expect(opts.topologyOutput).toBe("./out.md");
  });
});
