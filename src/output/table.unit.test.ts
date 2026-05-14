import { describe, expect, test } from "bun:test";
import { Writable } from "stream";
import type { PartialRepoScanResult, RepoScanResult } from "../types";
import { renderTable } from "./table";

const capture = (result: RepoScanResult): string => {
  let out = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  renderTable(result, stream as NodeJS.WritableStream);
  return out;
};

const baseResult = (over: Partial<RepoScanResult> = {}): RepoScanResult => ({
  scannedAt: "2026-05-13T00:00:00Z",
  rootPath: "/x",
  inventory: {
    languages: [],
    frameworks: [],
    packageManagers: [],
    ciProviders: [],
    buildSystems: [],
    containerization: [],
  },
  architecture: { monorepo: false, components: [] },
  languageStats: { totalFiles: 0, totalLines: 0, perLanguage: [] },
  ...over,
});

describe("renderTable monorepo line", () => {
  test("prints yes when architecture.monorepo is true", () => {
    const out = capture(
      baseResult({ architecture: { monorepo: true, components: [] } }),
    );
    expect(out).toMatch(/Monorepo[\s\S]*yes/);
  });

  test("prints no when false", () => {
    const out = capture(baseResult());
    expect(out).toMatch(/Monorepo[\s\S]*no/);
  });

  test("appends toolName when set", () => {
    const out = capture(
      baseResult({
        architecture: { monorepo: true, toolName: "Turborepo", components: [] },
      }),
    );
    expect(out).toMatch(/Monorepo[\s\S]*yes[\s\S]*Turborepo/);
  });
});

test("renders Package managers section with detected entries", () => {
  const out = capture(
    baseResult({
      inventory: {
        languages: [],
        frameworks: [],
        packageManagers: ["Bun", "pnpm"],
        ciProviders: [],
        buildSystems: [],
        containerization: [],
      },
    }),
  );
  expect(out).toMatch(/Package managers/);
  expect(out).toMatch(/Bun.*pnpm|pnpm.*Bun/);
});

test("renders Package managers section with (none) when empty", () => {
  const out = capture(baseResult());
  expect(out).toMatch(/Package managers/);
  expect(out).toMatch(/Package managers[\s\S]*\(none\)/);
});

const capturePartial = (result: PartialRepoScanResult): string => {
  let out = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  renderTable(result, stream as NodeJS.WritableStream);
  return out;
};

describe("renderTable slicing", () => {
  test("only Monorepo + Components sections when only architecture is present", () => {
    const out = capturePartial({
      scannedAt: "2026-05-13T00:00:00Z",
      rootPath: "/x",
      architecture: {
        monorepo: true,
        toolName: "Cargo workspace",
        components: [],
      },
    });
    expect(out).toMatch(/Monorepo[\s\S]*yes[\s\S]*Cargo workspace/);
    expect(out).toMatch(/Components/);
    expect(out).not.toMatch(/Languages/);
    expect(out).not.toMatch(/Frameworks/);
    expect(out).not.toMatch(/Package managers/);
  });

  test("only Languages section when only languageStats + inventory.languages present", () => {
    const out = capturePartial({
      scannedAt: "2026-05-13T00:00:00Z",
      rootPath: "/x",
      inventory: { languages: ["TypeScript"] },
      languageStats: {
        totalFiles: 1,
        totalLines: 10,
        perLanguage: [
          { language: "TypeScript", files: 1, lines: 10, percentage: 100 },
        ],
      },
    });
    expect(out).toMatch(/Languages/);
    expect(out).toMatch(/TypeScript/);
    expect(out).not.toMatch(/Frameworks/);
    expect(out).not.toMatch(/Monorepo/);
    expect(out).not.toMatch(/Components/);
    expect(out).not.toMatch(/Package managers/);
  });

  test("only Frameworks section when only inventory.frameworks present", () => {
    const out = capturePartial({
      scannedAt: "2026-05-13T00:00:00Z",
      rootPath: "/x",
      inventory: { frameworks: ["Next.js"] },
    });
    expect(out).toMatch(/Frameworks/);
    expect(out).toMatch(/Next\.js/);
    expect(out).not.toMatch(/Languages/);
    expect(out).not.toMatch(/Monorepo/);
    expect(out).not.toMatch(/Package managers/);
  });

  test("only Package managers section when only inventory.packageManagers present", () => {
    const out = capturePartial({
      scannedAt: "2026-05-13T00:00:00Z",
      rootPath: "/x",
      inventory: { packageManagers: ["pnpm"] },
    });
    expect(out).toMatch(/Package managers/);
    expect(out).toMatch(/pnpm/);
    expect(out).not.toMatch(/Languages/);
    expect(out).not.toMatch(/Frameworks/);
    expect(out).not.toMatch(/Monorepo/);
  });

  test("metadata-only partial result renders only the scanned header", () => {
    const out = capturePartial({
      scannedAt: "2026-05-13T00:00:00Z",
      rootPath: "/x",
    });
    expect(out).toMatch(/scanned \/x/);
    expect(out).not.toMatch(/Languages/);
    expect(out).not.toMatch(/Frameworks/);
    expect(out).not.toMatch(/Monorepo/);
    expect(out).not.toMatch(/Package managers/);
    expect(out).not.toMatch(/Components/);
  });
});

test("renders CI providers section between Package managers and Monorepo", () => {
  const out = capture(
    baseResult({
      inventory: {
        languages: [],
        frameworks: [],
        packageManagers: [],
        ciProviders: ["GitHub Actions", "CircleCI"],
        buildSystems: [],
        containerization: [],
      },
    }),
  );
  expect(out).toMatch(/CI providers/);
  expect(out).toMatch(/GitHub Actions.*CircleCI|CircleCI.*GitHub Actions/);
  // Order: Package managers must precede CI providers; CI providers must precede Monorepo.
  const pmIdx = out.indexOf("Package managers");
  const ciIdx = out.indexOf("CI providers");
  const moIdx = out.indexOf("Monorepo");
  expect(pmIdx).toBeLessThan(ciIdx);
  expect(ciIdx).toBeLessThan(moIdx);
});

test("CI providers section shows (none) when empty", () => {
  const out = capture(baseResult());
  expect(out).toMatch(/CI providers[\s\S]*\(none\)/);
});

test("CI providers section absent when inventory.ciProviders is undefined (sliced)", () => {
  const out = capturePartial({
    scannedAt: "2026-05-13T00:00:00Z",
    rootPath: "/x",
    inventory: { frameworks: ["Next.js"] }, // ciProviders explicitly undefined
  });
  expect(out).not.toMatch(/CI providers/);
});

test("renders Build systems section with detected entries", () => {
  const out = capture(
    baseResult({
      inventory: {
        languages: [],
        frameworks: [],
        packageManagers: [],
        ciProviders: [],
        buildSystems: ["Bazel", "Make"],
        containerization: [],
      },
    }),
  );
  expect(out).toMatch(/Build systems/);
  expect(out).toMatch(/Bazel.*Make|Make.*Bazel/);
});

test("Build systems section shows (none) when empty", () => {
  const out = capture(baseResult());
  expect(out).toMatch(/Build systems[\s\S]*\(none\)/);
});

test("Build systems section absent when inventory.buildSystems is undefined (sliced)", () => {
  const out = capturePartial({
    scannedAt: "2026-05-13T00:00:00Z",
    rootPath: "/x",
    inventory: { packageManagers: ["pnpm"] }, // buildSystems explicitly undefined
  });
  expect(out).not.toMatch(/Build systems/);
});

test("Build systems section appears after Package managers and before CI providers", () => {
  const out = capture(
    baseResult({
      inventory: {
        languages: [],
        frameworks: [],
        packageManagers: ["pnpm"],
        ciProviders: ["GitHub Actions"],
        buildSystems: ["Make"],
        containerization: [],
      },
    }),
  );
  expect(out).toMatch(/Build systems/);
  // Order: Package managers → Build systems → CI providers → Monorepo
  const pmIdx = out.indexOf("Package managers");
  const bsIdx = out.indexOf("Build systems");
  const ciIdx = out.indexOf("CI providers");
  const moIdx = out.indexOf("Monorepo");
  expect(pmIdx).toBeLessThan(bsIdx);
  expect(bsIdx).toBeLessThan(ciIdx);
  expect(ciIdx).toBeLessThan(moIdx);
});

import type { Component } from "../types";

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
                frameworks: [
                  "Next.js",
                  "React",
                  "Tailwind CSS",
                  "tRPC",
                  "Drizzle",
                ],
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
