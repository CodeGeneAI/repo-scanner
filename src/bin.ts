#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { CliParseError, getHelpText, getVersion, parseArgs } from "./cli";
import { scanForDuplicates } from "./code-duplication/scanner";
import { evaluateDependencyPolicy } from "./dependency/policy";
import { setDbSchemaOptions } from "./detectors/db-schema";
import { setEnvIncludeTestFiles } from "./detectors/env";
import "./detectors/init";
import { setDuplicationOptions } from "./detectors/code-duplication";
import { setLargeFileThreshold } from "./detectors/large-file";
import { setSolidOptions } from "./detectors/solid-health";
import { renderDryCheckJson, renderDryCheckTable } from "./output/dry-check";
import { renderJson } from "./output/json";
import { renderTable } from "./output/table";
import { generateTopology } from "./output/topology";
import { renderTopologyToString } from "./output/topology/render";
import { resolveScanProfile, type ScanSection } from "./scan-profile";
import { scanRepo } from "./scanner";
import type { RepoScanResult } from "./types";
import { BUILD_SHA, BUILD_UPDATE_URL } from "./update/build-version";
import { formatUpdateNotice, startBackgroundUpdateCheck } from "./update/check";
import { runUpdateCommand } from "./update/command";
import { FileIndex } from "./utils/file-index";

const flushWritable = async (stream: NodeJS.WritableStream): Promise<void> => {
  await new Promise<void>((resolve) => {
    stream.write("", () => resolve());
  });
};

const shouldEnableDependencyScan = (options: ReturnType<typeof parseArgs>) =>
  options.deps ||
  options.failOnVulns ||
  options.failOnOutdated ||
  options.failOnVulnsCount !== undefined ||
  options.failOnOutdatedCount !== undefined ||
  options.failOnDeadDeps ||
  options.failOnDeadDepsCount !== undefined;

const resolveValidDirectory = (rawPath: string): string => {
  const resolvedPath = path.resolve(rawPath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedPath);
  } catch {
    throw new Error(`path does not exist: ${resolvedPath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`path is not a directory: ${resolvedPath}`);
  }
  return resolvedPath;
};

/**
 * Races a promise against a timeout, resolving to null if the timeout wins.
 * Used to give the background update check a short final wait window after
 * the main scan completes (it has already been running concurrently).
 */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

const buildSectionJsonPayload = (
  result: RepoScanResult,
  selectedSections: readonly ScanSection[],
): Record<string, unknown> => {
  const sectionSet = new Set(selectedSections);
  const payload: Record<string, unknown> = {
    scanPath: result.scanPath,
    timestamp: result.timestamp,
    durationMs: result.durationMs,
  };

  if (sectionSet.has("architecture")) {
    payload.architecture = result.architecture;
  }
  if (sectionSet.has("inventory")) {
    payload.inventory = result.inventory;
  }
  if (sectionSet.has("external-services")) {
    payload.externalServices = result.inventory.externalServices ?? [];
  }
  if (sectionSet.has("build-and-test")) {
    payload.buildAndTest = result.buildAndTest;
  }

  return payload;
};

const main = async () => {
  const options = parseArgs(process.argv);
  setLargeFileThreshold(options.largeFileThreshold);
  setDuplicationOptions({
    minTokens: options.minTokens,
    minLines: options.minLines,
    extensions:
      options.extensions.length > 0 ? new Set(options.extensions) : undefined,
    filters: {
      minUniqueRatio: options.minUniqueRatio,
      maxLiteralRatio: options.maxLiteralRatio,
      ignoreBarrelExports: options.ignoreBarrelExports,
    },
  });
  setSolidOptions({
    enabled: options.solid,
    threshold: options.solidThreshold,
  });
  setEnvIncludeTestFiles(options.envIncludeTests);
  setDbSchemaOptions({ enabled: options.dbSchema });

  if (options.showVersion) {
    process.stdout.write(`${getVersion()}\n`);
    process.exit(0);
  }

  if (options.showHelp) {
    process.stdout.write(getHelpText());
    process.exit(0);
  }

  if (options.showUpdate) {
    await runUpdateCommand({
      currentSha: BUILD_SHA,
      updateUrl: BUILD_UPDATE_URL,
      stderr: process.stderr,
    });
    process.exit(0);
  }

  // Start background update check concurrently — does not block scan work.
  const updateCheckPromise = startBackgroundUpdateCheck({
    currentSha: BUILD_SHA,
    updateUrl: BUILD_UPDATE_URL,
    noUpdateCheck: options.noUpdateCheck,
  });

  if (options.dryCheck) {
    const validScanPath = resolveValidDirectory(options.path);
    const index = await FileIndex.build(validScanPath);
    const result = await scanForDuplicates(validScanPath, index, {
      minTokens: options.minTokens,
      minLines: options.minLines,
      extensions:
        options.extensions.length > 0 ? new Set(options.extensions) : undefined,
      filters: {
        minUniqueRatio: options.minUniqueRatio,
        maxLiteralRatio: options.maxLiteralRatio,
        ignoreBarrelExports: options.ignoreBarrelExports,
      },
    });

    if (options.format === "json") {
      renderDryCheckJson(result, process.stdout);
    } else {
      renderDryCheckTable(result, process.stdout);
    }

    // Show update notice after output if applicable.
    const updateInfo = await withTimeout(updateCheckPromise, 500);
    if (updateInfo && process.stderr.isTTY) {
      process.stderr.write(formatUpdateNotice(BUILD_SHA, updateInfo));
    }
    return;
  }

  const dependenciesEnabled = shouldEnableDependencyScan(options);
  const deadDepsActive =
    options.failOnDeadDeps || options.failOnDeadDepsCount !== undefined;
  const scanProfile = resolveScanProfile(options);

  const result = await scanRepo(options.path, {
    enabledDetectorIds: scanProfile.enabledDetectorIds,
    dependencies: {
      enabled: dependenciesEnabled,
      ecosystems: options.ecosystems,
      // Dead dep detection requires usage scanning — override skipUsage when active
      skipUsage: deadDepsActive ? false : options.skipUsage,
      skipSecurity: options.skipSecurity,
      skipVersionLookup: options.skipVersionLookup,
      concurrency: options.concurrency,
      componentGrouping: options.componentGrouping,
      debugVulnerabilityKeys: options.depsDebug,
      includeDevDeadDeps: options.includeDevDeadDeps,
    },
  });

  const policyEvaluation = result.dependencies
    ? evaluateDependencyPolicy(result.dependencies, {
        failOnVulns: options.failOnVulns,
        failOnVulnsCount: options.failOnVulnsCount,
        severityThreshold: options.severityThreshold,
        failOnOutdated: options.failOnOutdated,
        failOnOutdatedCount: options.failOnOutdatedCount,
        outdatedThreshold: options.outdatedThreshold,
        failOnDeadDeps: options.failOnDeadDeps,
        failOnDeadDepsCount: options.failOnDeadDepsCount,
      })
    : undefined;

  const topology = options.topology
    ? generateTopology(result, options.topologyDiagrams)
    : undefined;

  if (options.format === "json") {
    const basePayload = scanProfile.allDetectors
      ? ({ ...result } as Record<string, unknown>)
      : buildSectionJsonPayload(result, scanProfile.selectedSections);
    const jsonPayload = {
      ...basePayload,
      ...(result.dependencies ? { dependencies: result.dependencies } : {}),
      ...(policyEvaluation ? { policyEvaluation } : {}),
      ...(topology ? { topology } : {}),
    };
    renderJson(jsonPayload, process.stdout);
  } else {
    renderTable(result, process.stdout, {
      selectedSections: scanProfile.allDetectors
        ? undefined
        : scanProfile.selectedSections,
      includeDependencies: dependenciesEnabled,
      includeSignals: scanProfile.allDetectors,
    });
  }

  if (topology) {
    if (options.topologyOutput) {
      const content = renderTopologyToString(topology, "markdown");
      fs.writeFileSync(options.topologyOutput, content);
    } else if (options.format !== "json") {
      const content = renderTopologyToString(topology, "markdown");
      process.stdout.write(`\n${content}`);
    }
  }

  if (policyEvaluation?.failed) {
    await flushWritable(process.stdout);
    process.exit(1);
  }

  if (options.depsDebug && result.dependencies?.debug) {
    const stats = result.dependencies.debug.vulnerabilityKeyStats;
    process.stderr.write(
      `[deps-debug] vulnerability keys: total=${stats.totalDependencies} unique=${stats.uniqueKeys} duplicate=${stats.duplicateKeys}\n`,
    );
  }

  // Show update notice after all scan output and debug info.
  const updateInfo = await withTimeout(updateCheckPromise, 500);
  if (updateInfo && process.stderr.isTTY) {
    process.stderr.write(formatUpdateNotice(BUILD_SHA, updateInfo));
  }
};

main().catch((error) => {
  if (error instanceof CliParseError) {
    console.error(error.message);
    process.exit(error.exitCode);
  }

  console.error("Error:", error.message);
  process.exit(2);
});
