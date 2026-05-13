export const DETECTOR_CATALOG = [
  { id: "build", description: "Build systems and commands" },
  { id: "build-commands", description: "Build command extraction" },
  { id: "ci", description: "CI provider and workflow detection" },
  { id: "codebase-size", description: "Total file and LOC summary" },
  { id: "code-quality", description: "Quality gate and scanner detection" },
  { id: "complexity-hotspots", description: "Complexity hotspot detection" },
  {
    id: "containerization",
    description: "Docker and container tooling detection",
  },
  { id: "datastore", description: "Datastore and cache detection" },
  { id: "dependency-manager", description: "Dependency manager detection" },
  { id: "deployment-platform", description: "Deployment platform detection" },
  {
    id: "external-services",
    description: "External service integration detection",
  },
  { id: "framework", description: "Framework and library detection" },
  { id: "iac", description: "Infrastructure-as-code detection" },
  { id: "language", description: "Language and LOC detection" },
  { id: "language-stats", description: "Language percentage and LOC stats" },
  { id: "large-file", description: "Large source file detection" },
  { id: "lint-commands", description: "Lint command extraction" },
  { id: "linting", description: "Linter and formatter detection" },
  { id: "monorepo", description: "Monorepo structure and components" },
  { id: "repo-tools", description: "Repository tooling and config detection" },
  { id: "runtime", description: "Runtime version detection" },
  { id: "test-commands", description: "Test command extraction" },
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
    "language-stats",
    "codebase-size",
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
  "@quality": ["code-quality", "complexity-hotspots", "large-file", "todo"],
  "@architecture": ["monorepo", "external-services"],
} as const satisfies Record<string, readonly DetectorId[]>;

export type DetectorPreset = keyof typeof DETECTOR_PRESETS;
