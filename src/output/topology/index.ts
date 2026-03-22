import type { RepoScanResult } from "../../types";
import { generateApiTopologyDiagram } from "./api-topology-diagram";
import { generateArchitectureDiagram } from "./architecture-diagram";
import { generateCallGraphDiagram } from "./call-graph-diagram";
import { generateDataflowDiagram } from "./dataflow-diagram";
import { generateDependencyDiagram } from "./dependency-diagram";
import { generateErdDiagram } from "./erd-diagram";
import {
  ALL_DIAGRAM_KINDS,
  type DiagramKind,
  type DiagramOutput,
  type TopologyResult,
} from "./types";

type DiagramGenerator = (
  result: RepoScanResult,
) => DiagramOutput | DiagramOutput[] | null;

const GENERATORS: Record<DiagramKind, DiagramGenerator> = {
  architecture: generateArchitectureDiagram,
  dependency: generateDependencyDiagram,
  dataflow: generateDataflowDiagram,
  "api-topology": generateApiTopologyDiagram,
  erd: generateErdDiagram,
  "call-graph": generateCallGraphDiagram,
};

/**
 * Generate topology diagrams from a RepoScanResult.
 *
 * By default generates all applicable diagram types. Pass `kinds` to filter
 * to specific diagram types. Generators that find no relevant data return null
 * and are excluded from the result.
 */
export const generateTopology = (
  result: RepoScanResult,
  kinds?: readonly DiagramKind[],
): TopologyResult => {
  const requested = kinds ?? ALL_DIAGRAM_KINDS;
  const diagrams: DiagramOutput[] = [];

  for (const kind of requested) {
    const generator = GENERATORS[kind];
    if (!generator) continue;
    const output = generator(result);
    if (output) {
      if (Array.isArray(output)) {
        diagrams.push(...output);
      } else {
        diagrams.push(output);
      }
    }
  }

  return { diagrams };
};

export type { DiagramKind, DiagramOutput, TopologyResult } from "./types";
export { ALL_DIAGRAM_KINDS } from "./types";
