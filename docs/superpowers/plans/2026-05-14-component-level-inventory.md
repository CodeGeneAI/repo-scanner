# Component-Level Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface per-component `scoped.frameworks` and `scoped.languageStats` on each `architecture.components[]` entry, attributed via `Finding.filePath` and longest-prefix match. Top-level inventory remains the union.

**Architecture:** One global FileIndex walk + one pass per detector (unchanged). Detectors gain an optional `filePath` on each `Finding`. Aggregator gains a Phase B that groups findings + per-file language data by their containing component.

**Tech Stack:** TypeScript, Bun (`bun test`, `bun src/bin.ts`), no runtime deps, Biome lint.

---

## File structure

| File | Change |
|---|---|
| `src/types.ts` | Add `ComponentScope`; extend `Component` with optional `scoped` |
| `src/detectors/types.ts` | Add optional `filePath` to `Finding` |
| `src/detectors/shared.ts` | `createFindingAdder` accepts optional `filePath` |
| `src/detectors/framework.ts` | Pass file paths to `addFinding` at every call site |
| `src/detectors/language.ts` | Emit `metadata.perFile: { relativePath, language, lines }[]` |
| `src/aggregator/aggregator.ts` | Phase B: build `scoped` per component |
| `src/output/table.ts` | 4th column on component rows: compact frameworks summary |
| `README.md` | Document `components[].scoped` |
| `src/aggregator/aggregator.unit.test.ts` | Tests for attribution + slicing |
| `src/detectors/framework.unit.test.ts` | Test `filePath` populated on findings |
| `src/detectors/language.unit.test.ts` | Test `perFile` metadata shape |
| `src/output/table.unit.test.ts` | Test 4th column rendering |

---

## Task 1: Schema types (no behavior change)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/detectors/types.ts`

- [ ] **Step 1: Add `ComponentScope` + extend `Component` in `src/types.ts`**

Append `ComponentScope` and add `scoped?` to `Component`:

```ts
export interface ComponentScope {
  readonly frameworks?: readonly string[];
  readonly languageStats?: LanguageStats;
}

export interface Component {
  readonly path: string;
  readonly name: string;
  readonly kind: ComponentKind;
  readonly secondaryKinds?: readonly ComponentKind[];
  readonly description?: string;
  readonly scoped?: ComponentScope;
}
```

- [ ] **Step 2: Add `filePath?` to `Finding` in `src/detectors/types.ts`**

Locate the existing `Finding` interface and add the field:

```ts
export interface Finding {
  readonly value: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly filePath?: string;
}
```

- [ ] **Step 3: Re-export `ComponentScope` from `src/index.ts`**

In `src/index.ts`, add `ComponentScope` to the type re-export list (preserve alphabetical order):

```ts
export type {
  Architecture,
  Component,
  ComponentKind,
  ComponentScope,
  DetectorId,
  Inventory,
  LanguageStats,
  PartialInventory,
  PartialRepoScanResult,
  RepoScanResult,
  ScanRepoOptions,
} from "./types";
```

- [ ] **Step 4: Verify nothing broke**

Run: `bun run typecheck && bun run test:unit`
Expected: typecheck clean, all existing tests still pass (no behavior change yet, just optional fields added).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/detectors/types.ts src/index.ts
git commit -m "feat(types): add ComponentScope + Finding.filePath

Add the optional Component.scoped field that will carry per-component
frameworks and languageStats, plus the optional filePath field on
Finding that detectors will populate to enable attribution. Pure
schema addition; no behavior change yet.
"
```

---

## Task 2: Populate `Finding.filePath` from the framework detector

**Files:**
- Modify: `src/detectors/shared.ts`
- Modify: `src/detectors/framework.ts`
- Modify: `src/detectors/framework.unit.test.ts`

- [ ] **Step 1: Write a failing test**

Append to `src/detectors/framework.unit.test.ts`:

```ts
test("emits Finding.filePath pointing at the source manifest", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rs-fp-"));
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ dependencies: { next: "^15", react: "^19" } }),
  );
  const result = await runFrameworkDetector(dir);
  const nextFinding = result.findings.find((f) => f.value === "Next.js");
  expect(nextFinding?.filePath).toBe("package.json");
  const reactFinding = result.findings.find((f) => f.value === "React");
  expect(reactFinding?.filePath).toBe("package.json");
});
```

(`runFrameworkDetector` is the harness already used elsewhere in this file; reuse it.)

- [ ] **Step 2: Run — expect FAIL**

```
bun test src/detectors/framework.unit.test.ts -t "filePath"
```
Expected: FAIL — `filePath` is `undefined`.

- [ ] **Step 3: Extend `createFindingAdder` signature**

Edit `src/detectors/shared.ts:14-29`:

```ts
export function createFindingAdder(): {
  seen: Set<string>;
  findings: Finding[];
  addFinding: (
    name: string,
    confidence: number,
    evidence: string,
    filePath?: string,
  ) => void;
} {
  const seen = new Set<string>();
  const findings: Finding[] = [];

  const addFinding = (
    name: string,
    confidence: number,
    evidence: string,
    filePath?: string,
  ) => {
    if (seen.has(name)) return;
    seen.add(name);
    findings.push({
      value: name,
      confidence,
      evidence: [evidence],
      ...(filePath ? { filePath } : {}),
    });
  };

  return { seen, findings, addFinding };
}
```

- [ ] **Step 4: Pass `filePath` from every framework detector call site**

In `src/detectors/framework.ts`, every loop that iterates files via `index.getByNamePrimary(...)` has `file.relativePath` in scope when calling `addFinding`. Pass it as the fourth arg.

Grep for `addFinding(` in `src/detectors/framework.ts` to find every site. The pattern transform is:

```ts
// before:
addFinding("Next.js", 0.9, `package.json contains next`);
// after:
addFinding("Next.js", 0.9, `package.json contains next`, file.relativePath);
```

For helpers in `src/detectors/shared.ts` (`scanFilesForIndicators`, `scanPythonDeps`, `scanGemfile`, `scanComposerJson`): each helper already has `file.relativePath` in scope. Update each to forward it as the 4th arg of `addFinding`. The helpers' callers don't need to change.

- [ ] **Step 5: Run — expect PASS**

```
bun test src/detectors/framework.unit.test.ts
```
Expected: new test green, existing tests still green.

```
bun run test:unit
```
Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/detectors/shared.ts src/detectors/framework.ts src/detectors/framework.unit.test.ts
git commit -m "feat(framework): populate Finding.filePath at every emit site

Extend createFindingAdder with an optional fourth arg. Every framework
detector path (npm/Python/Go/Composer/Gemfile/config-file/extension)
already has file.relativePath in scope when emitting a finding; pass
it through. Required for the upcoming per-component attribution
phase in the aggregator.
"
```

---

## Task 3: Aggregator Phase B — frameworks per component

**Files:**
- Modify: `src/aggregator/aggregator.ts`
- Modify: `src/aggregator/aggregator.unit.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/aggregator/aggregator.unit.test.ts`:

```ts
describe("aggregate: per-component framework attribution", () => {
  it("attributes framework findings to the deepest matching component", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "framework",
        findings: [
          {
            value: "Next.js",
            confidence: 1,
            evidence: [],
            filePath: "apps/web/package.json",
          },
          {
            value: "React",
            confidence: 1,
            evidence: [],
            filePath: "packages/ui/package.json",
          },
          {
            value: "Tailwind CSS",
            confidence: 1,
            evidence: [],
            filePath: "apps/web/tailwind.config.ts",
          },
        ],
      },
      {
        detectorId: "monorepo",
        findings: [
          { value: "Turborepo", confidence: 1, evidence: ["found turbo.json"] },
          { value: "monorepo", confidence: 1, evidence: [] },
        ],
        componentHints: [
          { path: "apps/web", name: "web" },
          { path: "packages/ui", name: "ui" },
        ],
      },
    ];
    const result = await aggregate(rootPath, results);
    const web = result.architecture.components.find((c) => c.path === "apps/web");
    const ui = result.architecture.components.find((c) => c.path === "packages/ui");
    expect(web?.scoped?.frameworks?.slice().sort()).toEqual(["Next.js", "Tailwind CSS"]);
    expect(ui?.scoped?.frameworks).toEqual(["React"]);
  });

  it("findings without filePath stay in top-level inventory only", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "framework",
        findings: [{ value: "Detected Somewhere", confidence: 1, evidence: [] }],
      },
      {
        detectorId: "monorepo",
        findings: [
          { value: "Turborepo", confidence: 1, evidence: [] },
          { value: "monorepo", confidence: 1, evidence: [] },
        ],
        componentHints: [{ path: "apps/web", name: "web" }],
      },
    ];
    const result = await aggregate(rootPath, results);
    const web = result.architecture.components.find((c) => c.path === "apps/web");
    expect(result.inventory.frameworks).toContain("Detected Somewhere");
    expect(web?.scoped?.frameworks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
bun test src/aggregator/aggregator.unit.test.ts -t "per-component framework"
```
Expected: FAIL — `scoped` is undefined on components.

- [ ] **Step 3: Implement Phase B for frameworks in `src/aggregator/aggregator.ts`**

After the existing component-building loop (around line 50-70) and after the languageStats extraction, before the `const components = [...componentMap.values()].sort(...)` line, add:

```ts
// Phase B: collect framework findings per component via longest-prefix match.
const componentPaths = [...componentMap.keys()].sort(
  (a, b) => b.length - a.length, // deepest first
);
const componentFrameworks = new Map<string, Set<string>>();
for (const compPath of componentPaths) {
  componentFrameworks.set(compPath, new Set());
}

const findComponentForFile = (filePath: string): string | undefined => {
  for (const compPath of componentPaths) {
    if (filePath === compPath || filePath.startsWith(`${compPath}/`)) {
      return compPath;
    }
  }
  return undefined;
};

for (const result of results) {
  if (result.detectorId !== "framework") continue;
  for (const finding of result.findings) {
    if (!finding.filePath) continue;
    const compPath = findComponentForFile(finding.filePath);
    if (!compPath) continue;
    componentFrameworks.get(compPath)!.add(finding.value);
  }
}
```

Then, when materializing each Component in the existing `componentMap.values()` iteration, attach `scoped`. The existing component build is around the `componentMap.set(hint.path, component)` line. Refactor the component materialization to happen AFTER Phase B so we can include `scoped`:

Change the existing inline `componentMap.set(hint.path, component)` so that, instead of finalizing the Component immediately, it stores the raw fields and the final `scoped` gets stitched in at the end. Cleanest approach: build a separate finalization step right before `const components = [...componentMap.values()].sort(...)`:

```ts
// Build per-detector run flags so we know whether each sub-field should be
// present (empty arrays/zeros) or absent.
const frameworkRan = results.some((r) => r.detectorId === "framework");

// Re-materialize components with scoped data attached.
for (const [compPath, comp] of componentMap) {
  const fwSet = componentFrameworks.get(compPath);
  const frameworks = fwSet ? [...fwSet].sort() : [];
  const scoped: ComponentScope = {};
  if (frameworkRan) scoped.frameworks = frameworks;
  // languageStats added in Task 5
  if (Object.keys(scoped).length > 0) {
    componentMap.set(compPath, { ...comp, scoped });
  }
}
```

Import `ComponentScope` from `../types`. The intermediate `Component` shape doesn't need `scoped` to be required — TypeScript's structural typing accepts the rebuilt object.

- [ ] **Step 4: Run — expect PASS**

```
bun test src/aggregator/aggregator.unit.test.ts -t "per-component framework"
bun run test:unit
bun run typecheck
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/aggregator/aggregator.ts src/aggregator/aggregator.unit.test.ts
git commit -m "feat(aggregator): attribute framework findings to components

Add Phase B to aggregate(): build a longest-prefix path matcher from
componentMap, then walk every framework Finding with a filePath and
add the value to the matching component's scoped.frameworks set.
Findings without filePath, or whose path doesn't fall under any
component, stay in the top-level inventory only.

Top-level inventory.frameworks remains the union of all detected
frameworks (root-level + every component), unchanged.
"
```

---

## Task 4: Language detector emits `metadata.perFile`

**Files:**
- Modify: `src/detectors/language.ts`
- Modify: `src/detectors/language.unit.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/detectors/language.unit.test.ts`:

```ts
test("emits per-file metadata for component attribution", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rs-lang-pf-"));
  await mkdir(path.join(dir, "apps/web"), { recursive: true });
  await writeFile(path.join(dir, "apps/web/index.ts"), "export const x = 1;\n");
  await writeFile(path.join(dir, "root.ts"), "export const y = 2;\n");
  const result = await runLanguageDetector(dir);
  const perFile = result.metadata?.perFile as
    | Array<{ relativePath: string; language: string; lines: number }>
    | undefined;
  expect(Array.isArray(perFile)).toBe(true);
  const paths = perFile!.map((e) => e.relativePath).sort();
  expect(paths).toContain("apps/web/index.ts");
  expect(paths).toContain("root.ts");
  const entry = perFile!.find((e) => e.relativePath === "apps/web/index.ts")!;
  expect(entry.language).toBe("TypeScript");
  expect(entry.lines).toBeGreaterThan(0);
});
```

(`runLanguageDetector` should follow the pattern already used in the file. If no harness exists, inline `getDetectors().find((d) => d.id === "language")!.detect(dir, await FileIndex.build(dir))`.)

- [ ] **Step 2: Run — expect FAIL**

```
bun test src/detectors/language.unit.test.ts -t "per-file metadata"
```
Expected: FAIL — `metadata.perFile` is undefined.

- [ ] **Step 3: Emit `perFile` in `src/detectors/language.ts`**

Locate `allLangFiles` (around line 115-117) and `lineCounts` immediately after it. Today the `flatMap` projects each file into `{ lang, path }` — no `relativePath`. Two changes:

A. Include `relativePath` in the projected items:

```ts
const allLangFiles = [...filesByLang.entries()].flatMap(([lang, files]) =>
  files.map((f) => ({
    lang,
    path: f.path,
    relativePath: f.relativePath,
  })),
);
```

B. Capture per-file detail inside the `mapWithConcurrency` callback:

```ts
const perFileEntries: Array<{
  relativePath: string;
  language: string;
  lines: number;
}> = [];

const lineCounts = await mapWithConcurrency(
  allLangFiles,
  LOC_CONCURRENCY,
  async (item) => {
    const lines = await countLines(item.path);
    perFileEntries.push({
      relativePath: item.relativePath,
      language: item.lang,
      lines,
    });
    return { lang: item.lang, lines };
  },
);
```

In the return statement at line 143-147, add `perFile`:

```ts
return {
  detectorId: "language",
  findings: findings.sort((a, b) => b.confidence - a.confidence),
  metadata: { perLanguage, totalFiles, totalLines, perFile: perFileEntries },
};
```

- [ ] **Step 4: Run — expect PASS**

```
bun test src/detectors/language.unit.test.ts
bun run test:unit
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/detectors/language.ts src/detectors/language.unit.test.ts
git commit -m "feat(language): emit per-file metadata for component attribution

The aggregator's upcoming Phase B needs per-file (relativePath,
language, lines) data to compute per-component language stats. The
detector already walks every source file when counting lines — capture
that data into metadata.perFile alongside the existing per-language
aggregate.
"
```

---

## Task 5: Aggregator Phase B — `scoped.languageStats` per component

**Files:**
- Modify: `src/aggregator/aggregator.ts`
- Modify: `src/aggregator/aggregator.unit.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/aggregator/aggregator.unit.test.ts`:

```ts
describe("aggregate: per-component languageStats", () => {
  it("groups per-file language data into each component's scoped.languageStats", async () => {
    const perFile = [
      { relativePath: "apps/web/index.ts", language: "TypeScript", lines: 100 },
      { relativePath: "apps/web/util.ts", language: "TypeScript", lines: 50 },
      { relativePath: "packages/ui/index.tsx", language: "TypeScript", lines: 30 },
      { relativePath: "root.ts", language: "TypeScript", lines: 10 },
    ];
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [],
        metadata: {
          perLanguage: [
            { language: "TypeScript", files: 4, lines: 190, percentage: 100 },
          ],
          totalFiles: 4,
          totalLines: 190,
          perFile,
        },
      },
      {
        detectorId: "monorepo",
        findings: [
          { value: "Turborepo", confidence: 1, evidence: [] },
          { value: "monorepo", confidence: 1, evidence: [] },
        ],
        componentHints: [
          { path: "apps/web", name: "web" },
          { path: "packages/ui", name: "ui" },
        ],
      },
    ];
    const result = await aggregate(rootPath, results);
    const web = result.architecture.components.find((c) => c.path === "apps/web");
    const ui = result.architecture.components.find((c) => c.path === "packages/ui");
    expect(web?.scoped?.languageStats?.totalFiles).toBe(2);
    expect(web?.scoped?.languageStats?.totalLines).toBe(150);
    expect(web?.scoped?.languageStats?.perLanguage).toEqual([
      { language: "TypeScript", files: 2, lines: 150, percentage: 100 },
    ]);
    expect(ui?.scoped?.languageStats?.totalFiles).toBe(1);
    expect(ui?.scoped?.languageStats?.totalLines).toBe(30);
  });

  it("component with no in-scope files has zero-count stats, not undefined", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [],
        metadata: {
          perLanguage: [{ language: "TypeScript", files: 1, lines: 10, percentage: 100 }],
          totalFiles: 1,
          totalLines: 10,
          perFile: [
            { relativePath: "apps/web/index.ts", language: "TypeScript", lines: 10 },
          ],
        },
      },
      {
        detectorId: "monorepo",
        findings: [
          { value: "Turborepo", confidence: 1, evidence: [] },
          { value: "monorepo", confidence: 1, evidence: [] },
        ],
        componentHints: [
          { path: "apps/web", name: "web" },
          { path: "tooling/empty", name: "empty" },
        ],
      },
    ];
    const result = await aggregate(rootPath, results);
    const empty = result.architecture.components.find((c) => c.path === "tooling/empty");
    expect(empty?.scoped?.languageStats).toEqual({
      totalFiles: 0,
      totalLines: 0,
      perLanguage: [],
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
bun test src/aggregator/aggregator.unit.test.ts -t "per-component languageStats"
```
Expected: FAIL.

- [ ] **Step 3: Implement language attribution in Phase B**

In `src/aggregator/aggregator.ts`, alongside the framework attribution from Task 3, add a perFile collector and per-component aggregation. Place inside the same Phase B block:

```ts
// Extract perFile metadata from the language detector result, if any.
const languageDetectorResult = results.find(
  (r) => r.detectorId === "language",
);
const perFile = (languageDetectorResult?.metadata?.perFile ?? []) as Array<{
  relativePath: string;
  language: string;
  lines: number;
}>;

const componentLangStats = new Map<
  string,
  { files: number; lines: number; perLang: Map<string, { files: number; lines: number }> }
>();
for (const compPath of componentPaths) {
  componentLangStats.set(compPath, {
    files: 0,
    lines: 0,
    perLang: new Map(),
  });
}

for (const entry of perFile) {
  const compPath = findComponentForFile(entry.relativePath);
  if (!compPath) continue;
  const bucket = componentLangStats.get(compPath)!;
  bucket.files += 1;
  bucket.lines += entry.lines;
  const lang = bucket.perLang.get(entry.language) ?? { files: 0, lines: 0 };
  lang.files += 1;
  lang.lines += entry.lines;
  bucket.perLang.set(entry.language, lang);
}
```

Then in the component re-materialization (the loop added in Task 3), extend `scoped` to include `languageStats` when the language detector ran:

```ts
const languageRan = results.some((r) => r.detectorId === "language");

for (const [compPath, comp] of componentMap) {
  const fwSet = componentFrameworks.get(compPath);
  const frameworks = fwSet ? [...fwSet].sort() : [];
  const langBucket = componentLangStats.get(compPath);
  const scoped: ComponentScope = {};
  if (frameworkRan) scoped.frameworks = frameworks;
  if (languageRan) {
    const totalFiles = langBucket?.files ?? 0;
    const totalLines = langBucket?.lines ?? 0;
    const perLanguage =
      totalFiles > 0
        ? [...(langBucket?.perLang.entries() ?? [])]
            .map(([language, { files, lines }]) => ({
              language,
              files,
              lines,
              percentage: Math.round((files / totalFiles) * 1000) / 10,
            }))
            .sort((a, b) => b.percentage - a.percentage)
        : [];
    scoped.languageStats = { totalFiles, totalLines, perLanguage };
  }
  if (Object.keys(scoped).length > 0) {
    componentMap.set(compPath, { ...comp, scoped });
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```
bun test src/aggregator/aggregator.unit.test.ts
bun run test:unit
bun run typecheck
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/aggregator/aggregator.ts src/aggregator/aggregator.unit.test.ts
git commit -m "feat(aggregator): attribute per-file language stats to components

Read metadata.perFile from the language detector, group each entry
by its longest-prefix-matching component, and materialize
scoped.languageStats on each Component. Components with no in-scope
files get the zero-totals stats object so consumers can distinguish
'scanned, empty' from 'didn't run.'
"
```

---

## Task 6: Table column — compact frameworks summary per component

**Files:**
- Modify: `src/output/table.ts`
- Modify: `src/output/table.unit.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/output/table.unit.test.ts`:

```ts
describe("renderTable component scoped frameworks column", () => {
  const make = (over: Partial<Component>): Component => ({
    path: "apps/web",
    name: "web",
    kind: "app",
    ...over,
  });

  test("renders frameworks inline after the path column", () => {
    const out = capture(
      baseResult({
        architecture: {
          monorepo: true,
          components: [
            make({ scoped: { frameworks: ["Next.js", "Tailwind CSS"] } }),
          ],
        },
      }),
    );
    expect(out).toMatch(/apps\/web[\s\S]*Next\.js[\s\S]*Tailwind CSS/);
  });

  test("truncates with +N more when more than 3 frameworks", () => {
    const out = capture(
      baseResult({
        architecture: {
          monorepo: true,
          components: [
            make({
              scoped: {
                frameworks: ["Next.js", "React", "Tailwind CSS", "tRPC", "Drizzle"],
              },
            }),
          ],
        },
      }),
    );
    expect(out).toMatch(/Next\.js.*React.*Tailwind CSS.*\+2 more/);
  });

  test("renders (none) when scoped.frameworks is empty or undefined", () => {
    const out1 = capture(
      baseResult({
        architecture: {
          monorepo: true,
          components: [make({ scoped: { frameworks: [] } })],
        },
      }),
    );
    expect(out1).toMatch(/apps\/web[\s\S]*\(none\)/);

    const out2 = capture(
      baseResult({
        architecture: {
          monorepo: true,
          components: [make({ scoped: undefined })],
        },
      }),
    );
    expect(out2).toMatch(/apps\/web[\s\S]*\(none\)/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
bun test src/output/table.unit.test.ts -t "scoped frameworks column"
```
Expected: FAIL — current row format has no frameworks column.

- [ ] **Step 3: Update the component-row render in `src/output/table.ts`**

Locate the Components section. The existing render is something like:

```ts
w(
  `  ${YELLOW}${c.kind.padEnd(8)}${RESET}${secondary} ${c.name}${desc} ${DIM}${c.path}${RESET}\n`,
);
```

Replace with a render that appends a frameworks summary:

```ts
const fws = c.scoped?.frameworks;
const fwSummary = fws === undefined || fws.length === 0
  ? `${DIM}(none)${RESET}`
  : fws.length <= 3
    ? fws.join(", ")
    : `${fws.slice(0, 3).join(", ")} ${DIM}+${fws.length - 3} more${RESET}`;
w(
  `  ${YELLOW}${c.kind.padEnd(8)}${RESET}${secondary} ${c.name}${desc} ${DIM}${c.path}${RESET}  ${fwSummary}\n`,
);
```

The trailing two spaces before `${fwSummary}` separate it from the path visually.

- [ ] **Step 4: Run — expect PASS**

```
bun test src/output/table.unit.test.ts
bun run test:unit
```
Expected: all green.

- [ ] **Step 5: End-to-end sanity (no clones needed; self-scan)**

```
bun src/bin.ts --path .
```
Expected: the Components section is `(none)` because repo-scanner has no components — same output as before this task. To verify on a real monorepo:

```
git clone --depth 1 https://github.com/t3-oss/create-t3-turbo.git /tmp/rs-t3
bun src/bin.ts --path /tmp/rs-t3
```
Expected: each component row shows its frameworks inline. `tooling/*` rows show `(none)`.

- [ ] **Step 6: Commit**

```bash
git add src/output/table.ts src/output/table.unit.test.ts
git commit -m "feat(output): show component frameworks inline in table view

Append a frameworks summary to every component row in the table
output. Up to 3 frameworks joined with commas, then '+N more' for
overflow. (none) when scoped.frameworks is missing or empty.
"
```

---

## Task 7: Slicing interaction tests + README

**Files:**
- Modify: `src/aggregator/aggregator.unit.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Add slicing-interaction tests**

Append to `src/aggregator/aggregator.unit.test.ts`:

```ts
describe("aggregate: scoped under detector filter", () => {
  const setup = (): DetectorResult[] => [
    {
      detectorId: "framework",
      findings: [
        {
          value: "Next.js",
          confidence: 1,
          evidence: [],
          filePath: "apps/web/package.json",
        },
      ],
    },
    {
      detectorId: "language",
      findings: [],
      metadata: {
        perLanguage: [{ language: "TypeScript", files: 1, lines: 10, percentage: 100 }],
        totalFiles: 1,
        totalLines: 10,
        perFile: [
          { relativePath: "apps/web/index.ts", language: "TypeScript", lines: 10 },
        ],
      },
    },
    {
      detectorId: "monorepo",
      findings: [
        { value: "Turborepo", confidence: 1, evidence: [] },
        { value: "monorepo", confidence: 1, evidence: [] },
      ],
      componentHints: [{ path: "apps/web", name: "web" }],
    },
  ];

  it("--detectors monorepo: scoped is undefined on every component", async () => {
    const r = await aggregate(rootPath, [setup()[2]!], undefined, {
      selectedDetectors: new Set(["monorepo"]),
    });
    const web = r.architecture?.components.find((c) => c.path === "apps/web");
    expect(web?.scoped).toBeUndefined();
  });

  it("--detectors monorepo,framework: scoped.frameworks set, languageStats absent", async () => {
    const all = setup();
    const r = await aggregate(
      rootPath,
      [all[0]!, all[2]!],
      undefined,
      { selectedDetectors: new Set(["monorepo", "framework"]) },
    );
    const web = r.architecture?.components.find((c) => c.path === "apps/web");
    expect(web?.scoped?.frameworks).toEqual(["Next.js"]);
    expect(web?.scoped?.languageStats).toBeUndefined();
  });

  it("--detectors monorepo,language: scoped.languageStats set, frameworks absent", async () => {
    const all = setup();
    const r = await aggregate(
      rootPath,
      [all[1]!, all[2]!],
      undefined,
      { selectedDetectors: new Set(["monorepo", "language"]) },
    );
    const web = r.architecture?.components.find((c) => c.path === "apps/web");
    expect(web?.scoped?.frameworks).toBeUndefined();
    expect(web?.scoped?.languageStats?.totalFiles).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect PASS (slicing already implemented from PR #12)**

```
bun test src/aggregator/aggregator.unit.test.ts -t "scoped under detector filter"
```
Expected: PASS — the existing slicing logic plus Tasks 3 & 5's `if (frameworkRan)` / `if (languageRan)` gates produce this behavior naturally.

If any case fails, debug by inspecting which detector results made it into the `results` array under the filter; the `frameworkRan` / `languageRan` flags should be derived from that array, so they automatically respect the filter.

- [ ] **Step 3: Update README**

In `README.md`, in the "Programmatic API" section, after the existing component example, add:

```ts
// Per-component data (new in v2.1):
const component = result.architecture.components[0];
component.scoped?.frameworks;           // string[] — frameworks used in this component
component.scoped?.languageStats;        // LanguageStats — file/line breakdown for this component
```

Update the "What it detects" section's monorepo bullet to mention per-component data:

```md
- **monorepo** — workspace detection (Turborepo, Nx, Lerna, Rush, pnpm workspaces, Go workspaces, Cargo workspaces, Bazel, Pants, Melos, .NET Solutions, Maven, Gradle, SBT, Elixir umbrella, uv workspace) plus component classification. Each component carries `scoped.frameworks` and `scoped.languageStats` for per-component inventory.
```

In the exported types list, add `ComponentScope`:

```ts
import type {
  Architecture,
  Component,
  ComponentKind,
  ComponentScope,
  DetectorId,
  Inventory,
  LanguageStats,
  PartialInventory,
  PartialRepoScanResult,
  RepoScanResult,
  ScanRepoOptions,
} from "@codegeneai/repo-scanner";
```

- [ ] **Step 4: Commit**

```bash
git add src/aggregator/aggregator.unit.test.ts README.md
git commit -m "docs+test: per-component scoped under --detectors slicing

Add aggregator tests pinning the slicing contract for scoped:
- monorepo alone → scoped undefined
- monorepo + framework → scoped.frameworks only
- monorepo + language → scoped.languageStats only

Document the new Component.scoped surface in README's Programmatic
API and Exported types sections.
"
```

---

## Task 8: Multi-agent OSS smoke battery

After all unit-level tasks land, dispatch 4 parallel agents per the spec's verification section. This step doesn't produce a commit — it gates the PR.

- [ ] **Step 1: Verify automated suite is clean**

```
bun run typecheck
bun run test:unit
bun run lint
```
Expected: all green.

- [ ] **Step 2: Run smoke agents**

The agents follow the table in `docs/superpowers/specs/2026-05-14-component-level-inventory-design.md`:

| Agent | Target | Verifies |
|---|---|---|
| 1 | `t3-oss/create-t3-turbo` | Per-app framework attribution (Next.js → apps/nextjs, Expo + React Native → apps/expo, etc.) |
| 2 | `BurntSushi/ripgrep` | 9 crates each have `scoped.languageStats` dominated by Rust |
| 3 | Synthetic polyglot | Cross-language attribution (Next.js → apps/web, Gin → apps/api) |
| 4 | Flask | Single-package regression: no components, no `scoped` data anywhere, top-level inventory unchanged from v2.0 |

Each agent reports CLEAN / MINOR / REGRESSION. Loop until every agent is CLEAN.

(Specific agent prompts are intentionally not pre-written here; the controller crafts them per the dispatching-parallel-agents skill at execution time, sized to current repo state.)

- [ ] **Step 3: If any agent reports issues, fix and re-run**

Treat findings the same way the previous smoke campaigns did (rounds 1/2/3 of PR #10, round of PR #11, round of PR #12, round of PR #13). Address P1/P2 issues, push fixes, dispatch the affected agent(s) again.

---

## Task 9: Push branch + open PR

- [ ] **Step 1: Final verification**

```
bun run typecheck
bun run test:unit
bun run lint
git log --oneline main..HEAD
```
Expected: all green; commits 1-7 in order.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/component-level-inventory
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --base main \
  --head feat/component-level-inventory \
  --title "feat: per-component frameworks + languageStats (Component.scoped)" \
  --body "$(cat <<'EOF'
## Summary

Each `architecture.components[]` entry now carries an optional `scoped: { frameworks?, languageStats? }` field that tells you _which_ component uses _which_ framework and _which_ languages dominate it. Top-level `inventory.frameworks` and `languageStats` remain the repo-wide aggregate (the union across all components) — unchanged, non-breaking.

Spec: \`docs/superpowers/specs/2026-05-14-component-level-inventory-design.md\`

## Schema (additive)

\`\`\`ts
export interface ComponentScope {
  readonly frameworks?: readonly string[];
  readonly languageStats?: LanguageStats;
}

export interface Component {
  // ...existing fields unchanged...
  readonly scoped?: ComponentScope;
}
\`\`\`

Presence contract: \`scoped\` itself present iff at least one of framework/language ran; sub-fields individually present iff their detector ran. Matches the \`PartialInventory\` pattern from PR #12.

## How attribution works

Detectors gained an optional \`Finding.filePath\`. Framework detector populates it at every emit site (manifest path or config file path). Aggregator does a Phase B pass: for each finding with a \`filePath\`, find the component whose path is the longest prefix of that file, attribute the value there. Same approach for language stats via new \`metadata.perFile\` from the language detector.

## CLI / table

Component rows in the table view now show their detected frameworks inline:

\`\`\`
Components
  app       web        apps/web              Next.js, Tailwind CSS
  app       expo       apps/expo             Expo, React Native
  package   ui         packages/ui           React
  package   tooling    tooling/eslint        (none)
\`\`\`

Up to 3 frameworks, then \`+N more\`. Renders \`(none)\` when empty.

## Verification

- 280+ unit tests pass (~12 new across aggregator/framework/language/table)
- \`bun run typecheck\`, \`bun run lint\` clean
- Multi-agent smoke battery against t3-turbo / ripgrep / synthetic polyglot / Flask — all CLEAN

## Test plan

- [ ] \`bun run test:unit\` passes
- [ ] \`bun run typecheck\` clean
- [ ] Manual: clone t3-turbo, run \`bun src/bin.ts --path .\` — each app row shows its frameworks inline
- [ ] Manual: \`--detectors monorepo\` returns components with \`scoped\` absent
- [ ] Manual: \`--detectors monorepo,framework\` returns \`scoped.frameworks\` but not \`languageStats\`
- [ ] Manual: top-level \`inventory.frameworks\` unchanged from v2.0.0 output (regression)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Address PR review comments (loop)**

Same pattern as prior PRs: read Codex comments, classify valid ones, fix, push, reply.

---

## Loop exit criteria for the whole plan

- All unit tests green (~280+ after this work).
- Typecheck clean.
- Lint clean.
- Smoke battery: 4 agents all CLEAN.
- PR comments addressed.
- Then: leave PR open for user to merge into main.
