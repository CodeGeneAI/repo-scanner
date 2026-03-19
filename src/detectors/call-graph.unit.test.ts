import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import { recordPerfTrend } from "../perf/trend-history";
import { FileIndex } from "../utils/file-index";
import {
  buildCallGraph,
  parseCalls,
  parseFunctions,
  parseTsImports,
} from "./call-graph";

const perfSnapshotPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../perf/perf-baselines.snapshot.json",
);

describe("call-graph detector helpers", () => {
  it("extracts top-level functions", () => {
    const functions = parseFunctions(
      [
        "function handler() {",
        "  service();",
        "}",
        "",
        "function service() {",
        "  return;",
        "}",
      ].join("\n"),
      "src/example.ts",
    );

    expect(functions.length).toBeGreaterThanOrEqual(2);
    expect(functions.map((fn) => fn.name)).toContain("handler");
    expect(functions.map((fn) => fn.name)).toContain("service");
  });

  it("extracts call expressions and ignores keywords", () => {
    const calls = parseCalls(
      [
        "if (x) {",
        "  handler();",
        "}",
        "for (const x of y) {",
        "  service();",
        "}",
      ].join("\n"),
    );

    expect(calls).toContain("handler");
    expect(calls).toContain("service");
    expect(calls).not.toContain("if");
    expect(calls).not.toContain("for");
  });

  it("extracts TS import symbol map for relative imports", () => {
    const imports = parseTsImports(
      [
        "import { service, helper as renamedHelper } from './service';",
        "import defaultService from './default-service';",
      ].join("\n"),
      "src/handler.ts",
    );

    expect(imports.get("service")).toBe("src/service");
    expect(imports.get("helper")).toBe("src/service");
    expect(imports.get("defaultService")).toBe("src/default-service");
  });

  it("enforces call-graph truncation safeguards for large graphs", async () => {
    const tempDir = await mkdtemp(
      path.join(tmpdir(), "repo-scanner-call-graph-"),
    );
    try {
      const source = Array.from({ length: 5_200 }, (_, index) => {
        return [`function fn${String(index)}() {`, "  return;", "}", ""].join(
          "\n",
        );
      }).join("\n");
      const target = path.join(tempDir, "src", "large.ts");
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source, "utf8");

      const index = await FileIndex.build(tempDir);
      const start = performance.now();
      const graph = await buildCallGraph(index);
      const elapsedMs = performance.now() - start;
      const snapshot = (await Bun.file(perfSnapshotPath).json()) as {
        callGraphLargeFixtureMs: number;
        budgetMultiplier: number;
      };
      const budgetMs =
        snapshot.callGraphLargeFixtureMs * snapshot.budgetMultiplier;

      expect(graph.truncated).toBeTrue();
      expect(graph.nodes.length).toBeLessThanOrEqual(5_000);
      expect(graph.edges.length).toBe(0);
      expect(graph.warnings?.length ?? 0).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(budgetMs);
      await recordPerfTrend({
        metric: "call-graph-large-fixture",
        elapsedMs,
        budgetMs,
        timestamp: new Date().toISOString(),
        context: "unit-test",
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 20_000);
});
