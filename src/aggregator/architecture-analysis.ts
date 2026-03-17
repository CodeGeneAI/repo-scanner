import type {
  BlastRadius,
  Component,
  ComponentKind,
  CrossPackageDependencyGraph,
  HighImpactComponent,
  LayerViolation,
} from "../types";

// ─── Layer Ranks ─────────────────────────────────────────────────────

/** Higher rank = lower-level component. Lower-level must NOT depend on higher-level. */
const LAYER_RANK: Record<ComponentKind, number> = {
  app: 0,
  service: 1,
  package: 2,
  library: 2,
  infra: -1, // exempt
  script: -1, // exempt
  unknown: -1, // exempt
};

// ─── Circular Dependency Detection ───────────────────────────────────

/**
 * Detect circular dependencies in the cross-package dependency graph.
 * Returns deduplicated cycles, each represented as an array of component paths.
 */
export const detectCircularDeps = (
  graph: CrossPackageDependencyGraph,
): readonly (readonly string[])[] => {
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = adj.get(edge.from);
    if (list) {
      if (!list.includes(edge.to)) list.push(edge.to);
    } else {
      adj.set(edge.from, [edge.to]);
    }
  }

  const visited = new Set<string>();
  const cycles: string[][] = [];
  const cycleKeys = new Set<string>();

  const dfs = (node: string, stack: string[], onStack: Set<string>): void => {
    visited.add(node);
    onStack.add(node);
    stack.push(node);

    for (const neighbor of adj.get(node) ?? []) {
      if (onStack.has(neighbor)) {
        // Found a cycle — extract from the stack
        const cycleStart = stack.indexOf(neighbor);
        const cycle = stack.slice(cycleStart);

        // Normalize: rotate so lexicographically smallest node is first
        const minIdx = cycle.indexOf(cycle.reduce((a, b) => (a < b ? a : b)));
        const normalized = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
        const key = normalized.join(" → ");

        if (!cycleKeys.has(key)) {
          cycleKeys.add(key);
          cycles.push(normalized);
        }
      } else if (!visited.has(neighbor)) {
        dfs(neighbor, stack, onStack);
      }
    }

    stack.pop();
    onStack.delete(node);
  };

  for (const node of graph.nodes) {
    if (!visited.has(node)) {
      dfs(node, [], new Set());
    }
  }

  return cycles;
};

// ─── Layer Violation Detection ───────────────────────────────────────

/**
 * Detect layer violations where lower-level components depend on higher-level ones.
 * Allowed direction: app → service → package. Violations: package→service, service→app, etc.
 */
export const detectLayerViolations = (
  graph: CrossPackageDependencyGraph,
  components: readonly Component[],
): readonly LayerViolation[] => {
  const kindMap = new Map<string, ComponentKind>();
  for (const comp of components) {
    kindMap.set(comp.path, comp.kind);
  }

  const violations: LayerViolation[] = [];
  const seen = new Set<string>();

  for (const edge of graph.edges) {
    const fromKind = kindMap.get(edge.from) ?? "unknown";
    const toKind = kindMap.get(edge.to) ?? "unknown";
    const fromRank = LAYER_RANK[fromKind];
    const toRank = LAYER_RANK[toKind];

    // Skip exempt components and same-rank deps
    if (fromRank < 0 || toRank < 0 || fromRank <= toRank) continue;

    const key = `${edge.from}→${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);

    violations.push({
      from: edge.from,
      to: edge.to,
      fromKind,
      toKind,
      reason: `${fromKind} should not depend on ${toKind}`,
    });
  }

  return violations;
};

// ─── Blast Radius ────────────────────────────────────────────────────

/**
 * Compute blast radius for all components in the dependency graph.
 * Blast radius measures how many other components would be affected by a change.
 */
export const computeBlastRadius = (
  graph: CrossPackageDependencyGraph,
  components: readonly Component[],
): {
  radiusMap: ReadonlyMap<string, BlastRadius>;
  highImpact: readonly HighImpactComponent[];
} => {
  const totalComponents = components.length;
  if (totalComponents <= 1) {
    return { radiusMap: new Map(), highImpact: [] };
  }

  // Build reverse adjacency list: edge A→B means A depends on B, so B's change affects A
  const reverseAdj = new Map<string, Set<string>>();
  const directCount = new Map<string, number>();

  for (const node of graph.nodes) {
    reverseAdj.set(node, new Set());
    directCount.set(node, 0);
  }

  for (const edge of graph.edges) {
    reverseAdj.get(edge.to)?.add(edge.from);
    directCount.set(edge.to, (directCount.get(edge.to) ?? 0) + 1);
  }

  // Compute transitive dependents via BFS on reverse graph (memoized)
  const transitiveCache = new Map<string, Set<string>>();

  const getTransitiveDependents = (node: string): Set<string> => {
    const cached = transitiveCache.get(node);
    if (cached) return cached;

    const result = new Set<string>();
    const queue = [...(reverseAdj.get(node) ?? [])];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (result.has(current)) continue;
      result.add(current);
      for (const dep of reverseAdj.get(current) ?? []) {
        if (!result.has(dep)) queue.push(dep);
      }
    }

    transitiveCache.set(node, result);
    return result;
  };

  const nameMap = new Map<string, string>();
  for (const comp of components) {
    nameMap.set(comp.path, comp.name);
  }

  const radiusMap = new Map<string, BlastRadius>();
  const impactList: HighImpactComponent[] = [];

  for (const node of graph.nodes) {
    const transitive = getTransitiveDependents(node);
    const direct = directCount.get(node) ?? 0;
    const score = Math.min(
      100,
      Math.round((transitive.size / (totalComponents - 1)) * 100),
    );

    const radius: BlastRadius = {
      directDependents: direct,
      transitiveDependents: transitive.size,
      score,
    };
    radiusMap.set(node, radius);

    if (score > 0) {
      impactList.push({
        name: nameMap.get(node) ?? node,
        path: node,
        score,
        transitiveDependents: transitive.size,
      });
    }
  }

  // Sort by score descending, take top 10
  impactList.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const highImpact = impactList.slice(0, 10);

  return { radiusMap, highImpact };
};
