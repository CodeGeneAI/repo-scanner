# repo-scanner 1.0.0 Strip-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce repo-scanner to exactly three detectors — `language`, `framework`, `monorepo` — plus their aggregator-driven component classification. Ship as `1.0.0` via release-please.

**Architecture:** Deletion-heavy refactor on branch `strip-down-to-three`. Each task removes a self-contained subsystem (or related cluster), keeps quality gates green, and commits. Per-task commits use `refactor:` or `chore:`; the squash-merge PR title carries `feat!:` so release-please produces the major bump.

**Tech Stack:** Bun 1.3.14, TypeScript (tsgo), Biome 2.4.15, conventional-commits + release-please.

---

## Conventions for every task

- **Pre-flight:** the working tree must be clean for the current branch (`git status --short` empty). If not, stop and report.
- **Quality gate (run after edits, before commit):**
  ```bash
  bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test
  ```
  All four must succeed. If a test for removed code is now failing because the source is gone, **delete the test file in the same commit** — that is the correct fix, not a workaround.
- **Commit format:** `<type>(<scope>): <subject>` where `type` is `refactor` (removing code) or `chore` (config/docs/build). Examples below. Use a HEREDOC body with the standard Co-Authored-By trailer:
  ```bash
  git commit -m "$(cat <<'EOF'
  refactor: <subject>

  <optional body>

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```
- **Do NOT** use `feat!:` on any intermediate commit. The squash-merge of the PR (final task) carries that.
- **Do NOT** add re-export shims for removed types — the spec forbids backwards-compat. Just delete.
- Working directory throughout: `/home/rszemplinski/projects/repo-scanner`.

---

## Task 1: Remove dependency-intelligence subsystem

**Files:**
- Delete: `src/dependency/` (entire directory)
- Modify: `src/scanner.ts` — drop `scanDependencies` orchestration; remove `dependencies` field from result
- Modify: `src/index.ts` — remove `scanDependencies` export and all `Dependency*` type re-exports
- Modify: `src/cli.ts` — remove all `--deps*`, `--ecosystems`, `--no-usage`, `--no-security`, `--no-version-lookup`, `--concurrency`, `--component-grouping`, `--fail-on-vulns*`, `--severity-threshold`, `--fail-on-outdated*`, `--outdated-threshold`, `--fail-on-dead-deps*`, `--include-dev-dead-deps` flags and their help text
- Modify: `src/bin.ts` — drop dependency-related branching
- Modify: `src/types.ts` — remove `DependencyScanConfig`, `ScanRepoOptions.dependencies`, `RepoScanResult.dependencies`, and every dependency-related type definition
- Delete: any `src/**/*.unit.test.ts` whose only purpose was dependency mode (e.g., `bin.deps-and-completion.unit.test.ts`)
- Modify: `src/aggregator/aggregator.ts` — drop dependency aggregation path

- [ ] **Step 1: Verify baseline is green**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`
  Expected: all pass.

- [ ] **Step 2: Delete the dependency subsystem directory**

  Run: `rm -rf src/dependency`

- [ ] **Step 3: Strip dependency-related code from consumers**

  Open each file in the **Files** list above. Remove every reference to `scanDependencies`, `DependencyScanConfig`, `dependencies` option/result fields, and the CLI flags listed. Use `bun run typecheck` to drive what still references the removed symbols — iterate until the typecheck errors are zero.

  In `src/types.ts`, the `ScanRepoOptions` interface goes from `{ detectors?; dependencies?; ... }` to `{ detectors? }` for now (further slimming in Task 10). The `RepoScanResult` retains `dependencies` field for now ONLY if other in-tree code still consumes it; otherwise remove now.

- [ ] **Step 4: Delete now-dead tests**

  Find any test whose subject is `--deps` mode, dependency policy gates, or `scanDependencies` and delete the test file. Typically:
  - `src/bin.deps-and-completion.unit.test.ts` (only the `--deps` parts — if the file is mixed-purpose, surgically remove dep test cases and rename if needed)
  - Any aggregator test asserting on a removed dependency field

- [ ] **Step 5: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`
  Expected: all pass.

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  refactor: remove dependency-intelligence subsystem

  Drops src/dependency/ in its entirety along with the --deps CLI mode,
  scanDependencies export, and all dependency-related types and policy gates.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: Remove code-duplication + dry-check

**Files:**
- Delete: `src/code-duplication/` (entire directory)
- Delete: `src/detectors/code-duplication.ts`
- Delete: `src/output/dry-check.ts`
- Delete: any tests under `src/detectors/code-duplication*.unit.test.ts` or `src/output/dry-check*.unit.test.ts`
- Modify: `src/cli.ts` — remove `--dry-check`, `--min-tokens`, `--min-lines`, `--extensions`, `--min-unique-ratio`, `--max-literal-ratio`, `--no-barrel-filter`, `--fail-on-new-duplication-pct`
- Modify: `src/bin.ts` — drop dry-check routing
- Modify: `src/scanner.ts` — drop duplication invocation path
- Modify: `src/types.ts` — remove `CodeDuplicationResult`, `CodeDuplicationGroup`, `CodeDuplicationInstance`, `CodeDuplicationStats` and any `codeDuplication` field on `RepoScanResult`
- Modify: `src/index.ts` — remove the same code-duplication type re-exports
- Modify: `src/detectors/init.ts` — drop the `import "./code-duplication"` line
- Modify: `src/detectors/catalog.ts` — remove the `code-duplication` entry

- [ ] **Step 1: Delete the directory and detector + test files**

  ```bash
  rm -rf src/code-duplication
  rm -f src/detectors/code-duplication.ts
  rm -f src/output/dry-check.ts
  rm -f src/detectors/code-duplication*.unit.test.ts
  rm -f src/output/dry-check*.unit.test.ts
  ```

- [ ] **Step 2: Strip consumers**

  Edit each file in the Files list. Remove all references to the deleted symbols.

- [ ] **Step 3: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`
  Expected: all pass.

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  refactor: remove code-duplication detector and dry-check output

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Remove diff scanning

**Files:**
- Delete: `src/diff/` (entire directory)
- Delete: any `src/bin.diff*.unit.test.ts`, `src/diff/*.unit.test.ts`
- Modify: `src/cli.ts` — remove `--diff`, `--diff-dry-check`, `--diff-dry-include-tests`, `--diff-env-check`, `--fail-on-new-env-vars`
- Modify: `src/bin.ts` — drop diff branching
- Modify: `src/scanner.ts` — drop diff entry points
- Modify: `src/index.ts` — remove `buildDiffScanResult`, `computeNetNewEnvVars`, `isLikelyTestFile`, `resetDiffConventionOptions`, `setDiffConventionOptions`, `learnComponentConventionBaselinesFromGit`, `getAddedLines`, `DiffScanResult`, `DiffDuplicationResult`
- Modify: `src/types.ts` — remove `DiffScanResult` and `DiffDuplicationResult` type definitions

- [ ] **Step 1: Delete diff/**

  ```bash
  rm -rf src/diff
  rm -f src/bin.diff*.unit.test.ts
  ```

- [ ] **Step 2: Strip consumers**

  Iterate via `bun run typecheck` until zero diff-related symbol errors.

- [ ] **Step 3: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "refactor: remove diff scanning subsystem

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 4: Remove call-graph + topology output

**Files:**
- Delete: `src/call-graph/` (entire directory)
- Delete: `src/output/topology/` (entire directory)
- Delete: `src/detectors/call-graph.ts` and `src/detectors/call-graph.unit.test.ts`
- Delete: `src/bin.topology.unit.test.ts`
- Modify: `src/cli.ts` — remove `--topology`, `--topology-diagrams`, `--topology-output`
- Modify: `src/bin.ts` — drop topology routing
- Modify: `src/scanner.ts` — drop call-graph integration
- Modify: `src/index.ts` — remove `getCallChain`, `getCalleesOf`, `getCallersOf`, `generateTopology`, `CallGraph`, `CallGraphEdge`, `CallGraphNode` exports
- Modify: `src/types.ts` — remove `CallGraph*` types and any callGraph field on the result
- Modify: `src/detectors/init.ts` — drop `import "./call-graph"`
- Modify: `src/detectors/catalog.ts` — remove `call-graph` entry

- [ ] **Step 1: Delete directories and files**

  ```bash
  rm -rf src/call-graph src/output/topology
  rm -f src/detectors/call-graph.ts src/detectors/call-graph.unit.test.ts
  rm -f src/bin.topology.unit.test.ts
  ```

- [ ] **Step 2: Strip consumers**

- [ ] **Step 3: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "refactor: remove call-graph detector and topology output

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 5: Remove perf subsystem

**Files:**
- Delete: `src/perf/` (entire directory)
- Modify: `src/index.ts` — remove `generatePerfDriftReport`, `recordPerfTrend` exports
- Modify: `package.json` — remove the `perf:drift-report` script entry (`bun src/perf/drift-report.ts`)

- [ ] **Step 1: Delete perf/**

  ```bash
  rm -rf src/perf
  ```

- [ ] **Step 2: Strip consumers**

  Edit `src/index.ts` and `package.json`. Confirm no other file imports `src/perf/*`.

- [ ] **Step 3: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "refactor: remove perf drift-report subsystem

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 6: Remove tree-sitter-based detectors (SOLID, naming-convention, dead-export, env, api-surface, db-schema) and the AST subsystem

This is the biggest single deletion. After it, `src/ast/` and all tree-sitter consumers are gone.

**Files:**
- Delete entire directories: `src/ast/`, `src/detectors/api/`, `src/detectors/env/`, `src/detectors/dead-export/`, `src/detectors/naming-convention/`, `src/detectors/db-schema/`
- Delete individual detector files: `src/detectors/solid-health.ts` (+ test)
- Delete tests: `src/detectors/dead-export.unit.test.ts` (orphan test file at top level)
- Modify: `src/detectors/init.ts` — drop imports for each of these detectors
- Modify: `src/detectors/catalog.ts` — remove entries: `api-surface`, `db-schema`, `dead-export`, `env`, `naming-convention`, `solid-health`
- Modify: `src/cli.ts` — remove `--solid`, `--solid-threshold`, `--env-include-tests`
- Modify: `src/types.ts` — remove `ApiEndpoint`, `ApiSurface`, `EnvVarInfo`, `EnvVarUsage`, `EnvValueType`, `DeadExport`, `SolidHealthResult`, and any `inventory.envVars` / `inventory.apiSurface` / `solid` / `deadExports` result fields
- Modify: `src/index.ts` — drop the corresponding type re-exports
- Modify: `src/aggregator/aggregator.ts` — drop any branches that consume these detectors' findings

- [ ] **Step 1: Delete directories and orphan files**

  ```bash
  rm -rf src/ast src/detectors/api src/detectors/env src/detectors/dead-export src/detectors/naming-convention src/detectors/db-schema
  rm -f src/detectors/solid-health.ts src/detectors/solid-health.unit.test.ts
  rm -f src/detectors/dead-export.unit.test.ts
  ```

- [ ] **Step 2: Strip consumers**

  Run `bun run typecheck` repeatedly. For each error, either delete the consuming code (if its purpose was the removed detector) or remove the offending symbol/field. Common consumers:
  - `src/detectors/init.ts` — remove the side-effect imports
  - `src/detectors/catalog.ts` — remove catalog rows
  - `src/cli.ts` — remove flags, help text, `--detectors` validation lists
  - `src/types.ts` — remove type defs
  - `src/index.ts` — remove re-exports
  - `src/aggregator/aggregator.ts` — drop env/api/dead-export/solid aggregation paths
  - `src/output/table.ts` and `src/output/json.ts` — drop rendering of removed fields

- [ ] **Step 3: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  refactor: remove tree-sitter-backed detectors and ast subsystem

  Drops api-surface, env, dead-export, naming-convention, db-schema, and
  solid-health detectors along with the shared src/ast tree-sitter parser
  layer. All --solid* and --env-include-tests CLI flags removed.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 7: Remove cross-package-deps + architecture-analysis + component-enrichment

**Files:**
- Delete: `src/detectors/cross-package-deps.ts` (+ test)
- Delete: `src/aggregator/architecture-analysis.ts` (+ its `.unit.test.ts` if present)
- Delete: `src/aggregator/component-enrichment.ts`
- Modify: `src/detectors/init.ts` — drop `import "./cross-package-deps"`
- Modify: `src/detectors/catalog.ts` — remove `cross-package-deps`, `circular-deps`, `layer-violations`, `high-impact-components`, `components` entries
- Modify: `src/types.ts` — remove `CrossPackageDependencyGraph`, `PackageDependencyEdge`, `ComponentMetadata`, any `crossPackageDeps` field on result, any `metadata` field on `Component`
- Modify: `src/index.ts` — drop those type re-exports
- Modify: `src/aggregator/aggregator.ts` — drop the `detectLayerViolations`, blast-radius, and `enrichComponents` calls (currently around aggregator.ts:344-416)

- [ ] **Step 1: Delete files**

  ```bash
  rm -f src/detectors/cross-package-deps.ts src/detectors/cross-package-deps.unit.test.ts
  rm -f src/aggregator/architecture-analysis.ts src/aggregator/architecture-analysis.unit.test.ts
  rm -f src/aggregator/component-enrichment.ts
  ```

- [ ] **Step 2: Strip consumers**

  Pay particular attention to `src/aggregator/aggregator.ts` — it currently calls `detectLayerViolations` (line ~359) and `enrichComponents` (line ~379). Remove those calls, leaving only the basic component construction from monorepo findings.

- [ ] **Step 3: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "refactor: remove cross-package-deps and architecture analysis

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 8: Remove remaining inventory/quality detectors

**Detectors to remove** (all but `language`, `framework`, `monorepo`):
- `build` (+ test)
- `ci` (+ test)
- `code-quality` (+ test)
- `complexity-hotspots`
- `containerization`
- `datastore` (+ test)
- `dependency-manager` (+ test)
- `deployment-platform` (+ test)
- `external-services` (+ test)
- `iac`
- `large-file` (+ test)
- `linting` (+ test)
- `repo-tools`
- `runtime` (+ test)
- `testing` (+ test)
- `todo` (+ test)
- `vcs` (+ test)

**Files:**
- Delete each `src/detectors/<name>.ts` + matching `.unit.test.ts`
- Modify: `src/detectors/init.ts` — drop their side-effect imports
- Modify: `src/detectors/catalog.ts` — remove their catalog entries (also: `codebase-size`, `language-stats`, `build-commands`, `test-commands`, `lint-commands` virtual entries — none have implementations to remove, just catalog rows)
- Modify: `src/types.ts` — remove `RuntimeInfo`, `LargeFileInfo`, `TodoAnnotation`, and the inventory subfields `containerization`, `testing`, `linting`, `build`, `ci`/`ciSystems`, `datastore`/`datastores`, `iac`, `deploymentPlatforms`, `runtimes`, `repoTools`, `codeQuality`, `externalServices`, `todos`, `largeFiles`, `complexityHotspots`, `vcs`, `dependencyManagers`, and the entire `signals`, `buildAndTest` blocks on `RepoScanResult`
- Modify: `src/index.ts` — drop the corresponding type re-exports
- Modify: `src/aggregator/aggregator.ts` — drop all aggregation paths for removed detectors
- Modify: `src/output/table.ts` and `src/output/json.ts` — drop all rendering of removed inventory categories
- Modify: `src/cli.ts` — drop any flag still tied to a removed detector (should be none left, but verify)

- [ ] **Step 1: Delete detector files**

  ```bash
  rm -f src/detectors/build.ts src/detectors/build.unit.test.ts
  rm -f src/detectors/ci.ts src/detectors/ci.unit.test.ts
  rm -f src/detectors/code-quality.ts src/detectors/code-quality.unit.test.ts
  rm -f src/detectors/complexity-hotspots.ts
  rm -f src/detectors/containerization.ts
  rm -f src/detectors/datastore.ts src/detectors/datastore.unit.test.ts
  rm -f src/detectors/dependency-manager.ts src/detectors/dependency-manager.unit.test.ts
  rm -f src/detectors/deployment-platform.ts src/detectors/deployment-platform.unit.test.ts
  rm -f src/detectors/external-services.ts src/detectors/external-services.unit.test.ts
  rm -f src/detectors/iac.ts
  rm -f src/detectors/large-file.ts src/detectors/large-file.unit.test.ts
  rm -f src/detectors/linting.ts src/detectors/linting.unit.test.ts
  rm -f src/detectors/repo-tools.ts
  rm -f src/detectors/runtime.ts src/detectors/runtime.unit.test.ts
  rm -f src/detectors/testing.ts src/detectors/testing.unit.test.ts
  rm -f src/detectors/todo.ts src/detectors/todo.unit.test.ts
  rm -f src/detectors/vcs.ts src/detectors/vcs.unit.test.ts
  ```

  After this, `src/detectors/` should contain only: `catalog.ts`, `framework.ts` (+ test), `init.ts`, `language.ts` (+ test), `language-extensions.ts`, `monorepo.ts` (+ test), `registry.ts`, `shared.ts`, `types.ts`, `detectors.unit.test.ts`.

- [ ] **Step 2: Slim `src/detectors/init.ts`**

  Replace the file's body to import only the three kept detectors:

  ```ts
  import "./framework";
  import "./language";
  import "./monorepo";
  ```

- [ ] **Step 3: Slim `src/detectors/catalog.ts`**

  Replace `DETECTOR_CATALOG` with exactly three entries (use the existing descriptions). Delete the `DETECTOR_PRESETS` export entirely. The file should look like:

  ```ts
  export const DETECTOR_CATALOG = [
    { id: "framework", description: "Framework and library detection" },
    { id: "language", description: "Language and LOC detection" },
    { id: "monorepo", description: "Monorepo structure and components" },
  ] as const;

  export type DetectorCatalogEntry = (typeof DETECTOR_CATALOG)[number];
  export type DetectorId = DetectorCatalogEntry["id"];

  export const DETECTOR_IDS: readonly DetectorId[] = DETECTOR_CATALOG.map(
    (entry) => entry.id,
  );
  ```

  Remove the `DETECTOR_PRESETS` and `DetectorPreset` exports entirely.

- [ ] **Step 4: Strip consumers**

  Iterate via `bun run typecheck`. Expect breakage in `src/cli.ts` (any remaining preset references), `src/bin.ts` (preset/section profile references), `src/scan-profile.ts` (section profiles, topology mapping — likely many errors; see Task 9), `src/output/table.ts` and `src/output/json.ts` (rendering of removed inventory fields), `src/types.ts` (interface definitions still referencing removed types), `src/aggregator/aggregator.ts` (aggregation of removed detectors).

  Fix each error by deleting the dead code. Do NOT add re-export shims.

- [ ] **Step 5: Update `src/detectors/detectors.unit.test.ts`**

  Update any assertion that expected more than 3 detector IDs. After your edits, the test should assert exactly 3 IDs (`framework`, `language`, `monorepo`) and no presets.

- [ ] **Step 6: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`

- [ ] **Step 7: Commit**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  refactor: reduce detector inventory to language, framework, monorepo

  Removes 17 inventory/quality detectors plus their tests, slims
  DETECTOR_CATALOG to three entries, and drops DETECTOR_PRESETS entirely.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 9: Delete scan-profile.ts and its CLI flag surface

**Files:**
- Delete: `src/scan-profile.ts` and `src/scan-profile.unit.test.ts`
- Modify: `src/bin.ts` — remove the `scan-profile` import and any section-profile rendering branches
- Modify: `src/output/table.ts` — remove `scan-profile` import and any section-profile rendering branches (replace with the default flat rendering)
- Modify: `src/cli.ts` — remove flags `--architecture`, `--inventory`, `--external-services`, `--build-and-test`, `--all-detectors`, `--full-scan`, `--schema`, and remove any preset (`@inventory`, `@quality`, `@architecture`) handling in the `--detectors` parser. After this, `--detectors` accepts only literal IDs from `DETECTOR_IDS`.
- Modify: `src/cli.unit.test.ts` — drop test cases for any flag removed above

- [ ] **Step 1: Delete scan-profile**

  ```bash
  rm -f src/scan-profile.ts src/scan-profile.unit.test.ts
  ```

- [ ] **Step 2: Fix importers**

  Edit `src/bin.ts` and `src/output/table.ts` to drop their `scan-profile` imports. Replace any branching they did on profiles with a single rendering path.

- [ ] **Step 3: Slim CLI flags**

  In `src/cli.ts`:
  - Delete the parser branches for `--architecture`, `--inventory`, `--external-services`, `--build-and-test`, `--all-detectors`, `--full-scan`, `--schema`.
  - In the `--detectors` parser (currently around `cli.ts:560-585`), remove the preset expansion that looked up `DETECTOR_PRESETS[id]`. The parser should now require every comma-separated value to be a member of `VALID_DETECTOR_ID_SET` (the three kept IDs).
  - Update `HELP_TEXT` to reflect the slimmed surface.

- [ ] **Step 4: Update `src/cli.unit.test.ts`**

  Delete cases for any removed flag. Add a case asserting that `--detectors @inventory` is now rejected with an "invalid detector ids" error.

- [ ] **Step 5: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  refactor: delete scan-profile and section-profile CLI flags

  Removes --architecture, --inventory, --external-services, --build-and-test,
  --all-detectors, --full-scan, --schema, and the @<preset> syntax on
  --detectors. --detectors now only accepts literal detector IDs.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 10: Slim `types.ts`, `index.ts`, and verify `RepoScanResult` shape

**Files:**
- Modify: `src/types.ts`
- Modify: `src/index.ts`

After Tasks 1-9 there should be no consumers of removed types left in the codebase, but the type definitions themselves may still be present. This task is the final cleanup.

- [ ] **Step 1: Define the final `RepoScanResult` and `Component` shape**

  In `src/types.ts`, the only types that remain should be:

  ```ts
  export interface RepoScanResult {
    readonly scannedAt: string;
    readonly rootPath: string;
    readonly inventory: Inventory;
    readonly architecture: Architecture;
    readonly languageStats: LanguageStats;
  }

  export interface Inventory {
    readonly languages: readonly string[];
    readonly frameworks: readonly string[];
  }

  export interface Architecture {
    readonly monorepo: boolean;
    readonly components: readonly Component[];
  }

  export interface Component {
    readonly path: string;
    readonly name: string;
    readonly kind: ComponentKind;
    readonly secondaryKinds?: readonly ComponentKind[];
    readonly description?: string;
  }

  export type ComponentKind = "app" | "service" | "package" | "infra" | "script" | "library";

  export interface LanguageStats {
    readonly totalFiles: number;
    readonly totalLines: number;
    readonly perLanguage: ReadonlyArray<{
      readonly language: string;
      readonly files: number;
      readonly lines: number;
      readonly percentage: number;
    }>;
  }

  export interface ScanRepoOptions {
    readonly detectors?: ReadonlyArray<import("./detectors/catalog").DetectorId>;
  }
  ```

  Verify the actual `LanguageStats` shape against `src/detectors/language.ts` and adjust to match. Do **not** invent fields — if `language.ts` produces a richer or simpler structure, the type follows the code.

  Delete every other type definition from `types.ts`.

- [ ] **Step 2: Slim `src/index.ts`**

  Replace its body with exactly:

  ```ts
  export { scanRepo } from "./scanner";
  export type {
    Architecture,
    Component,
    ComponentKind,
    Inventory,
    LanguageStats,
    RepoScanResult,
    ScanRepoOptions,
  } from "./types";
  export type { DetectorId } from "./detectors/catalog";
  ```

  Drop every other export.

- [ ] **Step 3: Update `src/scanner.ts` and aggregator + output to match the new shape**

  Run `bun run typecheck`. Fix any field assignments that no longer match. The result builder should now only produce `inventory`, `architecture`, `languageStats`, `scannedAt`, `rootPath`.

- [ ] **Step 4: Update `src/scanner.unit.test.ts`**

  Any assertion on a removed result field is dropped. The test should at minimum assert that `result.inventory.languages` is an array, `result.architecture.components` is an array, and `result.languageStats` is present.

- [ ] **Step 5: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  refactor: slim RepoScanResult to inventory + architecture + languageStats

  Removes all type definitions and re-exports for fields produced by the
  deleted detectors. Public API surface is now scanRepo + 7 types.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 11: Strip `.scanignore` scoped-rule machinery and slim output

**Files:**
- Modify: `src/utils/` — find the scanignore parser (likely `src/utils/scanignore.ts` or similar; grep to confirm)
- Modify: `src/output/table.ts` — only render Languages, Frameworks, Components sections
- Modify: `src/output/json.ts` — only serialize the slimmed `RepoScanResult`

- [ ] **Step 1: Locate scanignore parser**

  Run: `grep -rln "scanignore\|ScanIgnore" src/ --include="*.ts"`

  Note the file paths.

- [ ] **Step 2: Strip scoped-rule support**

  In the scanignore parser:
  - Remove handling for `[section]` headers and `prefix:` inline syntax
  - Keep gitignore-style glob matching with `!` negation, comments, blank lines
  - Keep nested `.scanignore` file discovery (root + subdirectories, additive)
  - Public API: `loadScanIgnore(rootPath, fileIndex): Matcher` where Matcher exposes a single `isIgnored(path: string): boolean`. Remove the per-detector scope parameter.

  Update any caller (likely the file walker and `src/detectors/env/`, `src/detectors/api/` — but those are deleted by Task 6, so only the file walker remains).

- [ ] **Step 3: Slim output renderers**

  In `src/output/table.ts`:
  - Render only: header, Languages section, Frameworks section, Components section (with kind + secondary kinds + path).
  - Delete any helper function that rendered a removed inventory category.

  In `src/output/json.ts`:
  - Output `JSON.stringify(result, null, 2)` of the slimmed result. Delete any custom serialization for removed fields.

- [ ] **Step 4: Update scanignore tests**

  Find any scanignore unit test asserting on scoped rules. Delete those test cases (or test files if scope-only).

- [ ] **Step 5: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  refactor: drop .scanignore scoped rules; slim table and json output

  The [section] and prefix: inline scope syntax served only env and api
  detectors, both of which are now gone. Only gitignore-style global rules
  with additive nesting remain.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 12: Strip tree-sitter dependencies + delete `schemas/`

**Files:**
- Modify: `package.json` — set `"dependencies": {}` (delete all 7 tree-sitter entries)
- Regenerate: `bun.lock`
- Delete: `schemas/` (entire directory)
- Modify: `.npmignore` if it references schemas (verify)
- Modify: `tsconfig.json` if it references removed paths (verify)

- [ ] **Step 1: Strip dependencies from package.json**

  Edit `package.json` so the `dependencies` object becomes `{}`:

  ```diff
  - "dependencies": {
  -   "tree-sitter-c-sharp": "0.23.5",
  -   "tree-sitter-go": "0.25.0",
  -   "tree-sitter-java": "0.23.5",
  -   "tree-sitter-python": "0.25.0",
  -   "tree-sitter-rust": "0.24.0",
  -   "tree-sitter-typescript": "0.23.2",
  -   "web-tree-sitter": "0.26.8"
  - },
  + "dependencies": {},
  ```

  Keep `devDependencies` untouched.

- [ ] **Step 2: Regenerate bun.lock**

  Run: `bun install` (without `--frozen-lockfile`)
  Expected: bun rewrites `bun.lock` to drop the tree-sitter entries.

- [ ] **Step 3: Delete schemas/**

  ```bash
  rm -rf schemas
  ```

- [ ] **Step 4: Verify auxiliary files**

  Run: `grep -rn "schemas/\|tree-sitter" .npmignore tsconfig.json biome.json .release-please-config.json 2>/dev/null`
  Remove any line that still references the deleted paths.

- [ ] **Step 5: Quality gate**

  Run: `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test`

  Note: `--frozen-lockfile` must pass with the regenerated lockfile.

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  chore: drop tree-sitter runtime deps and schemas directory

  No remaining consumers after the AST detectors were removed. Package now
  ships with zero runtime dependencies.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 13: Rewrite README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README with a focused 1.0.0-aligned version**

  Overwrite `README.md` with the following structure (fill in the actual content from the surviving code, not from old README rows):

  ```markdown
  # repo-scanner

  Universal repository scanner. Detects languages, frameworks, and monorepo component structure from any codebase.

  ## Installation

  Published as `@codegeneai/repo-scanner`. Requires [Bun](https://bun.sh) `>= 1.3` at runtime.

  ### Global install

  ```bash
  bun install -g @codegeneai/repo-scanner
  repo-scanner --version
  ```

  ### One-off

  ```bash
  bunx @codegeneai/repo-scanner --path /path/to/repo
  ```

  ### In a project

  ```bash
  bun add -d @codegeneai/repo-scanner
  bun x repo-scanner --path .
  ```

  ## Usage

  ```bash
  repo-scanner --path /path/to/repo
  repo-scanner --path /path/to/repo --format json
  repo-scanner --detectors language,framework      # subset
  repo-scanner detectors                            # list available detectors
  repo-scanner detectors --format json              # machine-readable catalog
  repo-scanner completion zsh > _repo-scanner
  repo-scanner completion install fish
  repo-scanner --version
  ```

  ## What it detects

  - **language** — files and lines of code per language across 24 languages (extension-based).
  - **framework** — framework and library detection from manifest files (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `composer.json`, `pubspec.yaml`, etc.).
  - **monorepo** — workspace detection (Turborepo, Nx, Lerna, Rush, pnpm workspaces, Go workspaces, Bazel, Pants, Melos, .NET Solutions) plus component classification.

  ## Component classification

  Components discovered in monorepos are classified with a primary kind from their directory path and optional secondary kinds from file-name signals.

  | Path prefix | Primary kind |
  |-------------|--------------|
  | `apps/`, `app/` | `app` |
  | `services/`, `service/` | `service` |
  | `packages/`, `libs/`, `pkg/` | `package` |
  | `infra/`, `terraform/`, `deploy/`, `pulumi/`, `cdk/` | `infra` |
  | `scripts/`, `tools/`, `tooling/` | `script` |

  Secondary kinds are inferred from files inside the component directory (see `src/aggregator/content-signals.ts` for the full signal list).

  ## `.scanignore`

  Drop a `.scanignore` file at the repo root (or any subdirectory) to exclude paths from scanning. Uses gitignore syntax with additive nesting.

  ```scanignore
  # Ignore benchmarks everywhere
  **/bench/

  # Ignore specific root directories
  scripts/
  tools/

  # Negate (un-ignore)
  !tools/critical-tool/
  ```

  ## Programmatic API

  ```ts
  import { scanRepo } from "@codegeneai/repo-scanner";

  const result = await scanRepo("/path/to/repo");

  result.inventory.languages;           // string[]
  result.inventory.frameworks;          // string[]
  result.architecture.monorepo;         // boolean
  result.architecture.components;       // Component[]
  result.languageStats;                 // LanguageStats
  ```

  ### Exported types

  ```ts
  import type {
    Architecture,
    Component,
    ComponentKind,
    DetectorId,
    Inventory,
    LanguageStats,
    RepoScanResult,
    ScanRepoOptions,
  } from "@codegeneai/repo-scanner";
  ```

  ## CLI options

  | Flag | Description | Default |
  |------|-------------|---------|
  | `-p`, `--path <dir>` | Directory to scan | cwd |
  | `-f`, `--format <fmt>` | Output format: `table` or `json` | `table` |
  | `--detectors <list>` | Comma-separated detector IDs (`language`, `framework`, `monorepo`) | all three |
  | `--version`, `-v` | Show version | |
  | `--help`, `-h` | Show help | |

  ### Subcommands

  | Command | Description |
  |---------|-------------|
  | `detectors` | List available detector IDs and descriptions |
  | `detectors --format json` | Emit the catalog as JSON |
  | `completion <shell>` | Print a completion script (`bash`, `zsh`, `fish`) |
  | `completion install <shell>` | Install the completion script |
  | `completion uninstall <shell>` | Remove the installed completion script |

  ## License

  MIT
  ```

  After writing, scan for any reference to a flag, type, or detector you've removed. There should be none.

- [ ] **Step 2: Verify**

  Run: `grep -nE "deps|solid|dry-check|topology|diff|env-include|--inventory|@inventory|SolidHealth|CodeDuplication|EnvVar|ApiSurface|DeadExport|CallGraph" README.md`
  Expected: zero matches.

- [ ] **Step 3: Commit**

  ```bash
  git add README.md
  git commit -m "docs: rewrite README for 1.0.0 strip-down

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 14: Final verification + PR

**Files:** none modified — verification only.

- [ ] **Step 1: Full quality gate**

  Run:
  ```bash
  bun install --frozen-lockfile && bun run lint && bun run typecheck && bun test && bun run test:unit && bun run prepublishOnly
  ```
  Expected: all pass.

- [ ] **Step 2: Smoke-test the CLI end-to-end against this repo**

  ```bash
  bun src/bin.ts --path . --format json | head -40
  bun src/bin.ts detectors
  bun src/bin.ts detectors --format json
  bun src/bin.ts --version
  ```
  Expected:
  - The JSON output contains `inventory.languages`, `inventory.frameworks`, `architecture.monorepo`, `architecture.components`, `languageStats`.
  - The `detectors` listing shows exactly three IDs: `framework`, `language`, `monorepo`.
  - `--version` prints the current `package.json` version (still `0.4.3` until release-please bumps).

- [ ] **Step 3: Verify the diff is contained**

  Run: `git log --oneline main..HEAD`
  Expected: a clean per-task commit list (12-13 commits) on `strip-down-to-three`.

  Run: `git diff --stat main`
  Expected: many deletions, a small number of insertions concentrated in `types.ts`, `index.ts`, `README.md`, `scanner.ts`, and `output/table.ts`. No unexplained file additions outside `docs/superpowers/`.

- [ ] **Step 4: Push and open the PR**

  ```bash
  git push -u origin strip-down-to-three
  gh pr create --title "feat!: strip down to language + framework + monorepo detectors" --body "$(cat <<'EOF'
  ## Summary
  - Reduces repo-scanner to three detectors: `language`, `framework`, `monorepo` plus aggregator-driven component classification.
  - Removes all dependency, code-duplication, diff, call-graph, topology, perf, AST, SOLID, naming-convention, dead-export, env, api-surface, db-schema, cross-package-deps, and inventory/quality detectors and their associated CLI flags, types, and tests.
  - Drops all 7 tree-sitter runtime dependencies; runtime deps are now zero.
  - Rewrites the README to match the slimmed surface.

  ## Breaking changes
  - `scanRepo` result shape is now `{ scannedAt, rootPath, inventory: { languages, frameworks }, architecture: { monorepo, components }, languageStats }`.
  - `ScanRepoOptions` only carries `detectors?`.
  - All flags listed in the prior README CLI tables outside `--path`, `--format`, `--detectors`, `--version`, `--help` are removed.
  - The `@<preset>` syntax on `--detectors` is removed.

  ## Test plan
  - [x] `bun install --frozen-lockfile`
  - [x] `bun run lint`
  - [x] `bun run typecheck`
  - [x] `bun test`
  - [x] `bun run test:unit`
  - [x] `bun run prepublishOnly`
  - [x] CLI smoke test (`--path .`, `detectors`, `detectors --format json`, `--version`)

  Squash-merge will use this PR title (`feat!:`) so release-please cuts `1.0.0`.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 5: Stop here**

  Do NOT merge the PR yourself. Hand off to the user for review.

---

## Self-review

- **Spec coverage:** every section of the design spec is covered by a numbered task (Tasks 1-13 do the deletions and rewrites; Task 14 verifies). ✓
- **Placeholders:** no TBDs, no "implement later", every code change has the actual code or the precise diff. ✓
- **Type consistency:** the only types defined here are those in Task 10's final shape. Earlier tasks reference them by spec name (e.g., `RepoScanResult` retains `dependencies` field for now → Task 10 removes it). ✓
- **Order:** consumers are stripped before producers (e.g., scan-profile after presets are gone in Task 8); `src/ast/` only deleted after every AST consumer is removed (Task 6). ✓
