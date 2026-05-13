import { version as PACKAGE_VERSION } from "../package.json" with {
  type: "json",
};
import {
  DETECTOR_IDS,
  DETECTOR_PRESETS,
  type DetectorId,
  type DetectorPreset,
} from "./detectors/catalog";
import type { CliOptions } from "./types";

export class CliParseError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliParseError";
    this.exitCode = exitCode;
  }
}

const VALID_DETECTOR_ID_SET = new Set<string>(DETECTOR_IDS);
const VALID_DETECTOR_IDS_TEXT = DETECTOR_IDS.join(",");

const HELP_TEXT = `repo-scanner — universal repository scanner

Usage: repo-scanner [command] [options]

Commands:
  detectors                          List supported detector IDs
  completion <shell>                 Generate shell completion script (bash|zsh|fish)
  completion install <shell>         Install completion script for your shell
  completion uninstall <shell>       Remove installed completion script for your shell

Core output profile:
  --architecture                     Render Architecture section only
  --inventory                        Render Inventory section only
  --external-services                Render External Services section only
  --build-and-test                   Render Build & Test section only
  --all-detectors, --full-scan       Enable all detectors and Signals output
  --detectors <list>                 Comma-separated detector IDs (advanced)
                                      Valid: ${VALID_DETECTOR_IDS_TEXT}
                                      Presets: @inventory,@quality,@architecture

General:
  -p, --path <dir>                   Directory to scan (default: cwd)
  -f, --format <table|json>          Output format (default: table)
  --large-file-threshold <n>         Large-file threshold in lines (default: 500)
  --version, -v                      Show version
  --help, -h                         Show help
  --schema                           JSON schema payload mode for detectors JSON output

Examples:
  repo-scanner --inventory
  repo-scanner --detectors @inventory,@quality
  repo-scanner detectors
  repo-scanner detectors --format json --schema
  repo-scanner completion zsh > _repo-scanner
  repo-scanner completion install fish
  repo-scanner completion uninstall fish
`;

const parsePositiveInteger = (raw: string): number | undefined => {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
};

const parseCommaSeparatedValues = (
  raw: string | undefined,
  optionName: string,
): string[] => {
  const value =
    raw ??
    failCliParse(`Error: ${optionName} requires a comma-separated value.`);
  if (isFlagToken(value)) {
    failCliParse(`Error: ${optionName} requires a comma-separated value.`);
  }

  const values = value
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    failCliParse(`Error: ${optionName} must include at least one value.`);
  }

  return values;
};

const isFlagToken = (raw: string | undefined): boolean =>
  raw?.startsWith("--") ?? false;

const failCliParse = (message: string): never => {
  throw new CliParseError(message);
};

const parseRequiredPositiveIntegerOption = (
  raw: string | undefined,
  optionName: string,
): number => {
  const value =
    raw ??
    failCliParse(`Error: ${optionName} requires a positive integer value.`);

  if (isFlagToken(value)) {
    failCliParse(`Error: ${optionName} requires a positive integer value.`);
  }

  return (
    parsePositiveInteger(value) ??
    failCliParse(
      `Error: invalid ${optionName.replace(/^--/, "")} "${value}". Value must be a positive integer.`,
    )
  );
};

export const parseArgs = (argv: string[]): CliOptions => {
  const args = argv.slice(2);
  let pathArg = process.cwd();
  let format: "table" | "json" = "table";
  let showHelp = false;
  let showVersion = false;
  let showDetectors = false;
  let completionShell: "bash" | "zsh" | "fish" | undefined;
  let completionInstall = false;
  let completionUninstall = false;
  let detectorsSchema = false;
  const detectorSelectionWarnings: string[] = [];
  let scanArchitecture = false;
  let scanInventory = false;
  let scanExternalServices = false;
  let scanBuildAndTest = false;
  let allDetectors = false;
  let largeFileThreshold = 500;
  let runtime = false;
  let largeFile = false;
  let todo = false;
  let complexityHotspots = false;
  let languageDetector = false;
  let languageStatsDetector = false;
  let codebaseSizeDetector = false;
  let frameworkDetector = false;
  let monorepoDetector = false;
  let componentsDetector = false;
  let dependencyManagerDetector = false;
  let ciDetector = false;
  let containerizationDetector = false;
  let iacDetector = false;
  let testingDetector = false;
  let datastoreDetector = false;
  let lintingDetector = false;
  let buildDetector = false;
  let buildCommandsDetector = false;
  let testCommandsDetector = false;
  let lintCommandsDetector = false;
  let repoToolsDetector = false;
  let crossPackageDepsDetector = false;
  let circularDepsDetector = false;
  let layerViolationsDetector = false;
  let highImpactComponentsDetector = false;
  let codeQualityDetector = false;
  let deploymentPlatformDetector = false;
  let externalServicesDetector = false;
  let vcs = false;
  const enableDetector = (detectorId: DetectorId): void => {
    switch (detectorId) {
      case "build":
        buildDetector = true;
        return;
      case "build-commands":
        buildCommandsDetector = true;
        return;
      case "ci":
        ciDetector = true;
        return;
      case "codebase-size":
        codebaseSizeDetector = true;
        return;
      case "code-quality":
        codeQualityDetector = true;
        return;
      case "complexity-hotspots":
        complexityHotspots = true;
        return;
      case "components":
        componentsDetector = true;
        return;
      case "containerization":
        containerizationDetector = true;
        return;
      case "circular-deps":
        circularDepsDetector = true;
        return;
      case "cross-package-deps":
        crossPackageDepsDetector = true;
        return;
      case "datastore":
        datastoreDetector = true;
        return;
      case "dependency-manager":
        dependencyManagerDetector = true;
        return;
      case "deployment-platform":
        deploymentPlatformDetector = true;
        return;
      case "external-services":
        externalServicesDetector = true;
        return;
      case "framework":
        frameworkDetector = true;
        return;
      case "high-impact-components":
        highImpactComponentsDetector = true;
        return;
      case "iac":
        iacDetector = true;
        return;
      case "language-stats":
        languageStatsDetector = true;
        return;
      case "language":
        languageDetector = true;
        return;
      case "large-file":
        largeFile = true;
        return;
      case "linting":
        lintingDetector = true;
        return;
      case "layer-violations":
        layerViolationsDetector = true;
        return;
      case "lint-commands":
        lintCommandsDetector = true;
        return;
      case "monorepo":
        monorepoDetector = true;
        return;
      case "repo-tools":
        repoToolsDetector = true;
        return;
      case "runtime":
        runtime = true;
        return;
      case "testing":
        testingDetector = true;
        return;
      case "test-commands":
        testCommandsDetector = true;
        return;
      case "todo":
        todo = true;
        return;
      case "vcs":
        vcs = true;
        return;
    }
  };

  // Detect positional subcommand as the first non-flag argument.
  const command = args[0];
  if (command === "detectors") {
    showDetectors = true;
    args.splice(0, 1);
  } else if (command === "completion") {
    const completionAction = args[1];
    const isInstall = completionAction === "install";
    const isUninstall = completionAction === "uninstall";
    const shellIndex = isInstall || isUninstall ? 2 : 1;
    const shell = args[shellIndex];
    if (!shell || isFlagToken(shell)) {
      failCliParse("Error: completion requires a shell: bash, zsh, or fish.");
    }
    if (shell !== "bash" && shell !== "zsh" && shell !== "fish") {
      failCliParse(
        `Error: invalid completion shell "${shell}". Use bash, zsh, or fish.`,
      );
    }
    completionShell = shell as "bash" | "zsh" | "fish";
    completionInstall = isInstall;
    completionUninstall = isUninstall;
    args.splice(0, isInstall || isUninstall ? 3 : 2);
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    switch (arg) {
      case "--version":
      case "-v":
        showVersion = true;
        break;
      case "--help":
      case "-h":
        showHelp = true;
        break;
      case "--architecture":
        scanArchitecture = true;
        break;
      case "--inventory":
        scanInventory = true;
        break;
      case "--external-services":
        scanExternalServices = true;
        break;
      case "--build-and-test":
        scanBuildAndTest = true;
        break;
      case "--all-detectors":
      case "--full-scan":
        allDetectors = true;
        break;
      case "-p":
      case "--path":
        pathArg = args[++i] ?? pathArg;
        break;
      case "-f":
      case "--format": {
        const fmtArg = args[++i];
        const fmt = fmtArg ?? "table";
        if (fmt !== "table" && fmt !== "json") {
          failCliParse(
            `Error: invalid format "${fmt}". Must be "table" or "json".`,
          );
        }
        format = fmt as "table" | "json";
        break;
      }
      case "--detectors": {
        const detectorIds = parseCommaSeparatedValues(args[++i], "--detectors");
        const detectorSources = new Map<string, string[]>();
        const expandedDetectorIds = detectorIds.flatMap((detectorId) => {
          if (detectorId.startsWith("@")) {
            const preset = DETECTOR_PRESETS[detectorId as DetectorPreset];
            if (preset) {
              for (const resolvedId of preset) {
                const sources = detectorSources.get(resolvedId) ?? [];
                sources.push(detectorId);
                detectorSources.set(resolvedId, sources);
              }
              return [...preset];
            }
            return [detectorId];
          }
          const sources = detectorSources.get(detectorId) ?? [];
          sources.push("explicit");
          detectorSources.set(detectorId, sources);
          return [detectorId];
        });
        const invalid = expandedDetectorIds.filter(
          (detectorId) => !VALID_DETECTOR_ID_SET.has(detectorId),
        );
        if (invalid.length > 0) {
          failCliParse(
            `Error: invalid detector ids "${invalid.join(",")}". Use one of ${VALID_DETECTOR_IDS_TEXT} or presets @inventory,@quality,@architecture.`,
          );
        }

        for (const detectorId of expandedDetectorIds) {
          enableDetector(detectorId as DetectorId);
        }

        for (const [detectorId, sources] of detectorSources.entries()) {
          if (sources.length <= 1) continue;
          detectorSelectionWarnings.push(
            `detector "${detectorId}" selected multiple times (${sources.join(" + ")})`,
          );
        }
        break;
      }
      case "--schema":
        detectorsSchema = true;
        break;
      case "--large-file-threshold":
        largeFileThreshold = parseRequiredPositiveIntegerOption(
          args[++i],
          "--large-file-threshold",
        );
        break;
      case "--vcs":
        vcs = true;
        break;
      default:
        if (arg.startsWith("-")) {
          failCliParse(`Error: unknown option "${arg}". Use --help for usage.`);
        }
        failCliParse(
          `Error: unexpected argument "${arg}". Use --help for usage.`,
        );
    }
  }

  return {
    path: pathArg,
    format,
    showHelp,
    showVersion,
    showDetectors,
    completionShell,
    completionInstall,
    completionUninstall,
    detectorsSchema,
    detectorSelectionWarnings,
    scanArchitecture,
    scanInventory,
    scanExternalServices,
    scanBuildAndTest,
    allDetectors,
    largeFileThreshold,
    runtime,
    largeFile,
    todo,
    complexityHotspots,
    languageDetector,
    languageStatsDetector,
    codebaseSizeDetector,
    frameworkDetector,
    monorepoDetector,
    componentsDetector,
    dependencyManagerDetector,
    ciDetector,
    containerizationDetector,
    iacDetector,
    testingDetector,
    datastoreDetector,
    lintingDetector,
    buildDetector,
    buildCommandsDetector,
    testCommandsDetector,
    lintCommandsDetector,
    repoToolsDetector,
    crossPackageDepsDetector,
    circularDepsDetector,
    layerViolationsDetector,
    highImpactComponentsDetector,
    codeQualityDetector,
    deploymentPlatformDetector,
    externalServicesDetector,
    vcs,
  };
};

export const getHelpText = () => HELP_TEXT;

export const getVersion = (): string => PACKAGE_VERSION;
