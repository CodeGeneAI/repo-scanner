# repo-scanner 1.0.0 — strip-down design

**Status:** draft for review
**Date:** 2026-05-13
**Branch (intended):** `strip-down-to-three`

## Goal

Reduce repo-scanner from 29 registered detectors + 9 aggregator-derived outputs down to **three detectors** (`language`, `framework`, `monorepo`) plus the aggregator's component classification. Everything else is removed. Bump to **1.0.0** as a single breaking conventional-commits change.

## Non-goals

- Adding new functionality.
- Backwards-compatibility shims, deprecation periods, or re-export aliases for removed symbols.
- Behavior changes to the three kept detectors. They ship as-is.

## What survives

### Detectors (3)

| Detector | Source | Test |
|----------|--------|------|
| `language` | `src/detectors/language.ts` + `language-extensions.ts` | `language.unit.test.ts` |
| `framework` | `src/detectors/framework.ts` + `shared.ts` helpers | `framework.unit.test.ts` |
| `monorepo` | `src/detectors/monorepo.ts` | `monorepo.unit.test.ts` |

### Aggregator path → component classification

- `src/aggregator/aggregator.ts` (slimmed: no architecture-analysis call, no enrichment, no removed inventory fields)
- `src/aggregator/component-classifier.ts` (path-prefix → primary kind)
- `src/aggregator/content-signals.ts` (file-name signals → secondary kinds)

### Core infrastructure

- `src/bin.ts` (slimmed)
- `src/cli.ts` (slimmed — see "New surface" below)
- `src/scanner.ts` (orchestrator)
- `src/types.ts` (only the kept types)
- `src/index.ts` (only the kept exports)
- `src/detectors/registry.ts`
- `src/detectors/init.ts` (3 imports)
- `src/detectors/catalog.ts` (3 entries, no presets, no `DETECTOR_PRESETS`)
- `src/detectors/types.ts`
- `src/detectors/shared.ts` (only the helpers `framework.ts` and `monorepo.ts` actually use; trim unused exports)
- `src/utils/file-index.ts`, `src/utils/fs.ts`, `src/utils/concurrency.ts`
- `src/output/json.ts` (slimmed)
- `src/output/table.ts` (slimmed)
- `src/scan-profile.ts` — **deleted**. With no section-profile flags, no topology mapping, and no presets, the file has no remaining responsibility. Any importers (cli.ts, scanner.ts) replace the call with a plain `DETECTOR_IDS` filter inline.

### `.scanignore`

Keep the **gitignore-style global rule parser** (root + nested files, additive). Drop the `[section]` scoped-rule machinery and `prefix:` inline syntax — only `env`/`api` used it and both are gone.

### CLI completion

`completion bash|zsh|fish`, `completion install <shell>`, `completion uninstall <shell>` stay — tiny, no detector coupling.

## What dies

### Whole directories

- `src/detectors/api/`
- `src/detectors/env/`
- `src/detectors/dead-export/`
- `src/detectors/naming-convention/`
- `src/detectors/db-schema/`
- `src/code-duplication/`
- `src/diff/`
- `src/call-graph/`
- `src/ast/`
- `src/dependency/`
- `src/perf/`
- `src/output/topology/`
- `schemas/`

### Individual detectors removed (with their tests)

build, build-commands, call-graph, ci, code-duplication, code-quality, complexity-hotspots, components (as virtual catalog entry), containerization, circular-deps, codebase-size, cross-package-deps, datastore, db-schema, dead-export, dependency-manager, deployment-platform, env, external-services, high-impact-components, iac, language-stats, large-file, layer-violations, lint-commands, linting, naming-convention, repo-tools, runtime, solid-health, test-commands, testing, todo, vcs.

### Aggregator pieces removed

- `src/aggregator/architecture-analysis.ts` (layer-violations, blast-radius/high-impact, circular-deps)
- `src/aggregator/component-enrichment.ts` (all enrichment fields are populated by removed detectors)
- `src/output/dry-check.ts` (no more `--dry-check`)

### Runtime dependencies removed

All seven tree-sitter packages dropped from `package.json` `dependencies`:
- `tree-sitter-c-sharp`, `tree-sitter-go`, `tree-sitter-java`, `tree-sitter-python`, `tree-sitter-rust`, `tree-sitter-typescript`, `web-tree-sitter`.

Final runtime `dependencies`: **`{}`**.

## New surface

### CLI

```
repo-scanner [--path <dir>] [--format table|json]
repo-scanner --detectors language,framework,monorepo
repo-scanner detectors                       # lists the 3
repo-scanner detectors --format json         # machine-readable catalog
repo-scanner completion {bash|zsh|fish}
repo-scanner completion install   <shell>
repo-scanner completion uninstall <shell>
repo-scanner --version | -v
repo-scanner --help    | -h
```

Removed flags (non-exhaustive): `--deps*`, `--solid*`, `--dry-check`, `--min-tokens`, `--min-lines`, `--extensions`, `--min-unique-ratio`, `--max-literal-ratio`, `--no-barrel-filter`, `--large-file-threshold`, `--env-include-tests`, `--diff*`, `--topology*`, `--architecture`, `--inventory`, `--external-services`, `--build-and-test`, `--all-detectors`, `--full-scan`, `--schema`, all `--fail-on-*` policy gates, all dependency-related flags.

### Public API (`src/index.ts`)

```ts
export { scanRepo } from "./scanner";
export type {
  RepoScanResult,
  Component,
  ComponentKind,
  LanguageStats,
  ScanRepoOptions,
  DetectorId,
} from "./types";
```

Nothing else is re-exported. `DetectorId = "language" | "framework" | "monorepo"`.

### `RepoScanResult` shape

```ts
interface RepoScanResult {
  scannedAt: string;
  rootPath: string;
  inventory: {
    languages: string[];      // sorted, unique
    frameworks: string[];     // sorted, unique
  };
  architecture: {
    monorepo: boolean;
    components: Component[];
  };
  languageStats: LanguageStats;
}

interface Component {
  path: string;
  name: string;
  kind: ComponentKind;             // "app" | "service" | "package" | "infra" | "script" | "library"
  secondaryKinds?: ComponentKind[];
  description?: string;
}
```

All other fields (`signals`, `buildAndTest`, `dependencies`, `apiSurface`, `envVars`, `deadExports`, `codeDuplication`, `solid`, `crossPackageDeps`, `largeFiles`, `todos`, etc.) are removed from the type.

### `ScanRepoOptions`

```ts
interface ScanRepoOptions {
  detectors?: DetectorId[];   // default: all three
}
```

No `dependencies` block, no policy options, no concurrency knob (use platform default internally).

### Output

- **Table:** Languages section, Frameworks section, Components section (showing kind + secondary kinds + path).
- **JSON:** the slimmed `RepoScanResult` shape, serialized as-is.

## Migration mechanics

### Versioning

- This is breaking: types, CLI flags, and the public API all change.
- Single conventional-commits commit using the `feat!:` prefix; release-please will produce a `1.0.0` major bump.
- `CHANGELOG.md` gets a "BREAKING CHANGE" entry generated by release-please.

### Branch / PR flow

1. Cut branch `strip-down-to-three` from `main`.
2. Land the strip-down in a single commit.
3. Open PR. CI runs `lint`, `typecheck`, unit tests, prepublishOnly.
4. Merge. release-please opens the `chore(main): release 1.0.0` PR. Merging that publishes to npm.

### Quality gates (must all pass before commit)

- `bun install --frozen-lockfile`
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run test:unit`
- `bun run prepublishOnly`

### Test strategy

- Keep `language.unit.test.ts`, `framework.unit.test.ts`, `monorepo.unit.test.ts` unchanged.
- Update `detectors.unit.test.ts` to expect 3 registered IDs and no presets.
- Update `cli.unit.test.ts` to match the slimmed flag set; delete cases targeting removed flags.
- Update `scanner.unit.test.ts` for the slimmed result shape.
- Update aggregator tests to drop expectations on enrichment / architecture-analysis fields.
- Every test file whose detector is removed is deleted outright (no `attic/`).

### README rewrite

- Remove the Detector × Language matrix entirely (3 detectors don't need a matrix).
- Remove `.scanignore` "Scoped rules" / "Available scopes" / "Inline prefix" sections; keep "Basic usage" and "Nesting".
- Remove Inventory categories table (only Languages / Frameworks / Components remain).
- Remove every CLI-flag-table row for a deleted flag.
- Remove the programmatic-API blocks referencing removed types.
- Strip the language-support-by-detector section to just the language-detection table.
- Update the Bun version requirement to `>= 1.3` (currently says `>= 1.2`, which is already wrong per the audit).

## Risks & mitigations

- **Risk:** A kept test file imports something from a deleted module. *Mitigation:* `bun run typecheck` will catch every such import before commit.
- **Risk:** `shared.ts` exports helpers that only removed detectors used; trimming it might over-trim if `framework.ts`/`monorepo.ts` quietly use something else. *Mitigation:* trim only what's verifiably unused (typecheck + lint will flag dead code).
- **Risk:** Aggregator tests assert on field paths that no longer exist on the slimmed `RepoScanResult`. *Mitigation:* updating those tests is part of the same commit; typecheck flags them.
- **Risk:** `release-please` config still references removed detector components or schemas. *Mitigation:* the `.release-please-config.json` is repo-scoped and detector-agnostic; no edits needed unless schema path is mentioned (verify during execution).

## Order of operations (high level — full plan in writing-plans)

1. Strip `package.json` deps.
2. Delete the dead directories (whole-tree removals) and individual detector files.
3. Slim `catalog.ts`, `init.ts`, `index.ts`, `types.ts`.
4. Slim `cli.ts`, `bin.ts`, `scanner.ts`.
5. Slim `aggregator.ts`; delete `architecture-analysis.ts`, `component-enrichment.ts`.
6. Slim `output/json.ts`, `output/table.ts`; delete `output/dry-check.ts` and `output/topology/`.
7. Strip `.scanignore` scoped-rule machinery from `utils/`.
8. Update remaining tests; delete tests for removed detectors.
9. Rewrite README.
10. Run quality gates; iterate until green.
11. Commit as `feat!: strip down to language + framework + monorepo detectors` with `BREAKING CHANGE:` footer.

## Out of scope

- Reintroducing any removed feature behind a flag.
- Adding new detectors.
- Renaming the npm package.
- Changing the JSON-output schema beyond what the type slimming forces.
