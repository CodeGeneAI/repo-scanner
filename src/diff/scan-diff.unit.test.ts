import { afterEach, describe, expect, it } from "bun:test";
import path from "path";
import { fileURLToPath } from "url";
import { recordPerfTrend } from "../perf/trend-history";
import type { RepoScanResult } from "../types";
import {
  buildDiffScanResult,
  type ComponentHistoryConventionBaseline,
  resetDiffConventionOptions,
  setDiffConventionOptions,
} from "./scan-diff";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "convention-edge-cases.json",
);
const perfSnapshotPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../perf/perf-baselines.snapshot.json",
);

const baseResult: RepoScanResult = {
  inventory: {
    languages: ["TypeScript"],
    languageStats: [],
    totalFiles: 3,
    totalLinesOfCode: 120,
    frameworks: [],
    datastores: [],
    dependencyManagers: [],
    containerization: [],
    iac: [],
    testing: [],
    buildTools: [],
    linting: [],
    codeQuality: [],
    deploymentPlatforms: [],
    repoTools: [],
    envVars: [],
    runtimes: [],
    todoAnnotations: [
      {
        tag: "TODO",
        text: "refactor",
        file: "packages/a/src/service.ts",
        line: 7,
      },
    ],
    deadExports: [
      {
        symbol: "unused",
        file: "packages/a/src/service.ts",
        line: 11,
        language: "TypeScript",
        exportType: "function",
      },
    ],
    namingConventions: [
      {
        category: "file",
        dominantStyle: "camelCase",
        percentage: 90,
        sampleSize: 10,
      },
      {
        category: "directory",
        dominantStyle: "kebab-case",
        percentage: 88,
        sampleSize: 12,
      },
    ],
  },
  architecture: {
    monorepo: true,
    components: [
      {
        name: "a",
        path: "packages/a",
        kind: "package",
        description: "",
        confidence: 1,
        evidence: [],
        blastRadius: {
          directDependents: 2,
          transitiveDependents: 3,
          score: 80,
        },
      },
    ],
  },
  buildAndTest: {
    buildCommands: [],
    testCommands: [],
    lintCommands: [],
    ciSystems: [],
  },
  signals: {
    hasReadme: true,
    hasCi: false,
    hasContainerization: false,
    hasIaC: false,
    hasTests: true,
    hasTypedContracts: false,
    hasQualityGates: false,
    isPolyglot: false,
    hasDeploymentPlatform: false,
  },
  scanPath: "/tmp/repo",
  timestamp: "2026-01-01T00:00:00.000Z",
  durationMs: 12,
};

describe("buildDiffScanResult", () => {
  afterEach(() => {
    resetDiffConventionOptions();
  });

  it("builds impact report for changed files", () => {
    const diff = buildDiffScanResult(baseResult, [
      "packages/a/src/service.ts",
      "packages/a/src/service.unit.spec.ts",
    ]);

    expect(diff.changedFiles).toEqual([
      "packages/a/src/service.ts",
      "packages/a/src/service.unit.spec.ts",
    ]);
    expect(diff.affectedComponents).toEqual(["a"]);
    expect(diff.blastRadius.length).toBe(1);
    expect(diff.newTodos.length).toBe(1);
    expect(diff.newDeadExports.length).toBe(1);
    expect(diff.conventionViolations).toEqual([]);
  });

  it("flags file and directory convention deltas based on dominant naming patterns", () => {
    const diff = buildDiffScanResult(baseResult, [
      "packages/a/BadDir/feature_service.ts",
    ]);

    expect(diff.conventionViolations).toEqual([
      {
        file: "packages/a/BadDir/feature_service.ts",
        violation:
          'directory segment "BadDir" uses PascalCase instead of dominant kebab-case',
      },
      {
        file: "packages/a/BadDir/feature_service.ts",
        violation:
          "file naming style snake_case differs from dominant camelCase",
      },
    ]);
  });

  it("skips convention violations when naming baselines are unavailable", () => {
    const noConventionBaseline: RepoScanResult = {
      ...baseResult,
      inventory: {
        ...baseResult.inventory,
        namingConventions: [],
      },
    };
    const diff = buildDiffScanResult(noConventionBaseline, [
      "packages/a/BadDir/feature_service.ts",
    ]);

    expect(diff.conventionViolations).toEqual([]);
  });

  it("handles large changed-file sets within the performance budget", () => {
    const largeChangedFiles = Array.from({ length: 1_000 }, (_, index) => {
      return `packages/a/src/module-${String(index)}/service_${String(index)}.ts`;
    });

    const start = performance.now();
    const diff = buildDiffScanResult(baseResult, largeChangedFiles);
    const elapsedMs = performance.now() - start;
    const perfSnapshot = Bun.file(perfSnapshotPath).json() as Promise<{
      diffScanLargeSetMs: number;
      budgetMultiplier: number;
    }>;

    expect(diff.changedFiles.length).toBe(1_000);
    return perfSnapshot.then(async (snapshot) => {
      const budgetMs = snapshot.diffScanLargeSetMs * snapshot.budgetMultiplier;
      expect(elapsedMs).toBeLessThan(budgetMs);
      await recordPerfTrend({
        metric: "scan-diff-large-set",
        elapsedMs,
        budgetMs,
        timestamp: new Date().toISOString(),
        context: "unit-test",
      });
    });
  });

  it("covers fixture-based mixed-style edge cases", async () => {
    const fixture = (await Bun.file(fixturePath).json()) as {
      mixedStyles: {
        changedFiles: string[];
        expectedViolationContains: string[];
      };
    };

    const diff = buildDiffScanResult(
      baseResult,
      fixture.mixedStyles.changedFiles,
    );
    const violations = diff.conventionViolations.map((item) => item.violation);

    for (const expectedChunk of fixture.mixedStyles.expectedViolationContains) {
      expect(
        violations.some((item) => item.includes(expectedChunk)),
      ).toBeTrue();
    }
  });

  it("supports optional per-component naming baselines", async () => {
    const fixture = (await Bun.file(fixturePath).json()) as {
      componentBaselines: {
        changedFiles: string[];
        expected: Array<{ file: string; violationContains: string }>;
      };
    };

    const withComponentBaselines: RepoScanResult = {
      ...baseResult,
      architecture: {
        ...baseResult.architecture,
        components: [
          {
            ...baseResult.architecture.components[0]!,
            name: "web-ui",
            path: "packages/web-ui",
            metadata: {
              namingConventions: {
                file: {
                  dominantStyle: "snake_case",
                  percentage: 92,
                  sampleSize: 20,
                },
                directory: {
                  dominantStyle: "kebab-case",
                  percentage: 85,
                  sampleSize: 12,
                },
              },
            },
          },
          {
            ...baseResult.architecture.components[0]!,
            name: "api-service",
            path: "packages/api-service",
            metadata: {
              namingConventions: {
                file: {
                  dominantStyle: "camelCase",
                  percentage: 90,
                  sampleSize: 15,
                },
                directory: {
                  dominantStyle: "kebab-case",
                  percentage: 80,
                  sampleSize: 10,
                },
              },
            },
          },
        ],
      },
    };

    setDiffConventionOptions({ usePerComponentBaselines: true });
    const diff = buildDiffScanResult(
      withComponentBaselines,
      fixture.componentBaselines.changedFiles,
    );

    for (const expected of fixture.componentBaselines.expected) {
      const forFile = diff.conventionViolations.filter(
        (entry) => entry.file === expected.file,
      );
      expect(
        forFile.some((entry) =>
          entry.violation.includes(expected.violationContains),
        ),
      ).toBeTrue();
    }
  });

  it("supports convention strictness configuration", () => {
    setDiffConventionOptions({
      ignoredPathSegments: ["packages", "a", "src"],
      softMatchStyles: { camelCase: ["snake_case"] },
    });

    const diff = buildDiffScanResult(baseResult, [
      "packages/a/src/snake_case_file.ts",
    ]);

    expect(diff.conventionViolations).toEqual([]);
  });

  it("applies language-specific history baselines when provided", () => {
    const historyBaselines: Record<string, ComponentHistoryConventionBaseline> =
      {
        "packages/a": {
          componentPath: "packages/a",
          fileStyleByLanguage: {
            python: "snake_case",
          },
          directoryStyleByLanguage: {
            python: "kebab-case",
          },
          sampleSizeByLanguage: {
            python: 40,
          },
        },
      };

    const diff = buildDiffScanResult(
      baseResult,
      ["packages/a/src/feature_service.py"],
      { historyBaselines },
    );

    expect(diff.conventionViolations).toEqual([]);
  });
});
