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
import { scanRepo } from "./scanner";
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
    const version = await getVersion();
    process.stdout.write(`${version}\n`);
    process.exit(0);
  }

  if (options.showHelp) {
    process.stdout.write(getHelpText());
    process.exit(0);
  }

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
    return;
  }

  const dependenciesEnabled = shouldEnableDependencyScan(options);
  const deadDepsActive =
    options.failOnDeadDeps || options.failOnDeadDepsCount !== undefined;

  const result = await scanRepo(options.path, {
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

  if (options.format === "json") {
    renderJson(
      policyEvaluation ? { ...result, policyEvaluation } : result,
      process.stdout,
    );
  } else {
    renderTable(result, process.stdout);
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
};

main().catch((error) => {
  if (error instanceof CliParseError) {
    console.error(error.message);
    process.exit(error.exitCode);
  }

  console.error("Error:", error.message);
  process.exit(2);
});
