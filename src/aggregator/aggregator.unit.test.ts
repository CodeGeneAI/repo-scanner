import { describe, expect, it } from "bun:test";
import type { DetectorResult } from "../detectors/types";
import { aggregate } from "./aggregator";

describe("aggregate", async () => {
  const rootPath = "/tmp/test-repo";

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

    const result = await aggregate(rootPath, results);

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

    const result = await aggregate(rootPath, results);

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

    const result = await aggregate(rootPath, results);

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

    const result = await aggregate(rootPath, results);

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

    const result = await aggregate(rootPath, results);
    expect(result.architecture.monorepo).toBe(false);
  });

  it("includes rootPath and scannedAt in result", async () => {
    const result = await aggregate(rootPath, []);

    expect(result.rootPath).toBe(rootPath);
    expect(result.scannedAt).toBeDefined();
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

    const result = await aggregate(rootPath, results);

    expect(result.inventory.languages).toEqual(["Go", "Python", "TypeScript"]);
  });

  it("forwards perLanguage and totals from language detector metadata", async () => {
    const perLanguage = [
      { language: "TypeScript", files: 10, lines: 500, percentage: 71.4 },
      { language: "Python", files: 4, lines: 200, percentage: 28.6 },
    ];
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [
          { value: "TypeScript", confidence: 1.0, evidence: [] },
          { value: "Python", confidence: 0.8, evidence: [] },
        ],
        metadata: {
          perLanguage,
          totalFiles: 14,
          totalLines: 700,
        },
      },
    ];

    const result = await aggregate(rootPath, results);

    expect(result.languageStats.perLanguage).toEqual(perLanguage);
    expect(result.languageStats.totalFiles).toBe(14);
    expect(result.languageStats.totalLines).toBe(700);
  });

  it("returns empty perLanguage and zero totals when metadata is absent", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [{ value: "TypeScript", confidence: 1.0, evidence: [] }],
      },
    ];

    const result = await aggregate(rootPath, results);

    expect(result.languageStats.perLanguage).toEqual([]);
    expect(result.languageStats.totalFiles).toBe(0);
    expect(result.languageStats.totalLines).toBe(0);
  });

  it("returns zero totals when no language detector present", async () => {
    const result = await aggregate(rootPath, []);

    expect(result.languageStats.perLanguage).toEqual([]);
    expect(result.languageStats.totalFiles).toBe(0);
    expect(result.languageStats.totalLines).toBe(0);
  });
});
