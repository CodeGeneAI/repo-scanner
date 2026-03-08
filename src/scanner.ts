import path from "path";
import { aggregate } from "./aggregator/aggregator";
import { getDetectors } from "./detectors/registry";
import type { RepoScanResult } from "./types";
import { FileIndex } from "./utils/file-index";

/**
 * Scan a repository and return structured findings.
 * 1. Build file index (single filesystem walk)
 * 2. Run all detectors concurrently against the index
 * 3. Aggregate results
 */
export const scanRepo = async (scanPath: string): Promise<RepoScanResult> => {
  const absolutePath = path.resolve(scanPath);
  const start = performance.now();

  const index = await FileIndex.build(absolutePath);
  const detectors = getDetectors();

  const results = await Promise.all(
    detectors.map((d) => d.detect(absolutePath, index)),
  );

  const durationMs = Math.round(performance.now() - start);
  return aggregate(absolutePath, durationMs, results);
};
