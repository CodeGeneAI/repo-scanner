import { describe, expect, test } from "bun:test";
import { Writable } from "stream";
import type { RepoScanResult } from "../types";
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
  inventory: { languages: [], frameworks: [], packageManagers: [] },
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
