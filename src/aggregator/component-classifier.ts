import type { ComponentKind } from "../types";

interface ClassifyInput {
  readonly path: string;
  readonly kind?: string;
  readonly name?: string;
}

const PATH_RULES: readonly [RegExp, ComponentKind][] = [
  [/^(?:apps|app)(?:\/|$)/, "app"],
  [/^(?:services|service)(?:\/|$)/, "service"],
  [/^(?:packages|libs|pkg)(?:\/|$)/, "package"],
  [/^(?:infra|terraform|deploy|pulumi|cdk)(?:\/|$)/, "infra"],
  [/^(?:scripts|tools|tooling)(?:\/|$)/, "script"],
  [/^(?:e2e|test|tests|__tests__)(?:\/|$)/, "script"],
];

export const classifyComponent = (input: ClassifyInput): ComponentKind => {
  // Explicit kind from detector hint
  if (input.kind) {
    const valid: ComponentKind[] = [
      "app",
      "service",
      "package",
      "library",
      "infra",
      "script",
    ];
    if (valid.includes(input.kind as ComponentKind))
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

  return "unknown";
};
