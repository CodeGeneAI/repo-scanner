import { readFile } from "fs/promises";
import path from "path";

interface PerfTrendRow {
  readonly metric: string;
  readonly elapsedMs: number;
  readonly budgetMs: number;
  readonly timestamp: string;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }
  return sorted[middle]!;
};

export const generatePerfDriftReport = async (
  historyPath: string,
): Promise<readonly string[]> => {
  const content = await readFile(historyPath, "utf8").catch(() => "");
  if (!content) return [];

  const rows = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as PerfTrendRow);

  const metrics = [...new Set(rows.map((row) => row.metric))];
  const reportLines: string[] = [];

  for (const metric of metrics) {
    const metricRows = rows.filter((row) => row.metric === metric);
    if (metricRows.length < 2) continue;

    const latest = metricRows[metricRows.length - 1]!;
    const baseline = median(
      metricRows.slice(0, -1).map((row) => row.elapsedMs),
    );
    if (baseline <= 0) continue;

    const driftPct = ((latest.elapsedMs - baseline) / baseline) * 100;
    const sign = driftPct >= 0 ? "+" : "";
    reportLines.push(
      `${metric}: ${sign}${driftPct.toFixed(1)}% vs rolling median (${latest.elapsedMs.toFixed(1)}ms latest, ${baseline.toFixed(1)}ms median)`,
    );
  }

  return reportLines;
};

if (import.meta.main) {
  const historyPath =
    process.argv[2] ?? process.env.REPO_SCANNER_PERF_HISTORY_PATH;
  if (!historyPath) {
    process.stderr.write(
      "Usage: bun src/perf/drift-report.ts <path-to-perf-history.jsonl>\n",
    );
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), historyPath);
  const lines = await generatePerfDriftReport(resolved);
  if (lines.length === 0) {
    process.stdout.write("No drift data available.\n");
    process.exit(0);
  }
  process.stdout.write(`Perf drift report (${resolved}):\n`);
  for (const line of lines) {
    process.stdout.write(`- ${line}\n`);
  }
}
