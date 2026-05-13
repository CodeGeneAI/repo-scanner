import path from "path";
import { aggregate } from "./aggregator/aggregator";
import { getDetectors } from "./detectors/registry";
import type { RepoScanResult, ScanRepoOptions } from "./types";
import { FileIndex } from "./utils/file-index";

/**
 * Scan a repository and return structured findings.
 * 1. Build file index (single filesystem walk)
 * 2. Run all detectors concurrently against the index
 * 3. Aggregate results
 */
export const scanRepo = async (
  scanPath: string,
  options?: ScanRepoOptions,
): Promise<RepoScanResult> => {
  const absolutePath = path.resolve(scanPath);
  const start = performance.now();

  const index = await FileIndex.build(absolutePath);
  const detectors = getDetectors();
  const detectorIdSet = options?.enabledDetectorIds
    ? new Set(options.enabledDetectorIds)
    : undefined;
  const enabledDetectors = detectorIdSet
    ? detectors.filter((detector) => detectorIdSet.has(detector.id))
    : detectors;

  // Use allSettled so one failing detector doesn't crash the entire scan
  const settled = await Promise.allSettled(
    enabledDetectors.map((detector) => detector.detect(absolutePath, index)),
  );
  const results = settled
    .filter(
      (
        r,
      ): r is PromiseFulfilledResult<
        Awaited<ReturnType<(typeof detectors)[0]["detect"]>>
      > => r.status === "fulfilled",
    )
    .map((r) => r.value);

  const durationMs = Math.round(performance.now() - start);
  return aggregate(absolutePath, durationMs, results, index);
};
