export const DETECTOR_CATALOG = [
  { id: "api-surface", description: "API endpoint and protocol detection" },
  { id: "build", description: "Build systems and commands" },
  { id: "call-graph", description: "Static call graph extraction" },
  { id: "ci", description: "CI provider and workflow detection" },
  { id: "code-duplication", description: "Token-level duplication analysis" },
  { id: "code-quality", description: "Quality gate and scanner detection" },
  { id: "complexity-hotspots", description: "Complexity hotspot detection" },
  {
    id: "containerization",
    description: "Docker and container tooling detection",
  },
  { id: "cross-package-deps", description: "Cross-package dependency graph" },
  { id: "datastore", description: "Datastore and cache detection" },
  { id: "db-schema", description: "Database schema extraction" },
  { id: "dead-export", description: "Potentially unused export detection" },
  { id: "dependency-manager", description: "Dependency manager detection" },
  { id: "deployment-platform", description: "Deployment platform detection" },
  { id: "env", description: "Environment variable usage and inference" },
  {
    id: "external-services",
    description: "External service integration detection",
  },
  { id: "framework", description: "Framework and library detection" },
  { id: "iac", description: "Infrastructure-as-code detection" },
  { id: "language", description: "Language and LOC detection" },
  { id: "large-file", description: "Large source file detection" },
  { id: "linting", description: "Linter and formatter detection" },
  { id: "monorepo", description: "Monorepo structure and components" },
  { id: "naming-convention", description: "Naming convention analysis" },
  { id: "repo-tools", description: "Repository tooling and config detection" },
  { id: "runtime", description: "Runtime version detection" },
  { id: "solid-health", description: "SOLID principle analysis" },
  { id: "testing", description: "Test framework detection" },
  { id: "todo", description: "TODO/FIXME annotation detection" },
  { id: "vcs", description: "VCS metadata detection" },
] as const;

export type DetectorCatalogEntry = (typeof DETECTOR_CATALOG)[number];
export type DetectorId = DetectorCatalogEntry["id"];

export const DETECTOR_IDS: readonly DetectorId[] = DETECTOR_CATALOG.map(
  (entry) => entry.id,
);

export const DETECTOR_PRESETS = {
  "@inventory": [
    "language",
    "framework",
    "datastore",
    "dependency-manager",
    "containerization",
    "iac",
    "testing",
    "build",
    "linting",
    "code-quality",
    "deployment-platform",
    "repo-tools",
    "runtime",
  ],
  "@quality": [
    "code-quality",
    "code-duplication",
    "complexity-hotspots",
    "dead-export",
    "large-file",
    "naming-convention",
    "solid-health",
    "todo",
  ],
  "@architecture": [
    "monorepo",
    "cross-package-deps",
    "api-surface",
    "external-services",
    "call-graph",
  ],
} as const satisfies Record<string, readonly DetectorId[]>;

export type DetectorPreset = keyof typeof DETECTOR_PRESETS;
