# Component-Level Inventory — Design Spec

## Context

`repo-scanner` v2.0 exposes detectors at the **repo** level: `inventory.frameworks`, `inventory.languages`, `inventory.packageManagers`, and `architecture.components`. In monorepos, this means you can see _that_ the repo uses Next.js and _that_ it has 13 workspace packages, but not _which_ package uses Next.js. Codex flagged this gap during the round-1 review of the `packageManager` detector: "consumers may eventually want 'which component uses which PM,' especially in monorepos."

This spec adds per-component **framework** and **language** detection while preserving the existing top-level aggregate. The motivating questions:

- _Which app in this Turborepo uses Next.js?_
- _Which package is the React Native one?_
- _What's the language breakdown for `apps/api` vs `packages/ui`?_

Out of scope for this spec (deliberately): per-component `packageManager` (most monorepos share one root PM and the value-add is low), nested monorepos, and per-component CI/runtime/IaC detection (those detectors don't exist yet).

## Recommended approach

Single global FileIndex walk, single pass per detector, attribute findings to components in the aggregator by **longest-prefix path match**.

### Schema changes

`src/types.ts`:

```ts
export interface ComponentScope {
  readonly frameworks?: readonly string[];      // present iff framework detector ran
  readonly languageStats?: LanguageStats;       // present iff language detector ran
}

export interface Component {
  readonly path: string;
  readonly name: string;
  readonly kind: ComponentKind;
  readonly secondaryKinds?: readonly ComponentKind[];
  readonly description?: string;
  readonly scoped?: ComponentScope; // NEW
}
```

Both `scoped` and its sub-fields are optional, mirroring the `PartialRepoScanResult` slicing pattern from PR #12. Presence rules:

- **`scoped` itself**: present on a Component iff at least one of the framework or language detectors ran for this scan.
- **`scoped.frameworks`**: present whenever the framework detector ran. May be `[]` when the component has no detected frameworks. Absent when filtered out.
- **`scoped.languageStats`**: present whenever the language detector ran. May have `totalFiles: 0, totalLines: 0, perLanguage: []` for a component with no in-scope source files. Absent when filtered out.

In short: empty arrays/zero counts represent "ran and found nothing"; absent fields represent "didn't run." Same contract `PartialInventory` already uses.

### Attribution mechanism

Internal `Finding` type (in `src/detectors/types.ts`) gains an optional `filePath`:

```ts
export interface Finding {
  readonly value: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly filePath?: string; // NEW — relative path to the file that produced this finding
}
```

Detectors that emit a framework finding from a specific manifest/config file (`package.json`, `pyproject.toml`, `Cargo.toml`, `next.config.ts`, etc.) populate `filePath` with that file's `relativePath`. Findings with no single source file (Cargo workspace's `[workspace]` table, the synthetic "monorepo" finding) leave `filePath` undefined.

### Aggregator logic

Two phases:

**Phase A** (existing, unchanged): Run all enabled detectors. Build:
- Top-level `inventory.frameworks` (deduped set of framework finding values)
- Top-level `inventory.languages` (from `languageStats.perLanguage`)
- Top-level `inventory.packageManagers` (deduped set of packageManager finding values)
- `architecture.components` via `classifyComponent` over componentHints
- Top-level `languageStats` (totals + per-language stats from language detector metadata)

**Phase B** (new): For each Component, build `scoped`:

```ts
const componentByLongestPrefix = (filePath: string): Component | undefined => {
  // Among components whose path is a prefix of filePath, return the one with
  // the deepest path. Deeper paths beat shallower. No match → undefined.
};

for (const finding of frameworkFindings) {
  if (!finding.filePath) continue;
  const comp = componentByLongestPrefix(finding.filePath);
  if (!comp) continue;
  componentFrameworks.get(comp.path).add(finding.value);
}

for (const fileEntry of perFileLanguageData) {
  const comp = componentByLongestPrefix(fileEntry.relativePath);
  if (!comp) continue;
  componentLanguageStats.get(comp.path).accumulate(fileEntry);
}

// Then materialize ComponentScope on each Component that received any data.
```

Top-level `inventory` is unchanged — it remains the **union** across all components plus root-level files. Next.js appears in both top-level `inventory.frameworks` and `apps/web.scoped.frameworks`. "Top-level = what this repo uses; scoped = where it's used."

### Per-file language data

The language detector currently emits aggregated `metadata.perLanguage`. For Phase B to compute per-component stats, the detector needs per-file output as well. Add `metadata.perFile: { relativePath, language, lines }[]`. The aggregator consumes both: `metadata.perLanguage` for top-level stats (unchanged), `metadata.perFile` for per-component grouping. Memory cost is bounded by the file count (a few hundred to a few thousand for realistic repos), acceptable for a CLI that already loads every file into the index.

### Slicing interaction (from PR #12)

- `--detectors monorepo` → `architecture.components` present, `scoped` omitted on every component (framework + language didn't run).
- `--detectors monorepo,framework` → `scoped.frameworks` present; `scoped.languageStats` absent (language detector didn't run).
- `--detectors monorepo,language` → `scoped.languageStats` present; `scoped.frameworks` absent.
- `--detectors monorepo,framework,language` → full scoped data on each component.
- `--detectors framework` (no monorepo) → no `architecture.components` at all; scoped data is moot.

### CLI / table output

Table view (`src/output/table.ts`) gains a fourth column per component row: a compact frameworks summary, max 3 entries then `+N more`. Language stats stay JSON-only.

```
Components
  app       web        apps/web              Next.js, Tailwind CSS
  app       expo       apps/expo             Expo, React Native
  package   ui         packages/ui           React
  package   api        packages/api          tRPC, Drizzle
  package   tooling    tooling/eslint        (none)
```

When `scoped.frameworks` is `undefined` (framework detector didn't run) or `[]` (ran, no frameworks detected): print `(none)` in dim. The column is rendered uniformly whenever the Components section renders at all — no conditional column omission, keeps the row layout consistent across scans.

## Files to modify / create

| File | Change |
|---|---|
| `src/types.ts` | Add `ComponentScope`; extend `Component` with optional `scoped` |
| `src/detectors/types.ts` | Add optional `filePath` to `Finding` |
| `src/detectors/framework.ts` | Populate `filePath` on every emitted finding (each manifest scan already knows the file) |
| `src/detectors/language.ts` | Emit `metadata.perFile` alongside existing `metadata.perLanguage` |
| `src/aggregator/aggregator.ts` | Phase B implementation: per-component attribution + scope materialization |
| `src/output/table.ts` | Fourth column in component rows; render `scoped.frameworks` summary |
| `src/output/table.unit.test.ts` | New tests for the fourth column |
| `src/aggregator/aggregator.unit.test.ts` | New tests for attribution + slicing interaction |
| `src/detectors/framework.unit.test.ts` | Assert `filePath` populated on emitted findings |
| `src/detectors/language.unit.test.ts` | Assert `metadata.perFile` is well-formed |
| `README.md` | Document `components[].scoped` in the Programmatic API section + add to "What it detects" |

## Reusable patterns

- `src/detectors/framework.ts`'s existing manifest-iteration loops already have `file.relativePath` in scope when calling `addFinding`. The change is mechanical: pass that path as `filePath` to a slightly-extended `addFinding` helper.
- `src/detectors/shared.ts` `createFindingAdder()` will need a small signature change: `(name, confidence, evidence, filePath?)`.
- `src/aggregator/aggregator.ts:18-100` already builds `componentMap` from componentHints — re-use that map as the basis for Phase B.
- `src/utils/file-index.ts` `FileIndex` already gives us `relativePath` on every file entry; no new I/O needed.

## Edge cases

- **Nested components** (e.g., `packages/ui` and `packages/ui/storybook` both classified as components — possible but uncommon). Longest-prefix-match gives findings to the deepest. Document this behavior.
- **Findings outside any component** (e.g., root `package.json` declares Next.js in a hybrid root-app + workspace setup). They land in top-level `inventory.frameworks` only; no component receives them.
- **Component with no source files** (e.g., a `tooling/github` that has only `.yml` config and a `package.json`). Under an unfiltered scan: `scoped.languageStats` is `{ totalFiles: 0, totalLines: 0, perLanguage: [] }` and `scoped.frameworks` is `[]`. The component still has `scoped` present — empty arrays/zeros communicate "scanned, nothing found."
- **Per-file language data already excluded from the walk** (anything `getByNamePrimary` filters out — fixtures/tests/vendored). Per-component stats reflect the same filtering as the top-level stats.
- **`description` from `package.json`** is per-component already; that stays unchanged.

## Verification

### Automated

1. **Unit tests** for `aggregate()` with synthetic detector results that include `filePath` values pointing under different components; assert the right values land in the right `scoped.frameworks` sets.
2. **Per-component language stats** test: fixture with 10 files under `apps/web/` and 5 under `packages/ui/`; assert each component's `scoped.languageStats.totalFiles` matches.
3. **Slicing interaction**: `--detectors monorepo` produces components with `scoped` undefined on each. `--detectors monorepo,framework` produces `scoped.frameworks` but no `scoped.languageStats`. Etc.
4. **Top-level unchanged**: any unfiltered scan from before/after this change must produce the same top-level `inventory` and `languageStats` (golden test against a fixture).
5. **Table column behavior**: omitted when uniformly empty; rendered with `+N more` truncation when long.
6. `bun run typecheck`, `bun run test:unit`, `bun run lint` all green.

### Multi-agent OSS smoke battery

Per established practice ([[feedback-repo-scanner-smoke-in-plans]]), dispatch parallel agents post-implementation. Each agent confirms ground truth, runs the scanner, and reports CLEAN / MINOR / REGRESSION.

| Agent | Target | Expected component-level findings |
|---|---|---|
| 1 | `t3-oss/create-t3-turbo` (pnpm Turborepo) | `apps/nextjs.scoped.frameworks` includes Next.js + React + Tailwind + tRPC + Drizzle + Better Auth + TanStack Query; `apps/expo.scoped.frameworks` includes Expo + React Native; `apps/tanstack-start.scoped.frameworks` includes TanStack Start + TanStack Router; `tooling/*` mostly empty |
| 2 | `BurntSushi/ripgrep` (Cargo workspace) | Each of 9 crates has `scoped.languageStats` dominantly Rust; `scoped.frameworks: []` (workspace member crates declare no frameworks per our map) |
| 3 | Synthetic polyglot monorepo | `apps/web/package.json` declares Next.js → `apps/web.scoped.frameworks: ["Next.js"]`; `apps/api/go.mod` declares Gin → `apps/api.scoped.frameworks: ["Gin"]`; languages per-component split correctly |
| 4 | Regression probe — Flask | Single-package repo, no components → no `scoped` data anywhere; top-level inventory matches prior PR #11 round-3 output exactly |

Loop exit: every agent CLEAN, no regressions in top-level fields.

## Semver

Additive change to a public schema field (`Component` gains an optional `scoped`). No existing fields removed or renamed. Top-level inventory semantics unchanged. **Minor bump** (v2.0.0 → v2.1.0). release-please will infer this from a `feat:` commit.
