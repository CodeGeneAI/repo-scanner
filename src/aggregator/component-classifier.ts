import type { ComponentKind } from "../types";

interface ClassifyInput {
  readonly path: string;
  readonly kind?: string;
  readonly name?: string;
}

const VALID_KINDS: readonly ComponentKind[] = [
  "app",
  "service",
  "package",
  "library",
  "infra",
  "script",
];

const PATH_RULES: readonly [RegExp, ComponentKind][] = [
  [/^(?:apps|app)(?:\/|$)/, "app"],
  [/^(?:services|service)(?:\/|$)/, "service"],
  [/^(?:packages|libs|pkg)(?:\/|$)/, "package"],
  [/^(?:infra|terraform|deploy|pulumi|cdk)(?:\/|$)/, "infra"],
  [/^(?:scripts|tools|tooling)(?:\/|$)/, "script"],
  [/^(?:e2e|test|tests|__tests__)(?:\/|$)/, "script"],
];

/**
 * Classify a component hint into a ComponentKind. Returns undefined when no
 * rule matches; the aggregator should skip components that cannot be classified.
 */
export const classifyComponent = (
  input: ClassifyInput,
): ComponentKind | undefined => {
  // Explicit kind from detector hint
  if (input.kind) {
    if (VALID_KINDS.includes(input.kind as ComponentKind))
      return input.kind as ComponentKind;
  }

  // Path-based rules
  for (const [re, kind] of PATH_RULES) {
    if (re.test(input.path)) return kind;
  }

  // Name heuristics
  const name = input.name?.toLowerCase() ?? "";
  if (
    name.includes("server") ||
    name.includes("api") ||
    name.includes("gateway")
  )
    return "service";
  if (
    name.includes("web") ||
    name.includes("frontend") ||
    name.includes("dashboard")
  )
    return "app";

  return undefined;
};
