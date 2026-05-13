#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { CliParseError, getHelpText, getVersion, parseArgs } from "./cli";
import {
  DETECTOR_CATALOG,
  DETECTOR_IDS,
  DETECTOR_PRESETS,
  type DetectorId,
} from "./detectors/catalog";
import "./detectors/init";
import { setLargeFileThreshold } from "./detectors/large-file";
import { renderJson } from "./output/json";
import { renderTable } from "./output/table";
import {
  resolveScanProfile,
  SCAN_SECTIONS,
  type ScanSection,
} from "./scan-profile";
import { scanRepo } from "./scanner";
import type { RepoScanResult } from "./types";

const renderDetectorsOutput = (
  format: "table" | "json",
  schema: boolean,
  stream: NodeJS.WritableStream,
): void => {
  if (format === "json") {
    if (schema) {
      renderJson(
        {
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
  COMPREPLY=( $(compgen -W "--help --version --path --format --detectors" -- "\${current}") )
}
complete -F _repo_scanner repo-scanner
`;
  }
  if (shell === "zsh") {
    return `#compdef repo-scanner
_repo_scanner() {
  local -a detector_ids
  local context state state_descr line
  detector_ids=(${DETECTOR_IDS.join(" ")})
  _arguments -C \\
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
if (( $+functions[compdef] )); then
  compdef _repo_scanner repo-scanner
fi
# Autoloaded completion files are invoked as the filename-derived function
# (e.g. _repo-scanner). Dispatch to the actual implementation function.
if [[ "\${funcstack[1]}" == "_repo-scanner" ]]; then
  _repo_scanner "$@"
fi
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
  const targetPath = resolveCompletionInstallPath(shell);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, script);
  return targetPath;
};

const isWritableDirectory = (dirPath: string): boolean => {
  if (!fs.existsSync(dirPath)) return false;
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveHomebrewPrefixes = (): readonly string[] => {
  const prefixes = new Set<string>();
  const envPrefix = process.env.HOMEBREW_PREFIX;
  if (envPrefix && envPrefix.length > 0) {
    prefixes.add(envPrefix);
  }
  prefixes.add("/opt/homebrew");
  prefixes.add("/usr/local");
  return [...prefixes];
};

const resolveFirstWritableCandidate = (
  candidates: readonly string[],
): string | undefined => {
  for (const candidate of candidates) {
    if (isWritableDirectory(path.dirname(candidate))) {
      return candidate;
    }
  }
  return undefined;
};

const resolveZshFpathCompletionCandidates = (): readonly string[] => {
  try {
    const zshProcess = Bun.spawnSync(["zsh", "-ic", "print -l -- $fpath"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    if (zshProcess.exitCode !== 0) return [];

    const output = new TextDecoder().decode(zshProcess.stdout);
    const directories = output
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const uniqueDirectories = [...new Set(directories)];
    return uniqueDirectories.map((dirPath) =>
      path.join(dirPath, "_repo-scanner"),
    );
  } catch {
    return [];
  }
};

const resolveCompletionInstallPath = (
  shell: "bash" | "zsh" | "fish",
): string => {
  const homeDir = process.env.HOME ?? process.cwd();
  if (shell === "bash") {
    const homebrewCandidate = resolveFirstWritableCandidate(
      resolveHomebrewPrefixes().map((prefix) =>
        path.join(prefix, "etc", "bash_completion.d", "repo-scanner"),
      ),
    );
    if (homebrewCandidate) {
      return homebrewCandidate;
    }

    const xdgDataHome =
      process.env.XDG_DATA_HOME && process.env.XDG_DATA_HOME.length > 0
        ? process.env.XDG_DATA_HOME
        : path.join(homeDir, ".local", "share");
    return path.join(
      xdgDataHome,
      "bash-completion",
      "completions",
      "repo-scanner",
    );
  }
  if (shell === "zsh") {
    const zshFpathCandidate = resolveFirstWritableCandidate(
      resolveZshFpathCompletionCandidates(),
    );
    if (zshFpathCandidate) {
      return zshFpathCandidate;
    }

    const homebrewCandidate = resolveFirstWritableCandidate(
      resolveHomebrewPrefixes().map((prefix) =>
        path.join(prefix, "share", "zsh", "site-functions", "_repo-scanner"),
      ),
    );
    if (homebrewCandidate) {
      return homebrewCandidate;
    }

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
  options?: { fallbackToCoreSections?: boolean },
): readonly ScanSection[] =>
  selectedSections.length > 0 || options?.fallbackToCoreSections === false
    ? selectedSections
    : SCAN_SECTIONS;

type DetectorOutputEntry = {
  readonly key: string;
  readonly value: unknown;
};

const resolveLanguageSelectorOutput = (
  result: RepoScanResult,
): readonly string[] => {
  if (result.inventory.languages.length > 0) {
    return result.inventory.languages;
  }
  const languageNames = result.inventory.languageStats
    .map((entry) => entry.name.trim())
    .filter((name) => name.length > 0);
  return [...new Set(languageNames)];
};

const resolveDetectorOutputEntry = (
  result: RepoScanResult,
  detectorId: DetectorId,
): DetectorOutputEntry => {
  switch (detectorId) {
    case "build":
      return { key: "buildTools", value: result.inventory.buildTools };
    case "build-commands":
      return { key: "buildCommands", value: result.buildAndTest.buildCommands };
    case "ci":
      return { key: "ciSystems", value: result.buildAndTest.ciSystems };
    case "codebase-size":
      return {
        key: "codebaseSize",
        value: {
          totalFiles: result.inventory.totalFiles,
          totalLinesOfCode: result.inventory.totalLinesOfCode,
        },
      };
    case "code-quality":
      return { key: "codeQuality", value: result.inventory.codeQuality };
    case "complexity-hotspots":
      return {
        key: "complexityHotspots",
        value: result.inventory.complexityHotspots ?? [],
      };
    case "containerization":
      return {
        key: "containerization",
        value: result.inventory.containerization,
      };
    case "datastore":
      return { key: "datastores", value: result.inventory.datastores };
    case "dependency-manager":
      return {
        key: "dependencyManagers",
        value: result.inventory.dependencyManagers,
      };
    case "deployment-platform":
      return {
        key: "deploymentPlatforms",
        value: result.inventory.deploymentPlatforms,
      };
    case "external-services":
      return {
        key: "externalServices",
        value: result.inventory.externalServices ?? [],
      };
    case "framework":
      return { key: "frameworks", value: result.inventory.frameworks };
    case "iac":
      return { key: "iac", value: result.inventory.iac };
    case "language":
      return { key: "languages", value: resolveLanguageSelectorOutput(result) };
    case "language-stats":
      return { key: "languageStats", value: result.inventory.languageStats };
    case "large-file":
      return { key: "largeFiles", value: result.inventory.largeFiles ?? [] };
    case "lint-commands":
      return { key: "lintCommands", value: result.buildAndTest.lintCommands };
    case "linting":
      return { key: "linting", value: result.inventory.linting };
    case "monorepo":
      return { key: "monorepo", value: result.architecture.monorepo };
    case "repo-tools":
      return { key: "repoTools", value: result.inventory.repoTools };
    case "runtime":
      return { key: "runtimes", value: result.inventory.runtimes };
    case "test-commands":
      return { key: "testCommands", value: result.buildAndTest.testCommands };
    case "testing":
      return { key: "testing", value: result.inventory.testing };
    case "todo":
      return {
        key: "todoAnnotations",
        value: result.inventory.todoAnnotations ?? [],
      };
    case "vcs":
      return { key: "vcs", value: result.vcs ?? null };
  }
};

const buildDetectorJsonPayload = (
  result: RepoScanResult,
  detectorIds: readonly DetectorId[],
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  for (const detectorId of detectorIds) {
    const entry = resolveDetectorOutputEntry(result, detectorId);
    payload[entry.key] = entry.value;
  }
  return payload;
};

const renderDetectorTablePayload = (
  result: RepoScanResult,
  detectorIds: readonly DetectorId[],
  stream: NodeJS.WritableStream,
  includeHeader: boolean,
): void => {
  if (detectorIds.length === 0) return;
  if (includeHeader) {
    stream.write(
      `repo-scanner — scanned ${result.scanPath} in ${result.durationMs}ms\n`,
    );
  }

  for (const detectorId of detectorIds) {
    const { key, value } = resolveDetectorOutputEntry(result, detectorId);
    stream.write(`\n${key}\n`);
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      stream.write(`  ${String(value)}\n`);
      continue;
    }
    stream.write(`${JSON.stringify(value, null, 2)}\n`);
  }
};

const hasExplicitSectionOutputFlags = (
  options: ReturnType<typeof parseArgs>,
): boolean =>
  options.scanArchitecture ||
  options.scanInventory ||
  options.scanExternalServices ||
  options.scanBuildAndTest;

const hasAnyScanOutputSelectors = (
  options: ReturnType<typeof parseArgs>,
  scanProfile: ReturnType<typeof resolveScanProfile>,
): boolean =>
  options.allDetectors ||
  hasExplicitSectionOutputFlags(options) ||
  scanProfile.explicitDetectorOutputIds.length > 0;

const main = async () => {
  const options = parseArgs(process.argv);
  if (options.detectorSelectionWarnings.length > 0) {
    for (const warning of options.detectorSelectionWarnings) {
      process.stderr.write(`[detectors] warning: ${warning}\n`);
    }
  }
  setLargeFileThreshold(options.largeFileThreshold);

  if (options.showVersion) {
    process.stdout.write(`${getVersion()}\n`);
    process.exit(0);
  }

  if (options.showHelp) {
    process.stdout.write(getHelpText());
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
      if (
        options.completionShell === "zsh" &&
        installedPath ===
          path.join(
            process.env.HOME ?? process.cwd(),
            ".zfunc",
            "_repo-scanner",
          )
      ) {
        process.stdout.write(
          [
            "If completion is not loading, add this to ~/.zshrc:",
            '  fpath=("$HOME/.zfunc" $fpath)',
            "  autoload -Uz compinit && compinit",
            "",
          ].join("\n"),
        );
      }
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

  const scanProfile = resolveScanProfile(options);
  if (!hasAnyScanOutputSelectors(options, scanProfile)) {
    process.stdout.write(getHelpText());
    process.exit(0);
  }

  const result = await scanRepo(options.path, {
    enabledDetectorIds: scanProfile.enabledDetectorIds,
  });

  const sectionOutputExplicitlyRequested =
    hasExplicitSectionOutputFlags(options) || options.allDetectors;
  const detectorOutputExplicitlyRequested =
    scanProfile.explicitDetectorOutputIds.length > 0;
  const nonSectionOutputExplicitlyRequested = detectorOutputExplicitlyRequested;
  const includeSectionOutput =
    scanProfile.allDetectors || sectionOutputExplicitlyRequested;
  const includeMetadataEnvelope =
    !scanProfile.allDetectors &&
    !includeSectionOutput &&
    nonSectionOutputExplicitlyRequested;

  if (options.format === "json") {
    const renderedSections = resolveRenderedSections(
      scanProfile.selectedSections,
    );
    const jsonPayload: Record<string, unknown> = scanProfile.allDetectors
      ? ({ ...result } as Record<string, unknown>)
      : includeSectionOutput
        ? buildSectionJsonPayload(result, renderedSections)
        : includeMetadataEnvelope
          ? {
              scanPath: result.scanPath,
              timestamp: result.timestamp,
              durationMs: result.durationMs,
            }
          : {};

    if (detectorOutputExplicitlyRequested) {
      Object.assign(
        jsonPayload,
        buildDetectorJsonPayload(result, scanProfile.explicitDetectorOutputIds),
      );
    }
    renderJson(jsonPayload, process.stdout);
  } else {
    let renderedMainTable = false;
    if (scanProfile.allDetectors || includeSectionOutput) {
      const renderedSections = resolveRenderedSections(
        scanProfile.selectedSections,
      );
      renderTable(result, process.stdout, {
        selectedSections: scanProfile.allDetectors
          ? undefined
          : includeSectionOutput
            ? renderedSections
            : [],
        includeSignals: scanProfile.allDetectors,
      });
      renderedMainTable = true;
    }

    if (detectorOutputExplicitlyRequested) {
      renderDetectorTablePayload(
        result,
        scanProfile.explicitDetectorOutputIds,
        process.stdout,
        !renderedMainTable,
      );
    }
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
