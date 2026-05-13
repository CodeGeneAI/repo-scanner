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
        metadata: {
          totalFiles: 13,
          totalLines: 650,
          perLanguage: [
            { language: "TypeScript", files: 10, lines: 500, percentage: 76.9 },
            { language: "Python", files: 3, lines: 150, percentage: 23.1 },
          ],
        },
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
        metadata: {
          totalFiles: 10,
          totalLines: 500,
          perLanguage: [
            { language: "TypeScript", files: 10, lines: 500, percentage: 100 },
          ],
        },
      },
    ];

    const result = await aggregate(rootPath, results);

    // Set-based dedup means TypeScript appears once
    expect(
      result.inventory.languages.filter((l) => l === "TypeScript"),
    ).toHaveLength(1);
  });

  it("only surfaces languages present in languageStats.perLanguage", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [
          { value: "TypeScript", confidence: 1.0, evidence: ["10 files"] },
          { value: "Lua", confidence: 0.5, evidence: ["1 file"] },
        ],
        metadata: {
          totalFiles: 10,
          totalLines: 500,
          perLanguage: [
            { language: "TypeScript", files: 10, lines: 500, percentage: 100 },
          ],
        },
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
        metadata: {
          totalFiles: 15,
          totalLines: 750,
          perLanguage: [
            { language: "Python", files: 5, lines: 250, percentage: 33.3 },
            { language: "Go", files: 5, lines: 250, percentage: 33.3 },
            { language: "TypeScript", files: 5, lines: 250, percentage: 33.3 },
          ],
        },
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

  it("inventory.languages mirrors languageStats.perLanguage", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "language",
        findings: [
          { value: "Rust", confidence: 1.0, evidence: [] },
          { value: "Ruby", confidence: 0.05, evidence: [] },
        ],
        metadata: {
          totalFiles: 101,
          totalLines: 10000,
          perLanguage: [
            { language: "Rust", files: 100, lines: 9900, percentage: 99 },
            { language: "Ruby", files: 1, lines: 100, percentage: 1 },
          ],
        },
      },
    ];
    const result = await aggregate(rootPath, results);
    expect(result.inventory.languages.slice().sort()).toEqual(["Ruby", "Rust"]);
    expect(
      result.languageStats.perLanguage.map((e) => e.language).sort(),
    ).toEqual(result.inventory.languages.slice().sort());
  });

  it("architecture.toolName is set from the first named monorepo finding", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "monorepo",
        findings: [
          { value: "Turborepo", confidence: 1.0, evidence: ["found turbo.json"] },
          { value: "pnpm workspaces", confidence: 1.0, evidence: ["found pnpm-workspace.yaml"] },
          { value: "monorepo", confidence: 1.0, evidence: ["detected"] },
        ],
        componentHints: [],
      },
    ];
    const result = await aggregate(rootPath, results);
    expect(result.architecture.monorepo).toBe(true);
    expect(result.architecture.toolName).toBe("Turborepo");
  });
});
