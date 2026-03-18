import type {
  Component,
  ComponentKind,
  PackageDependencyEdge,
} from "../../types";

export const COLLAPSE_LIBS_THRESHOLD = 30;
export const COLLAPSE_ALL_THRESHOLD = 80;
export const DEV_EDGE_HIDE_THRESHOLD = 100;

const ALWAYS_INDIVIDUAL_KINDS: ReadonlySet<ComponentKind> = new Set([
  "app",
  "service",
]);

export interface CollapsedComponentResult {
  readonly components: readonly Component[];
  readonly collapsed: boolean;
  /** Maps original component paths to their aggregate's path (only for collapsed components). */
  readonly pathRemapping: ReadonlyMap<string, string>;
}

interface CollapsedEdgeResult {
  readonly edges: readonly PackageDependencyEdge[];
  readonly collapsed: boolean;
}

/**
 * Create an aggregate component that represents a group of collapsed components.
 */
const pluralKind = (kind: ComponentKind): string =>
  kind === "library" ? "libraries" : `${kind}s`;

const makeAggregate = (
  kind: ComponentKind,
  components: readonly Component[],
): Component => ({
  name: `${pluralKind(kind)} (${components.length})`,
  path: `__aggregate__/${pluralKind(kind)}`,
  kind,
  description: `${components.length} ${kind} components`,
  confidence: 1,
  evidence: [],
});

/**
 * Collapse components for readability in large repos.
 *
 * - <= 30 components: no collapsing
 * - 31-80: collapse library kind into aggregate nodes
 * - 81+: collapse both package and library kinds into aggregates;
 *         only apps and services shown individually
 */
export const collapseComponents = (
  components: readonly Component[],
): CollapsedComponentResult => {
  if (components.length <= COLLAPSE_LIBS_THRESHOLD) {
    return { components, collapsed: false, pathRemapping: new Map() };
  }

  const kindsToCollapse: Set<ComponentKind> =
    components.length > COLLAPSE_ALL_THRESHOLD
      ? new Set(["library", "package", "infra", "script", "unknown"])
      : new Set(["library"]);

  const individual: Component[] = [];
  const collapsedByKind = new Map<ComponentKind, Component[]>();

  for (const comp of components) {
    if (
      ALWAYS_INDIVIDUAL_KINDS.has(comp.kind) ||
      !kindsToCollapse.has(comp.kind)
    ) {
      individual.push(comp);
    } else {
      const group = collapsedByKind.get(comp.kind) ?? [];
      group.push(comp);
      collapsedByKind.set(comp.kind, group);
    }
  }

  // Create aggregate nodes and build path remapping
  const aggregates: Component[] = [];
  const pathRemapping = new Map<string, string>();
  for (const [kind, group] of collapsedByKind) {
    if (group.length > 0) {
      const aggregate = makeAggregate(kind, group);
      aggregates.push(aggregate);
      for (const comp of group) {
        pathRemapping.set(comp.path, aggregate.path);
      }
    }
  }

  return {
    components: [...individual, ...aggregates],
    collapsed: true,
    pathRemapping,
  };
};

/**
 * Collapse edges for readability.
 *
 * - <= 100 edges: show all
 * - 101+: hide dev-dependency edges
 */
export const collapseEdges = (
  edges: readonly PackageDependencyEdge[],
): CollapsedEdgeResult => {
  if (edges.length <= DEV_EDGE_HIDE_THRESHOLD) {
    return { edges: [...edges], collapsed: false };
  }

  const filtered = edges.filter((e) => !e.isDev);
  return { edges: filtered, collapsed: true };
};
