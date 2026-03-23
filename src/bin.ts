#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { CliParseError, getHelpText, getVersion, parseArgs } from "./cli";
import { scanForDuplicates } from "./code-duplication/scanner";
import type { DryCheckResult } from "./code-duplication/types";
import { evaluateDependencyPolicy } from "./dependency/policy";
import {
  DETECTOR_CATALOG,
  DETECTOR_IDS,
  DETECTOR_PRESETS,
} from "./detectors/catalog";
import { setDbSchemaOptions } from "./detectors/db-schema";
import { setEnvIncludeTestFiles } from "./detectors/env";
import { learnComponentConventionBaselinesFromGit } from "./diff/convention-history";
import { getChangedFiles } from "./diff/git";
import { buildDiffScanResult, isLikelyTestFile } from "./diff/scan-diff";
import "./detectors/init";
import { setDuplicationOptions } from "./detectors/code-duplication";
import { setLargeFileThreshold } from "./detectors/large-file";
import { setSolidOptions } from "./detectors/solid-health";
import { renderDryCheckJson, renderDryCheckTable } from "./output/dry-check";
import { renderJson } from "./output/json";
import { renderTable } from "./output/table";
import { generateTopology } from "./output/topology";
import { renderTopologyToString } from "./output/topology/render";
import {
  resolveScanProfile,
  SCAN_SECTIONS,
  type ScanSection,
} from "./scan-profile";
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

const renderDetectorsOutput = (
  format: "table" | "json",
  schema: boolean,
  stream: NodeJS.WritableStream,
): void => {
  if (format === "json") {
    if (schema) {
      renderJson(
        {
          $schema:
            "https://assets.codegene.dev/binaries/repo-scanner/schemas/detectors-v1.schema.json",
          version: 1,
          detectors: DETECTOR_CATALOG,
          presets: DETECTOR_PRESETS,
        },
        stream,
      );
      return;
    }
    renderJson(
      { detectors: DETECTOR_CATALOG, presets: DETECTOR_PRESETS },
      stream,
    );
    return;
  }

  stream.write("Supported detectors\n");
  for (const detector of DETECTOR_CATALOG) {
    stream.write(`  - ${detector.id.padEnd(20)} ${detector.description}\n`);
  }
  stream.write(`\nPresets: ${Object.keys(DETECTOR_PRESETS).join(", ")}\n`);
  stream.write(
    `Use with: repo-scanner --detectors ${DETECTOR_IDS.slice(0, 3).join(",")}\n`,
  );
};

const buildCompletionScript = (shell: "bash" | "zsh" | "fish"): string => {
  const detectorIds = DETECTOR_IDS.join(" ");
  if (shell === "bash") {
    return `# bash completion for repo-scanner
_repo_scanner()
{
  local current previous
  COMPREPLY=()
  current="\${COMP_WORDS[COMP_CWORD]}"
  previous="\${COMP_WORDS[COMP_CWORD-1]}"
  if [[ "\${previous}" == "--detectors" ]]; then
    COMPREPLY=( $(compgen -W "${detectorIds}" -- "\${current}") )
    return 0
  fi
  COMPREPLY=( $(compgen -W "--help --version --path --format --detectors --deps --topology --diff" -- "\${current}") )
}
complete -F _repo_scanner repo-scanner
`;
  }
  if (shell === "zsh") {
    return `#compdef repo-scanner
_repo_scanner() {
  local -a detector_ids
  detector_ids=(${DETECTOR_IDS.join(" ")})
  _arguments \\
    '--detectors[Comma-separated detector IDs]:detectors:->detectors' \\
    '--path[Directory to scan]:path:_files -/' \\
    '--format[Output format]:format:(table json)' \\
    '--help[Show help]' \\
    '--version[Show version]'
  case $state in
    detectors)
      _describe 'detector ids' detector_ids
      ;;
  esac
}
_repo_scanner "$@"
`;
  }
  return `# fish completion for repo-scanner
set -l detector_ids ${DETECTOR_IDS.join(" ")}
for detector in $detector_ids
  complete -c repo-scanner -l detectors -xa "$detector"
end
complete -c repo-scanner -l path -r
complete -c repo-scanner -l format -xa "table json"
complete -c repo-scanner -l help
complete -c repo-scanner -l version
`;
};

const installCompletionScript = (
  shell: "bash" | "zsh" | "fish",
  script: string,
): string => {
  const homeDir = process.env.HOME ?? process.cwd();
  const targetPath =
    shell === "bash"
      ? path.join(homeDir, ".bash_completion.d", "repo-scanner")
      : shell === "zsh"
        ? path.join(homeDir, ".zfunc", "_repo-scanner")
        : path.join(
            homeDir,
            ".config",
            "fish",
            "completions",
            "repo-scanner.fish",
          );
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, script);
  return targetPath;
};

const resolveCompletionInstallPath = (
  shell: "bash" | "zsh" | "fish",
): string => {
  const homeDir = process.env.HOME ?? process.cwd();
  if (shell === "bash") {
    return path.join(homeDir, ".bash_completion.d", "repo-scanner");
  }
  if (shell === "zsh") {
    return path.join(homeDir, ".zfunc", "_repo-scanner");
  }
  return path.join(
    homeDir,
    ".config",
    "fish",
    "completions",
    "repo-scanner.fish",
  );
};

const buildSectionJsonPayload = (
  result: RepoScanResult,
  selectedSections: readonly ScanSection[],
): Record<string, unknown> => {
  const sectionSet = new Set(selectedSections);
  const payload: Record<string, unknown> = {
    scanPath: result.scanPath,
    timestamp: result.timestamp,
    durationMs: result.durationMs,
    ...(result.vcs ? { vcs: result.vcs } : {}),
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

const resolveRenderedSections = (
  selectedSections: readonly ScanSection[],
): readonly ScanSection[] =>
  selectedSections.length > 0 ? selectedSections : SCAN_SECTIONS;

const hasExplicitSectionOutputFlags = (
  options: ReturnType<typeof parseArgs>,
): boolean =>
  options.scanArchitecture ||
  options.scanInventory ||
  options.scanExternalServices ||
  options.scanBuildAndTest;

const hasExplicitDependencyOutputFlags = (
  options: ReturnType<typeof parseArgs>,
): boolean => options.deps;

const hasExplicitPolicyOutputFlags = (
  options: ReturnType<typeof parseArgs>,
): boolean =>
  options.failOnVulns ||
  options.failOnVulnsCount !== undefined ||
  options.failOnOutdated ||
  options.failOnOutdatedCount !== undefined ||
  options.failOnDeadDeps ||
  options.failOnDeadDepsCount !== undefined;

const main = async () => {
  const options = parseArgs(process.argv);
  if (options.detectorSelectionWarnings.length > 0) {
    for (const warning of options.detectorSelectionWarnings) {
      process.stderr.write(`[detectors] warning: ${warning}\n`);
    }
  }
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
  // Auto-enable db-schema when ERD topology diagram is requested.
  const erdRequested = options.topologyDiagrams
    ? options.topologyDiagrams.includes("erd")
    : options.topology;
  setDbSchemaOptions({ enabled: options.dbSchema || erdRequested });

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

  if (options.showDetectors) {
    renderDetectorsOutput(
      options.format,
      options.detectorsSchema,
      process.stdout,
    );
    process.exit(0);
  }

  if (options.completionShell) {
    const script = buildCompletionScript(options.completionShell);
    if (options.completionInstall) {
      const installedPath = installCompletionScript(
        options.completionShell,
        script,
      );
      process.stdout.write(
        `Installed ${options.completionShell} completion: ${installedPath}\n`,
      );
      process.exit(0);
    }
    if (options.completionUninstall) {
      const installPath = resolveCompletionInstallPath(options.completionShell);
      if (fs.existsSync(installPath)) {
        fs.unlinkSync(installPath);
        process.stdout.write(
          `Removed ${options.completionShell} completion: ${installPath}\n`,
        );
      } else {
        process.stdout.write(
          `No ${options.completionShell} completion found at: ${installPath}\n`,
        );
      }
      process.exit(0);
    }
    process.stdout.write(script);
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
  const diffScan =
    options.diff && options.diff.length > 0
      ? await (async () => {
          const diffRange = options.diff!;
          const changedFiles = await getChangedFiles(options.path, diffRange);
          const affectedComponents = result.architecture.components.filter(
            (component) =>
              changedFiles.some(
                (file) =>
                  file === component.path ||
                  file.startsWith(`${component.path}/`),
              ),
          );
          const historyBaselines =
            affectedComponents.length > 0
              ? await learnComponentConventionBaselinesFromGit(
                  options.path,
                  affectedComponents,
                )
              : undefined;

          // Diff-scoped duplication scan (changed files only, test files excluded by default)
          let duplicationResult: DryCheckResult | undefined;
          if (options.diffDryCheck && changedFiles.length > 0) {
            const dryCheckFiles = options.diffDryIncludeTests
              ? changedFiles
              : changedFiles.filter((f) => !isLikelyTestFile(f));
            const diffIndex = FileIndex.fromPaths(options.path, dryCheckFiles);
            duplicationResult = await scanForDuplicates(
              options.path,
              diffIndex,
              {
                minTokens: options.minTokens,
                minLines: options.minLines,
                extensions:
                  options.extensions.length > 0
                    ? new Set(options.extensions)
                    : undefined,
                filters: {
                  minUniqueRatio: options.minUniqueRatio,
                  maxLiteralRatio: options.maxLiteralRatio,
                  ignoreBarrelExports: options.ignoreBarrelExports,
                },
              },
            );
          }

          return buildDiffScanResult(result, changedFiles, {
            historyBaselines,
            dryCheck: duplicationResult,
            envCheck: options.diffEnvCheck,
          });
        })()
      : undefined;

  // VCS-only mode: output just the VCS info and exit.
  const vcsOnlyMode = options.vcs && !hasExplicitSectionOutputFlags(options);
  if (vcsOnlyMode) {
    if (options.format === "json") {
      renderJson(
        {
          scanPath: result.scanPath,
          timestamp: result.timestamp,
          durationMs: result.durationMs,
          vcs: result.vcs ?? null,
        },
        process.stdout,
      );
    } else {
      const vcs = result.vcs;
      if (vcs) {
        process.stdout.write("VCS Info\n");
        process.stdout.write(`  Type:            ${vcs.type}\n`);
        if (vcs.provider)
          process.stdout.write(`  Provider:        ${vcs.provider}\n`);
        if (vcs.originUrl)
          process.stdout.write(`  Origin URL:      ${vcs.originUrl}\n`);
        if (vcs.currentBranch)
          process.stdout.write(`  Current Branch:  ${vcs.currentBranch}\n`);
        if (vcs.defaultBranch)
          process.stdout.write(`  Default Branch:  ${vcs.defaultBranch}\n`);
        if (vcs.branches && vcs.branches.length > 0) {
          process.stdout.write(
            `  Branches:        ${vcs.branches.join(", ")}\n`,
          );
        }
      } else {
        process.stdout.write("No VCS detected.\n");
      }
    }
    return;
  }

  const sectionOutputExplicitlyRequested =
    hasExplicitSectionOutputFlags(options) || options.allDetectors;
  const dependencyOutputExplicitlyRequested =
    hasExplicitDependencyOutputFlags(options);
  const policyOutputExplicitlyRequested = hasExplicitPolicyOutputFlags(options);
  const nonTopologyOutputExplicitlyRequested =
    sectionOutputExplicitlyRequested ||
    dependencyOutputExplicitlyRequested ||
    policyOutputExplicitlyRequested;
  const topologyOnlyOutput =
    options.topology && !nonTopologyOutputExplicitlyRequested;
  const includeReportOutput = !topologyOnlyOutput;
  const includeSectionOutput =
    scanProfile.allDetectors ||
    !options.topology ||
    sectionOutputExplicitlyRequested;
  const includeDependencyOutput =
    !!result.dependencies &&
    (!options.topology ||
      dependencyOutputExplicitlyRequested ||
      policyOutputExplicitlyRequested);
  const includePolicyOutput =
    !!policyEvaluation &&
    (!options.topology ||
      dependencyOutputExplicitlyRequested ||
      policyOutputExplicitlyRequested);

  if (options.format === "json") {
    const renderedSections = resolveRenderedSections(
      scanProfile.selectedSections,
    );
    const jsonPayload = topologyOnlyOutput
      ? topology
        ? { topology }
        : {}
      : {
          ...(scanProfile.allDetectors
            ? ({ ...result } as Record<string, unknown>)
            : includeSectionOutput
              ? buildSectionJsonPayload(result, renderedSections)
              : {}),
          ...(includeDependencyOutput
            ? { dependencies: result.dependencies }
            : {}),
          ...(includePolicyOutput ? { policyEvaluation } : {}),
          ...(topology ? { topology } : {}),
          ...(diffScan ? { diffScan } : {}),
        };
    renderJson(jsonPayload, process.stdout);
  } else if (includeReportOutput) {
    const renderedSections = resolveRenderedSections(
      scanProfile.selectedSections,
    );
    renderTable(result, process.stdout, {
      selectedSections: scanProfile.allDetectors
        ? undefined
        : includeSectionOutput
          ? renderedSections
          : [],
      includeDependencies: includeDependencyOutput,
      includeSignals: scanProfile.allDetectors,
    });
  }

  if (topology) {
    if (options.topologyOutput) {
      const content = renderTopologyToString(topology, "markdown");
      fs.writeFileSync(options.topologyOutput, content);
    } else if (options.format !== "json") {
      const content = renderTopologyToString(topology, "markdown");
      process.stdout.write(includeReportOutput ? `\n${content}` : content);
    }
  }

  if (policyEvaluation?.failed) {
    await flushWritable(process.stdout);
    process.exit(1);
  }

  // Diff-scan threshold checks
  if (
    diffScan?.newDuplication &&
    options.failOnNewDuplicationPct !== undefined
  ) {
    if (
      diffScan.newDuplication.stats.duplicationPercentage >
      options.failOnNewDuplicationPct
    ) {
      process.stderr.write(
        `diff-dry-check: duplication ${diffScan.newDuplication.stats.duplicationPercentage}% exceeds threshold ${options.failOnNewDuplicationPct}%\n`,
      );
      await flushWritable(process.stdout);
      process.exit(1);
    }
  }

  if (
    options.failOnNewEnvVars &&
    diffScan?.newEnvVars &&
    diffScan.newEnvVars.length > 0
  ) {
    const names = diffScan.newEnvVars.map((v) => v.name).join(", ");
    process.stderr.write(
      `diff-env-check: ${diffScan.newEnvVars.length} new env var(s) detected: ${names}\n`,
    );
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
