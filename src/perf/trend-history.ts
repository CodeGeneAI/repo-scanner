import { appendFile, mkdir } from "fs/promises";
import path from "path";

export interface PerfTrendRecord {
  readonly metric: string;
  readonly elapsedMs: number;
  readonly budgetMs: number;
  readonly timestamp: string;
  readonly context?: string;
}

const resolvePerfHistoryPath = (): string | undefined => {
  const raw = process.env.REPO_SCANNER_PERF_HISTORY_PATH?.trim();
  return raw && raw.length > 0 ? raw : undefined;
};

export const recordPerfTrend = async (
  record: PerfTrendRecord,
): Promise<void> => {
  const targetPath = resolvePerfHistoryPath();
  if (!targetPath) return;

  await mkdir(path.dirname(targetPath), { recursive: true });
  await appendFile(targetPath, `${JSON.stringify(record)}\n`, "utf8");
};
