import { describe, expect, it } from "bun:test";
import type { DetectorId } from "../detectors/catalog";
import type { DetectorResult } from "../detectors/types";
import { aggregate } from "./aggregator";

const detectorSet = (...ids: DetectorId[]): ReadonlySet<DetectorId> =>
  new Set<DetectorId>(ids);

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

  it("inventory.packageManagers is an empty array by default", async () => {
    const result = await aggregate(rootPath, []);
    expect(result.inventory.packageManagers).toEqual([]);
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
          {
            value: "Turborepo",
            confidence: 1.0,
            evidence: ["found turbo.json"],
          },
          {
            value: "pnpm workspaces",
            confidence: 1.0,
            evidence: ["found pnpm-workspace.yaml"],
          },
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

describe("aggregate: schema slicing under detector filter", () => {
  const rootPath = "/tmp/test-repo";

  const fullDetectorResults: DetectorResult[] = [
    {
      detectorId: "language",
      findings: [{ value: "TypeScript", confidence: 1.0, evidence: [] }],
      metadata: {
        totalFiles: 1,
        totalLines: 10,
        perLanguage: [
          { language: "TypeScript", files: 1, lines: 10, percentage: 100 },
        ],
      },
    },
    {
      detectorId: "framework",
      findings: [{ value: "Next.js", confidence: 1.0, evidence: [] }],
    },
    {
      detectorId: "monorepo",
      findings: [
        { value: "Turborepo", confidence: 1.0, evidence: [] },
        { value: "monorepo", confidence: 1.0, evidence: [] },
      ],
      componentHints: [],
    },
    {
      detectorId: "packageManager",
      findings: [{ value: "pnpm", confidence: 1.0, evidence: [] }],
    },
  ];

  it("no filter → full canonical shape (unchanged behavior)", async () => {
    const r = await aggregate(rootPath, fullDetectorResults);
    expect(Object.keys(r).sort()).toEqual([
      "architecture",
      "inventory",
      "languageStats",
      "rootPath",
      "scannedAt",
    ]);
    expect(r.inventory).toEqual({
      languages: ["TypeScript"],
      frameworks: ["Next.js"],
      packageManagers: ["pnpm"],
    });
  });

  it("filter=[monorepo] → only architecture + metadata", async () => {
    const r = await aggregate(
      rootPath,
      fullDetectorResults.filter((d) => d.detectorId === "monorepo"),
      undefined,
      {
        selectedDetectors: detectorSet("monorepo"),
      },
    );
    expect(Object.keys(r).sort()).toEqual([
      "architecture",
      "rootPath",
      "scannedAt",
    ]);
    expect((r as any).inventory).toBeUndefined();
    expect((r as any).languageStats).toBeUndefined();
    expect(r.architecture).toBeDefined();
  });

  it("filter=[language] → inventory.languages + languageStats + metadata", async () => {
    const r = await aggregate(
      rootPath,
      fullDetectorResults.filter((d) => d.detectorId === "language"),
      undefined,
      {
        selectedDetectors: detectorSet("language"),
      },
    );
    expect(Object.keys(r).sort()).toEqual([
      "inventory",
      "languageStats",
      "rootPath",
      "scannedAt",
    ]);
    expect(r.inventory).toEqual({ languages: ["TypeScript"] });
    expect(Object.keys(r.inventory!)).toEqual(["languages"]);
    expect((r as any).architecture).toBeUndefined();
  });

  it("filter=[framework] → inventory.frameworks only (no languageStats)", async () => {
    const r = await aggregate(
      rootPath,
      fullDetectorResults.filter((d) => d.detectorId === "framework"),
      undefined,
      {
        selectedDetectors: detectorSet("framework"),
      },
    );
    expect(Object.keys(r).sort()).toEqual([
      "inventory",
      "rootPath",
      "scannedAt",
    ]);
    expect(r.inventory).toEqual({ frameworks: ["Next.js"] });
  });

  it("filter=[packageManager] → inventory.packageManagers only", async () => {
    const r = await aggregate(
      rootPath,
      fullDetectorResults.filter((d) => d.detectorId === "packageManager"),
      undefined,
      {
        selectedDetectors: detectorSet("packageManager"),
      },
    );
    expect(Object.keys(r).sort()).toEqual([
      "inventory",
      "rootPath",
      "scannedAt",
    ]);
    expect(r.inventory).toEqual({ packageManagers: ["pnpm"] });
  });

  it("filter=[language,framework] → both inventory sub-keys + languageStats", async () => {
    const r = await aggregate(
      rootPath,
      fullDetectorResults.filter(
        (d) => d.detectorId === "language" || d.detectorId === "framework",
      ),
      undefined,
      { selectedDetectors: detectorSet("language", "framework") },
    );
    expect(Object.keys(r).sort()).toEqual([
      "inventory",
      "languageStats",
      "rootPath",
      "scannedAt",
    ]);
    expect(Object.keys(r.inventory!).sort()).toEqual([
      "frameworks",
      "languages",
    ]);
  });

  it("filter=[framework,monorepo] → inventory.frameworks + architecture, no languageStats", async () => {
    const r = await aggregate(
      rootPath,
      fullDetectorResults.filter(
        (d) => d.detectorId === "framework" || d.detectorId === "monorepo",
      ),
      undefined,
      { selectedDetectors: detectorSet("framework", "monorepo") },
    );
    expect(Object.keys(r).sort()).toEqual([
      "architecture",
      "inventory",
      "rootPath",
      "scannedAt",
    ]);
    expect(Object.keys(r.inventory!)).toEqual(["frameworks"]);
  });

  it("empty filter set → metadata only", async () => {
    const r = await aggregate(rootPath, [], undefined, {
      selectedDetectors: new Set<DetectorId>(),
    });
    expect(Object.keys(r).sort()).toEqual(["rootPath", "scannedAt"]);
    expect((r as any).inventory).toBeUndefined();
    expect((r as any).architecture).toBeUndefined();
    expect((r as any).languageStats).toBeUndefined();
  });

  it("filter with all four detectors → identical to unfiltered shape", async () => {
    const r = await aggregate(rootPath, fullDetectorResults, undefined, {
      selectedDetectors: detectorSet(
        "language",
        "framework",
        "monorepo",
        "packageManager",
      ),
    });
    expect(Object.keys(r).sort()).toEqual([
      "architecture",
      "inventory",
      "languageStats",
      "rootPath",
      "scannedAt",
    ]);
    expect(Object.keys(r.inventory!).sort()).toEqual([
      "frameworks",
      "languages",
      "packageManagers",
    ]);
  });
});

describe("aggregate: per-component languageStats", () => {
  const rootPath = "/tmp/test-repo";

  it("groups per-file language data into each component's scoped.languageStats", async () => {
    const perFile = [
      { relativePath: "apps/web/index.ts", language: "TypeScript", lines: 100 },
      { relativePath: "apps/web/util.ts", language: "TypeScript", lines: 50 },
      {
        relativePath: "packages/ui/index.tsx",
        language: "TypeScript",
        lines: 30,
      },
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
    const web = result.architecture.components.find(
      (c) => c.path === "apps/web",
    );
    const ui = result.architecture.components.find(
      (c) => c.path === "packages/ui",
    );
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
          perLanguage: [
            { language: "TypeScript", files: 1, lines: 10, percentage: 100 },
          ],
          totalFiles: 1,
          totalLines: 10,
          perFile: [
            {
              relativePath: "apps/web/index.ts",
              language: "TypeScript",
              lines: 10,
            },
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
    const empty = result.architecture.components.find(
      (c) => c.path === "tooling/empty",
    );
    expect(empty?.scoped?.languageStats).toEqual({
      totalFiles: 0,
      totalLines: 0,
      perLanguage: [],
    });
  });
});

describe("aggregate: scoped under detector filter", () => {
  const rootPath = "/tmp/test-repo";

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
        perLanguage: [
          { language: "TypeScript", files: 1, lines: 10, percentage: 100 },
        ],
        totalFiles: 1,
        totalLines: 10,
        perFile: [
          {
            relativePath: "apps/web/index.ts",
            language: "TypeScript",
            lines: 10,
          },
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
    const all = setup();
    const r = await aggregate(rootPath, [all[2]!], undefined, {
      selectedDetectors: detectorSet("monorepo"),
    });
    const web = r.architecture?.components.find((c) => c.path === "apps/web");
    expect(web?.scoped).toBeUndefined();
  });

  it("--detectors monorepo,framework: scoped.frameworks set, languageStats absent", async () => {
    const all = setup();
    const r = await aggregate(rootPath, [all[0]!, all[2]!], undefined, {
      selectedDetectors: detectorSet("monorepo", "framework"),
    });
    const web = r.architecture?.components.find((c) => c.path === "apps/web");
    expect(web?.scoped?.frameworks).toEqual(["Next.js"]);
    expect(web?.scoped?.languageStats).toBeUndefined();
  });

  it("--detectors monorepo,language: scoped.languageStats set, frameworks absent", async () => {
    const all = setup();
    const r = await aggregate(rootPath, [all[1]!, all[2]!], undefined, {
      selectedDetectors: detectorSet("monorepo", "language"),
    });
    const web = r.architecture?.components.find((c) => c.path === "apps/web");
    expect(web?.scoped?.frameworks).toBeUndefined();
    expect(web?.scoped?.languageStats?.totalFiles).toBe(1);
  });
});

describe("aggregate: per-component framework attribution", () => {
  const rootPath = "/tmp/test-repo";

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
    const web = result.architecture.components.find(
      (c) => c.path === "apps/web",
    );
    const ui = result.architecture.components.find(
      (c) => c.path === "packages/ui",
    );
    expect(web?.scoped?.frameworks?.slice().sort()).toEqual([
      "Next.js",
      "Tailwind CSS",
    ]);
    expect(ui?.scoped?.frameworks).toEqual(["React"]);
  });

  it("findings without filePath stay in top-level inventory only", async () => {
    const results: DetectorResult[] = [
      {
        detectorId: "framework",
        findings: [
          { value: "Detected Somewhere", confidence: 1, evidence: [] },
        ],
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
    const web = result.architecture.components.find(
      (c) => c.path === "apps/web",
    );
    expect(result.inventory.frameworks).toContain("Detected Somewhere");
    expect(web?.scoped?.frameworks).toEqual([]);
  });
});
