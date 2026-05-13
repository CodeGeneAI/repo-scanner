import path from "path";
import { aggregate } from "./aggregator/aggregator";
import type { DetectorId } from "./detectors/catalog";
import { getDetectors } from "./detectors/registry";
import type {
  PartialRepoScanResult,
  RepoScanResult,
  ScanRepoOptions,
} from "./types";
import { FileIndex } from "./utils/file-index";

/**
 * Scan a repository and return structured findings.
 * 1. Build file index (single filesystem walk)
 * 2. Run all detectors concurrently against the index
 * 3. Aggregate results
 *
 * When options.detectors is undefined (or options is omitted), the full
 * RepoScanResult is returned. When options.detectors is provided, only the
 * fields owned by the selected detectors are present (PartialRepoScanResult).
 */
export function scanRepo(
  scanPath: string,
  options?: { detectors?: undefined },
): Promise<RepoScanResult>;
export function scanRepo(
  scanPath: string,
  options: { detectors: readonly DetectorId[] },
): Promise<PartialRepoScanResult>;
export function scanRepo(
  scanPath: string,
  options: ScanRepoOptions,
): Promise<RepoScanResult | PartialRepoScanResult>;
export async function scanRepo(
  scanPath: string,
  options?: ScanRepoOptions,
): Promise<RepoScanResult | PartialRepoScanResult> {
  const absolutePath = path.resolve(scanPath);

  const index = await FileIndex.build(absolutePath);
  const detectors = getDetectors();
  const detectorIdSet = options?.detectors
    ? new Set<DetectorId>(options.detectors)
    : undefined;
  const enabledDetectors = detectorIdSet
    ? detectors.filter((detector) =>
        detectorIdSet.has(detector.id as DetectorId),
      )
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

  if (detectorIdSet) {
    return aggregate(absolutePath, results, index, {
      selectedDetectors: detectorIdSet,
    });
  }
  return aggregate(absolutePath, results, index);
}
