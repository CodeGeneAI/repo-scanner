#!/usr/bin/env bun
import { CliParseError, getHelpText, parseArgs } from "./cli";
import { evaluateDependencyPolicy } from "./dependency/policy";
import "./detectors/init";
import { setDuplicationOptions } from "./detectors/code-duplication";
import { setLargeFileThreshold } from "./detectors/large-file";
import { setSolidOptions } from "./detectors/solid-health";
import { renderJson } from "./output/json";
import { renderTable } from "./output/table";
import { scanRepo } from "./scanner";

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
  options.failOnOutdatedCount !== undefined;

const main = async () => {
  const options = parseArgs(process.argv);
  setLargeFileThreshold(options.largeFileThreshold);
  setDuplicationOptions({
    minTokens: options.minTokens,
    minLines: options.minLines,
  });
  setSolidOptions({
    enabled: options.solid,
    threshold: options.solidThreshold,
  });
  const dependenciesEnabled = shouldEnableDependencyScan(options);

  if (options.showHelp) {
    process.stdout.write(getHelpText());
    process.exit(0);
  }

  const result = await scanRepo(options.path, {
    dependencies: {
      enabled: dependenciesEnabled,
      ecosystems: options.ecosystems,
      skipUsage: options.skipUsage,
      skipSecurity: options.skipSecurity,
      skipVersionLookup: options.skipVersionLookup,
      concurrency: options.concurrency,
      componentGrouping: options.componentGrouping,
      debugVulnerabilityKeys: options.depsDebug,
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
