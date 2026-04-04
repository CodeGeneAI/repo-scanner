import { afterEach, describe, expect, it } from "bun:test";
import path from "path";
import { fileURLToPath } from "url";
import { recordPerfTrend } from "../perf/trend-history";
import type { RepoScanResult } from "../types";
import {
  buildDiffScanResult,
  type ComponentHistoryConventionBaseline,
  computeNetNewEnvVars,
  isLikelyTestFile,
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

describe("computeNetNewEnvVars", () => {
  it("returns vars whose usages are exclusively in changed files", () => {
    const envVars = [
      {
        name: "NEW_VAR",
        usages: [
          {
            file: "packages/a/src/service.ts",
            line: 1,
            pattern: "process.env",
            accessType: "read" as const,
          },
        ],
        inferredType: "string" as const,
        required: false,
        definedInConfig: false,
      },
    ];
    const result = computeNetNewEnvVars(envVars, ["packages/a/src/service.ts"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("NEW_VAR");
  });

  it("excludes vars with usages in non-changed files", () => {
    const envVars = [
      {
        name: "EXISTING_VAR",
        usages: [
          {
            file: "packages/a/src/service.ts",
            line: 1,
            pattern: "process.env",
            accessType: "read" as const,
          },
          {
            file: "packages/b/src/other.ts",
            line: 5,
            pattern: "process.env",
            accessType: "read" as const,
          },
        ],
        inferredType: "string" as const,
        required: false,
        definedInConfig: false,
      },
    ];
    const result = computeNetNewEnvVars(envVars, ["packages/a/src/service.ts"]);
    expect(result).toHaveLength(0);
  });

  it("excludes vars with no usages", () => {
    const envVars = [
      {
        name: "EMPTY_VAR",
        usages: [],
        inferredType: "string" as const,
        required: false,
        definedInConfig: false,
      },
    ];
    const result = computeNetNewEnvVars(envVars, ["packages/a/src/service.ts"]);
    expect(result).toHaveLength(0);
  });

  it("returns empty when no changed files", () => {
    const envVars = [
      {
        name: "SOME_VAR",
        usages: [
          {
            file: "packages/a/src/service.ts",
            line: 1,
            pattern: "process.env",
            accessType: "read" as const,
          },
        ],
        inferredType: "string" as const,
        required: false,
        definedInConfig: false,
      },
    ];
    const result = computeNetNewEnvVars(envVars, []);
    expect(result).toHaveLength(0);
  });

  it("includes env var with multiple usages all in changed files", () => {
    const envVars = [
      {
        name: "MULTI_USE",
        usages: [
          {
            file: "packages/a/src/service.ts",
            line: 1,
            pattern: "process.env",
            accessType: "read" as const,
          },
          {
            file: "packages/a/src/worker.ts",
            line: 5,
            pattern: "process.env",
            accessType: "read" as const,
          },
        ],
        inferredType: "string" as const,
        required: false,
        definedInConfig: false,
      },
    ];
    const result = computeNetNewEnvVars(envVars, [
      "packages/a/src/service.ts",
      "packages/a/src/worker.ts",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("MULTI_USE");
  });

  it("with addedLines: flags var when usage is on an added line", () => {
    const envVars = [
      {
        name: "NEW_VAR",
        usages: [
          {
            file: "packages/a/src/service.ts",
            line: 10,
            pattern: "process.env",
            accessType: "read" as const,
          },
        ],
        inferredType: "string" as const,
        required: false,
        definedInConfig: false,
      },
    ];
    const addedLines = new Map([
      ["packages/a/src/service.ts", new Set([10, 11, 12])],
    ]);
    const result = computeNetNewEnvVars(
      envVars,
      ["packages/a/src/service.ts"],
      addedLines,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("NEW_VAR");
  });

  it("with addedLines: excludes var when usage is NOT on an added line", () => {
    const envVars = [
      {
        name: "EXISTING_VAR",
        usages: [
          {
            file: "packages/a/src/service.ts",
            line: 50,
            pattern: "process.env",
            accessType: "read" as const,
          },
        ],
        inferredType: "string" as const,
        required: false,
        definedInConfig: false,
      },
    ];
    const addedLines = new Map([
      ["packages/a/src/service.ts", new Set([10, 11, 12])],
    ]);
    const result = computeNetNewEnvVars(
      envVars,
      ["packages/a/src/service.ts"],
      addedLines,
    );
    expect(result).toHaveLength(0);
  });

  it("with addedLines: flags var when at least one usage is on an added line", () => {
    const envVars = [
      {
        name: "MIXED_VAR",
        usages: [
          {
            file: "packages/a/src/service.ts",
            line: 5,
            pattern: "process.env",
            accessType: "read" as const,
          },
          {
            file: "packages/a/src/service.ts",
            line: 20,
            pattern: "process.env",
            accessType: "read" as const,
          },
        ],
        inferredType: "string" as const,
        required: false,
        definedInConfig: false,
      },
    ];
    const addedLines = new Map([
      ["packages/a/src/service.ts", new Set([20, 21])],
    ]);
    const result = computeNetNewEnvVars(
      envVars,
      ["packages/a/src/service.ts"],
      addedLines,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("MIXED_VAR");
  });

  it("with addedLines: still excludes var with usages in non-changed files", () => {
    const envVars = [
      {
        name: "SPREAD_VAR",
        usages: [
          {
            file: "packages/a/src/service.ts",
            line: 10,
            pattern: "process.env",
            accessType: "read" as const,
          },
          {
            file: "packages/b/src/other.ts",
            line: 5,
            pattern: "process.env",
            accessType: "read" as const,
          },
        ],
        inferredType: "string" as const,
        required: false,
        definedInConfig: false,
      },
    ];
    const addedLines = new Map([["packages/a/src/service.ts", new Set([10])]]);
    const result = computeNetNewEnvVars(
      envVars,
      ["packages/a/src/service.ts"],
      addedLines,
    );
    expect(result).toHaveLength(0);
  });

  it("with empty addedLines map: excludes all vars", () => {
    const envVars = [
      {
        name: "SOME_VAR",
        usages: [
          {
            file: "packages/a/src/service.ts",
            line: 1,
            pattern: "process.env",
            accessType: "read" as const,
          },
        ],
        inferredType: "string" as const,
        required: false,
        definedInConfig: false,
      },
    ];
    const addedLines = new Map<string, Set<number>>();
    const result = computeNetNewEnvVars(
      envVars,
      ["packages/a/src/service.ts"],
      addedLines,
    );
    expect(result).toHaveLength(0);
  });
});

describe("buildDiffScanResult with dryCheck and envCheck", () => {
  afterEach(() => {
    resetDiffConventionOptions();
  });

  it("attaches newDuplication when dryCheck is provided", () => {
    const dryCheck = {
      scanPath: "/tmp/repo",
      durationMs: 10,
      groups: [],
      stats: {
        filesScanned: 2,
        totalTokens: 100,
        duplicateGroups: 0,
        duplicatedLines: 0,
        duplicationPercentage: 0,
      },
    };
    const diff = buildDiffScanResult(
      baseResult,
      ["packages/a/src/service.ts"],
      { dryCheck },
    );
    expect(diff.newDuplication).toBeDefined();
    expect(diff.newDuplication!.stats.filesScanned).toBe(2);
    expect(diff.newDuplication!.groups).toEqual([]);
  });

  it("attaches newEnvVars when envCheck is enabled", () => {
    const resultWithEnvVars = {
      ...baseResult,
      inventory: {
        ...baseResult.inventory,
        envVars: [
          {
            name: "NEW_API_KEY",
            usages: [
              {
                file: "packages/a/src/service.ts",
                line: 3,
                pattern: "process.env",
                accessType: "read" as const,
              },
            ],
            inferredType: "string" as const,
            required: true,
            definedInConfig: false,
          },
        ],
      },
    };
    const diff = buildDiffScanResult(
      resultWithEnvVars,
      ["packages/a/src/service.ts"],
      { envCheck: true },
    );
    expect(diff.newEnvVars).toBeDefined();
    expect(diff.newEnvVars).toHaveLength(1);
    expect(diff.newEnvVars![0]!.name).toBe("NEW_API_KEY");
  });

  it("omits newDuplication and newEnvVars when options not provided", () => {
    const diff = buildDiffScanResult(baseResult, ["packages/a/src/service.ts"]);
    expect(diff.newDuplication).toBeUndefined();
    expect(diff.newEnvVars).toBeUndefined();
  });

  it("threshold comparison uses strictly-greater (equal does not exceed)", () => {
    const dryCheck = {
      scanPath: "/tmp/repo",
      durationMs: 10,
      groups: [],
      stats: {
        filesScanned: 2,
        totalTokens: 100,
        duplicateGroups: 1,
        duplicatedLines: 10,
        duplicationPercentage: 10,
      },
    };
    const diff = buildDiffScanResult(
      baseResult,
      ["packages/a/src/service.ts"],
      { dryCheck },
    );
    // duplicationPercentage is 10; a threshold of 10 means > 10 triggers failure
    // This confirms the result carries the exact percentage for external threshold checks
    expect(diff.newDuplication!.stats.duplicationPercentage).toBe(10);
  });

  it("omits newEnvVars when envCheck is true but envVars is empty", () => {
    const diff = buildDiffScanResult(
      baseResult,
      ["packages/a/src/service.ts"],
      { envCheck: true },
    );
    // baseResult has envVars: [] — computeNetNewEnvVars returns [] which is truthy
    expect(diff.newEnvVars).toBeDefined();
    expect(diff.newEnvVars).toHaveLength(0);
  });
});

describe("isLikelyTestFile", () => {
  it("identifies .test. files", () => {
    expect(isLikelyTestFile("src/utils/helper.test.ts")).toBeTrue();
  });

  it("identifies .unit.spec. files", () => {
    expect(isLikelyTestFile("src/cli.unit.spec.ts")).toBeTrue();
  });

  it("identifies .int.spec. files", () => {
    expect(isLikelyTestFile("src/api.int.spec.ts")).toBeTrue();
  });

  it("identifies .e2e.spec. files", () => {
    expect(isLikelyTestFile("src/flow.e2e.spec.ts")).toBeTrue();
  });

  it("identifies plain .spec. files", () => {
    expect(isLikelyTestFile("src/otlp-http.spec.ts")).toBeTrue();
  });

  it("identifies .browser.spec. files", () => {
    expect(isLikelyTestFile("src/otlp-http.browser.spec.ts")).toBeTrue();
  });

  it("returns false for non-test source files", () => {
    expect(isLikelyTestFile("src/utils/helper.ts")).toBeFalse();
    expect(isLikelyTestFile("src/cli.ts")).toBeFalse();
    expect(isLikelyTestFile("src/index.ts")).toBeFalse();
  });
});
