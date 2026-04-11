import { describe, expect, it } from "bun:test";
import type { DetectorResult } from "../detectors/types";
import { aggregate } from "./aggregator";

describe("aggregate", async () => {
  const scanPath = "/tmp/test-repo";
  const durationMs = 42;

  it("merges findings from multiple detectors into correct categories", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [
          { value: "TypeScript", confidence: 1.0, evidence: ["10 files"] },
          { value: "Python", confidence: 0.8, evidence: ["3 files"] },
        ],
      },
      {
        detectorId: "framework",
        findings: [
          { value: "React", confidence: 1.0, evidence: ["react dep"] },
        ],
      },
      {
        detectorId: "ci",
        findings: [
          {
            value: "GitHub Actions",
            confidence: 1.0,
            evidence: [".github/workflows"],
          },
        ],
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);

    expect(result.inventory.languages).toContain("TypeScript");
    expect(result.inventory.languages).toContain("Python");
    expect(result.inventory.frameworks).toContain("React");
    expect(result.buildAndTest.ciSystems).toContain("GitHub Actions");
  });

  it("deduplicates values within a category", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [
          { value: "TypeScript", confidence: 1.0, evidence: ["ext"] },
          { value: "TypeScript", confidence: 0.8, evidence: ["manifest"] },
        ],
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);

    // Set-based dedup means TypeScript appears once
    expect(
      result.inventory.languages.filter((l) => l === "TypeScript"),
    ).toHaveLength(1);
  });

  it("sets signals correctly from detector signals", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "ci",
        findings: [
          {
            value: "GitHub Actions",
            confidence: 1.0,
            evidence: ["workflows"],
          },
        ],
        signals: { hasCi: true },
      },
      {
        detectorId: "repo-tools",
        findings: [],
        signals: { hasReadme: true },
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);

    expect(result.signals.hasCi).toBe(true);
    expect(result.signals.hasReadme).toBe(true);
    expect(result.signals.hasContainerization).toBe(false);
    expect(result.signals.hasIaC).toBe(false);
  });

  it("derives hasCi from ci detector findings", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "ci",
        findings: [
          { value: "GitLab CI", confidence: 1.0, evidence: ["found"] },
        ],
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);
    expect(result.signals.hasCi).toBe(true);
  });

  it("derives hasContainerization from containerization signals", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "containerization",
        findings: [
          { value: "Docker", confidence: 1.0, evidence: ["Dockerfile"] },
        ],
        signals: { hasContainerization: true },
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);
    expect(result.signals.hasContainerization).toBe(true);
  });

  it("derives hasDeploymentPlatform from deployment-platform signals", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "deployment-platform",
        findings: [
          { value: "Vercel", confidence: 1.0, evidence: ["vercel.json"] },
        ],
        signals: { hasDeploymentPlatform: true },
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);
    expect(result.signals.hasDeploymentPlatform).toBe(true);
    expect(result.inventory.deploymentPlatforms).toContain("Vercel");
  });

  it("merges commands from multiple detectors", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "build",
        findings: [],
        commands: {
          build: ["npm run build"],
          test: ["npm test"],
        },
      },
      {
        detectorId: "testing",
        findings: [],
        commands: {
          test: ["bun test"],
        },
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);

    expect(result.buildAndTest.buildCommands).toContain("npm run build");
    expect(result.buildAndTest.testCommands).toContain("npm test");
    expect(result.buildAndTest.testCommands).toContain("bun test");
  });

  it("sets monorepo flag from monorepo detector findings", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "monorepo",
        findings: [
          { value: "Turborepo", confidence: 1.0, evidence: ["turbo.json"] },
          { value: "monorepo", confidence: 1.0, evidence: ["detected"] },
        ],
        componentHints: [
          { path: "packages/foo", name: "foo" },
          { path: "packages/bar", name: "bar" },
        ],
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);

    expect(result.architecture.monorepo).toBe(true);
    expect(result.architecture.components).toHaveLength(2);
    const names = result.architecture.components.map((c) => c.name);
    expect(names).toContain("foo");
    expect(names).toContain("bar");
  });

  it("sets monorepo false when no monorepo findings", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "monorepo",
        findings: [],
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);
    expect(result.architecture.monorepo).toBe(false);
  });

  it("includes scanPath and durationMs in result", async () => {
    const result = await aggregate(scanPath, durationMs, []);

    expect(result.scanPath).toBe(scanPath);
    expect(result.durationMs).toBe(durationMs);
    expect(result.timestamp).toBeDefined();
  });

  it("returns sorted arrays", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [
          { value: "Python", confidence: 0.8, evidence: [] },
          { value: "Go", confidence: 0.8, evidence: [] },
          { value: "TypeScript", confidence: 1.0, evidence: [] },
        ],
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);

    expect(result.inventory.languages).toEqual(["Go", "Python", "TypeScript"]);
  });

  it("forwards languageStats and totals from language detector metadata", async () => {
    const stats = [
      { name: "TypeScript", fileCount: 10, linesOfCode: 500, percentage: 71.4 },
      { name: "Python", fileCount: 4, linesOfCode: 200, percentage: 28.6 },
    ];
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [
          { value: "TypeScript", confidence: 1.0, evidence: [] },
          { value: "Python", confidence: 0.8, evidence: [] },
        ],
        metadata: {
          languageStats: stats,
          totalFiles: 14,
          totalLinesOfCode: 700,
        },
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);

    expect(result.inventory.languageStats).toEqual(stats);
    expect(result.inventory.totalFiles).toBe(14);
    expect(result.inventory.totalLinesOfCode).toBe(700);
  });

  it("returns empty languageStats and zero totals when metadata is absent", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [{ value: "TypeScript", confidence: 1.0, evidence: [] }],
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);

    expect(result.inventory.languageStats).toEqual([]);
    expect(result.inventory.totalFiles).toBe(0);
    expect(result.inventory.totalLinesOfCode).toBe(0);
  });

  it("returns zero totals when no language detector present", async () => {
    const result = await aggregate(scanPath, durationMs, []);

    expect(result.inventory.languageStats).toEqual([]);
    expect(result.inventory.totalFiles).toBe(0);
    expect(result.inventory.totalLinesOfCode).toBe(0);
  });

  it("uses OR semantics for signals across detectors", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [],
        signals: { hasTests: false },
      },
      {
        detectorId: "testing",
        findings: [
          { value: "Bun Test", confidence: 1.0, evidence: ["bunfig.toml"] },
        ],
        signals: { hasTests: true },
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);
    expect(result.signals.hasTests).toBe(true);
  });
});
