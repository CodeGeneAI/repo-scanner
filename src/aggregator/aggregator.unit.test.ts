import { describe, expect, it } from "bun:test";
import type { DetectorResult } from "../detectors/types";
import { aggregate } from "./aggregator";

describe("aggregate", async () => {
  const scanPath = "/tmp/test-repo";
  const durationMs = 42;

  it("merges findings from language and framework detectors into correct categories", async () => {
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
    ];

    const result = await aggregate(scanPath, durationMs, results);

    expect(result.inventory.languages).toContain("TypeScript");
    expect(result.inventory.languages).toContain("Python");
    expect(result.inventory.frameworks).toContain("React");
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

  it("filters low-confidence language findings", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [
          { value: "TypeScript", confidence: 1.0, evidence: ["10 files"] },
          { value: "Lua", confidence: 0.5, evidence: ["1 file"] },
        ],
      },
    ];

    const result = await aggregate(scanPath, durationMs, results);

    expect(result.inventory.languages).toContain("TypeScript");
    expect(result.inventory.languages).not.toContain("Lua");
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
});
