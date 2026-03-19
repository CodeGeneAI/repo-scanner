import type { CallGraph } from "../types";

const buildAdjacency = (
  graph: CallGraph,
): {
  readonly outgoing: Map<string, Set<string>>;
  readonly incoming: Map<string, Set<string>>;
} => {
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    const out = outgoing.get(edge.callerId) ?? new Set<string>();
    out.add(edge.calleeId);
    outgoing.set(edge.callerId, out);

    const inc = incoming.get(edge.calleeId) ?? new Set<string>();
    inc.add(edge.callerId);
    incoming.set(edge.calleeId, inc);
  }

  return { outgoing, incoming };
};

const resolveNodeId = (
  graph: CallGraph,
  name: string,
  file?: string,
): string | undefined => {
  const candidates = graph.nodes.filter(
    (node) => node.name === name && (!file || node.file === file),
  );
  return candidates[0]?.id;
};

const collectReachable = (
  startNodeId: string,
  adjacency: Map<string, Set<string>>,
): string[] => {
  const visited = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const neighbors = adjacency.get(current);
    if (!neighbors) continue;

    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  return [...visited];
};

export const getCalleesOf = (
  graph: CallGraph,
  functionName: string,
  file?: string,
): string[] => {
  const startNodeId = resolveNodeId(graph, functionName, file);
  if (!startNodeId) return [];
  const { outgoing } = buildAdjacency(graph);
  return collectReachable(startNodeId, outgoing);
};

export const getCallersOf = (
  graph: CallGraph,
  functionName: string,
  file?: string,
): string[] => {
  const startNodeId = resolveNodeId(graph, functionName, file);
  if (!startNodeId) return [];
  const { incoming } = buildAdjacency(graph);
  return collectReachable(startNodeId, incoming);
};

export const getCallChain = (
  graph: CallGraph,
  from: { name: string; file?: string },
  to: { name: string; file?: string },
): string[] => {
  const fromNodeId = resolveNodeId(graph, from.name, from.file);
  const toNodeId = resolveNodeId(graph, to.name, to.file);
  if (!fromNodeId || !toNodeId) return [];

  if (fromNodeId === toNodeId) return [fromNodeId];

  const { outgoing } = buildAdjacency(graph);
  const queue: string[] = [fromNodeId];
  const visited = new Set<string>([fromNodeId]);
  const parent = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const neighbors = outgoing.get(current);
    if (!neighbors) continue;

    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      if (next === toNodeId) {
        const chain: string[] = [toNodeId];
        let cursor: string | undefined = toNodeId;
        while (cursor && cursor !== fromNodeId) {
          cursor = parent.get(cursor);
          if (cursor) chain.push(cursor);
        }
        return chain.reverse();
      }
      queue.push(next);
    }
  }

  return [];
};
