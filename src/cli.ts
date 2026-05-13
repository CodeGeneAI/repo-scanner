import { version as PACKAGE_VERSION } from "../package.json" with {
  type: "json",
};
import { DETECTOR_IDS, type DetectorId } from "./detectors/catalog";
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

Detector selection:
  --detectors <list>                 Comma-separated detector IDs
                                      Valid: ${VALID_DETECTOR_IDS_TEXT}

General:
  -p, --path <dir>                   Directory to scan (default: cwd)
  -f, --format <table|json>          Output format (default: table)
  --version, -v                      Show version
  --help, -h                         Show help

Examples:
  repo-scanner --detectors language,framework
  repo-scanner --detectors monorepo --format json
  repo-scanner detectors
  repo-scanner completion zsh > _repo-scanner
  repo-scanner completion install fish
  repo-scanner completion uninstall fish
`;

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
  const detectorSelectionWarnings: string[] = [];
  let languageDetector = false;
  let frameworkDetector = false;
  let monorepoDetector = false;
  const enableDetector = (detectorId: DetectorId): void => {
    switch (detectorId) {
      case "framework":
        frameworkDetector = true;
        return;
      case "language":
        languageDetector = true;
        return;
      case "monorepo":
        monorepoDetector = true;
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
        for (const detectorId of detectorIds) {
          const sources = detectorSources.get(detectorId) ?? [];
          sources.push("explicit");
          detectorSources.set(detectorId, sources);
        }
        const invalid = detectorIds.filter(
          (detectorId) => !VALID_DETECTOR_ID_SET.has(detectorId),
        );
        if (invalid.length > 0) {
          failCliParse(
            `Error: invalid detector ids "${invalid.join(",")}". Use one of ${VALID_DETECTOR_IDS_TEXT}.`,
          );
        }

        for (const detectorId of detectorIds) {
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
    detectorSelectionWarnings,
    languageDetector,
    frameworkDetector,
    monorepoDetector,
  };
};

export const getHelpText = () => HELP_TEXT;

export const getVersion = (): string => PACKAGE_VERSION;
