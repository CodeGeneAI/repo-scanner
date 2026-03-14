import path from "path";
import { aggregate } from "./aggregator/aggregator";
import { scanDependencies } from "./dependency/orchestrator";
import type { Ecosystem } from "./dependency/types";
import { ECOSYSTEM_EXTENSIONS } from "./dependency/usage/patterns";
import { getDetectors } from "./detectors/registry";
import type { RepoScanResult, ScanRepoOptions } from "./types";
import { FileIndex } from "./utils/file-index";
import { readText } from "./utils/fs";

const USAGE_SCAN_EXTENSIONS = new Set(
  Object.values(ECOSYSTEM_EXTENSIONS).flatMap((extensions) => [...extensions]),
);

const getUsageScanExtensions = (
  ecosystems?: readonly Ecosystem[],
): Set<string> => {
  if (!ecosystems || ecosystems.length === 0) {
    return USAGE_SCAN_EXTENSIONS;
  }

  return new Set(
    ecosystems.flatMap((ecosystem) => ECOSYSTEM_EXTENSIONS[ecosystem] ?? []),
  );
};

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

  const results = await Promise.all(
    detectors.map((detector) => detector.detect(absolutePath, index)),
  );

  const durationMs = Math.round(performance.now() - start);
  const baseResult = aggregate(absolutePath, durationMs, results);

  if (!options?.dependencies?.enabled) {
    return baseResult;
  }

  let indexedUsageFiles:
    | {
        path: string;
        ext: string;
      }[]
    | undefined;
  let indexedFileContent: Map<string, string> | undefined;

  if (!options.dependencies.skipUsage) {
    const usageScanExtensions = getUsageScanExtensions(
      options.dependencies.ecosystems,
    );

    indexedUsageFiles = index
      .all()
      .filter((file) => usageScanExtensions.has(file.ext))
      .map((file) => ({
        path: file.path,
        ext: file.ext,
      }));

    indexedFileContent = new Map<string, string>();
    for (const file of indexedUsageFiles) {
      const content = await readText(file.path);
      if (content !== undefined) {
        indexedFileContent.set(file.path, content);
      }
    }
  }

  const dependencies = await scanDependencies({
    scanPath: absolutePath,
    ecosystems: options.dependencies.ecosystems,
    skipUsage: options.dependencies.skipUsage,
    skipSecurity: options.dependencies.skipSecurity,
    concurrency: options.dependencies.concurrency,
    componentGrouping: options.dependencies.componentGrouping,
    debugVulnerabilityKeys: options.dependencies.debugVulnerabilityKeys,
    indexedUsageFiles,
    indexedFileContent,
  });

  return {
    ...baseResult,
    dependencies,
  };
};
