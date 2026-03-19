import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { generatePerfDriftReport } from "./drift-report";

describe("generatePerfDriftReport", () => {
  it("reports latest drift against rolling median", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repo-scanner-perf-drift-"));
    const file = path.join(dir, "history.jsonl");
    try {
      await writeFile(
        file,
        [
          JSON.stringify({
            metric: "scan-diff-large-set",
            elapsedMs: 100,
            budgetMs: 200,
            timestamp: "2026-01-01T00:00:00.000Z",
          }),
          JSON.stringify({
            metric: "scan-diff-large-set",
            elapsedMs: 120,
            budgetMs: 200,
            timestamp: "2026-01-02T00:00:00.000Z",
          }),
          JSON.stringify({
            metric: "scan-diff-large-set",
            elapsedMs: 140,
            budgetMs: 200,
            timestamp: "2026-01-03T00:00:00.000Z",
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const report = await generatePerfDriftReport(file);
      expect(report.length).toBe(1);
      expect(report[0]).toContain("scan-diff-large-set");
      expect(report[0]).toContain("+27.3%");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
