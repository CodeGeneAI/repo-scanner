export type DiagramKind =
  | "architecture"
  | "dependency"
  | "dataflow"
  | "api-topology";

export const ALL_DIAGRAM_KINDS: readonly DiagramKind[] = [
  "architecture",
  "dependency",
  "dataflow",
  "api-topology",
];

export interface DiagramOutput {
  readonly kind: DiagramKind;
  readonly title: string;
  readonly mermaid: string;
}

export interface TopologyResult {
  readonly diagrams: readonly DiagramOutput[];
}
