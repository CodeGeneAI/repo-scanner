import os from "os";
import path from "path";
import { scanDependencySubsystem } from "./scanner";
import type {
  DependencyComponentGroupingMode,
  DependencyScanOptions,
  DepScannerResult,
  Ecosystem,
  IndexedUsageFile,
} from "./types";
import "./parsers/init";

export interface DependencyOrchestratorOptions {
  readonly scanPath: string;
  readonly ecosystems?: readonly Ecosystem[];
  readonly skipUsage?: boolean;
  readonly skipSecurity?: boolean;
  readonly skipVersionLookup?: boolean;
  readonly concurrency?: number;
  readonly componentGrouping?: DependencyComponentGroupingMode;
  readonly debugVulnerabilityKeys?: boolean;
  readonly indexedUsageFiles?: readonly IndexedUsageFile[];
  readonly indexedFileContent?: ReadonlyMap<string, string>;
}

/**
 * Run dependency intelligence scan from repo-scanner.
 */
export const scanDependencies = async (
  options: DependencyOrchestratorOptions,
): Promise<DepScannerResult> => {
  const normalizedOptions: DependencyScanOptions = {
    path: path.resolve(options.scanPath),
    ecosystems: options.ecosystems,
    skipUsage: options.skipUsage ?? false,
    skipSecurity: options.skipSecurity ?? false,
    skipVersionLookup: options.skipVersionLookup ?? false,
    concurrency: options.concurrency ?? os.cpus().length,
    componentGrouping: options.componentGrouping ?? "default",
    debugVulnerabilityKeys: options.debugVulnerabilityKeys ?? false,
    indexedUsageFiles: options.indexedUsageFiles,
    indexedFileContent: options.indexedFileContent,
  };

  return scanDependencySubsystem(normalizedOptions);
};
