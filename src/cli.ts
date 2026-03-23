import os from "os";
import type {
  DependencyComponentGroupingMode,
  Ecosystem,
  OutdatedThreshold,
  VulnerabilitySeverity,
} from "./dependency/types";
import {
  DETECTOR_IDS,
  DETECTOR_PRESETS,
  type DetectorId,
  type DetectorPreset,
} from "./detectors/catalog";
import { ALL_DIAGRAM_KINDS } from "./output/topology/types";
import type { CliOptions, DiagramKind } from "./types";
import { BUILD_SHA } from "./update/build-version";

const VALID_DIAGRAM_KINDS = new Set<DiagramKind>(ALL_DIAGRAM_KINDS);

export class CliParseError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliParseError";
    this.exitCode = exitCode;
  }
}

const VALID_ECOSYSTEMS = new Set<Ecosystem>([
  "npm",
  "pypi",
  "go",
  "cargo",
  "rubygems",
  "maven",
  "nuget",
  "packagist",
  "cocoapods",
  "pub",
  "conan",
]);

const VALID_SEVERITIES = new Set<VulnerabilitySeverity>([
  "UNKNOWN",
  "LOW",
  "MODERATE",
  "HIGH",
  "CRITICAL",
]);

const VALID_OUTDATED_THRESHOLDS = new Set<OutdatedThreshold>([
  "patch",
  "minor",
  "major",
]);

const VALID_COMPONENT_GROUPING_MODES = new Set<DependencyComponentGroupingMode>(
  ["default", "apps-only", "services-only", "workspace-package"],
);

const VALID_DETECTOR_ID_SET = new Set<string>(DETECTOR_IDS);
const VALID_DETECTOR_IDS_TEXT = DETECTOR_IDS.join(",");

const HELP_TEXT = `repo-scanner — universal repository scanner

Usage: repo-scanner [command] [options]

Commands:
  update                             Check for updates and install latest binary
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

Dependency analysis:
  --deps                             Enable dependency analysis
  --ecosystems <list>                Limit ecosystems (npm,pypi,go,cargo,rubygems,maven,nuget,packagist,cocoapods,pub,conan)
  --no-usage                         Skip dependency usage scan
  --no-security                      Skip vulnerability checks
  --no-version-lookup                Skip registry version lookups
  --concurrency <n>                  Max dependency lookup concurrency (default: CPU count)
  --component-grouping <mode>        Group dependency summary by default|apps-only|services-only|workspace-package
  --deps-debug                       Emit dependency debug diagnostics to stderr

Policy gates (CI):
  --fail-on-vulns                    Exit 1 when vulnerability threshold is met
  --fail-on-vulns-count <n>          Exit 1 when vulnerability matches >= n
  --severity-threshold <level>       unknown|low|moderate|high|critical (default: low)
  --fail-on-outdated                 Exit 1 when update threshold is met
  --fail-on-outdated-count <n>       Exit 1 when outdated matches >= n
  --outdated-threshold <level>       patch|minor|major (default: patch)
  --fail-on-dead-deps                Exit 1 when unused dependencies are found
  --fail-on-dead-deps-count <n>      Exit 1 when dead dependency count >= n
  --include-dev-dead-deps            Include dev dependencies in dead-dependency checks

Specialized scans:
  --dry-check                        Duplication-only scan with dry-check output
  --diff <git-range>                 Diff-focused scan (e.g. HEAD~1, main...feature)
  --diff-dry-check                   Run duplication scan for changed files
  --diff-dry-include-tests           Include tests in diff duplication scan
  --diff-env-check                   Check net-new env vars in changed files
  --fail-on-new-duplication-pct <n>  Exit 1 if diff duplication percentage exceeds n
  --fail-on-new-env-vars             Exit 1 if diff introduces new env vars
  --topology                         Generate mermaid topology diagrams
  --topology-diagrams <list>         architecture|dependency|dataflow|api-topology|erd|call-graph
  --topology-output <path>           Write topology markdown to file

General:
  -p, --path <dir>                   Directory to scan (default: cwd)
  -f, --format <table|json>          Output format (default: table)
  --env-include-tests                Include test files in env-var detection
  --large-file-threshold <n>         Large-file threshold in lines (default: 500)
  --min-tokens <n>                   Duplication token window (default: 50)
  --min-lines <n>                    Minimum duplicate lines (default: 6)
  --extensions <list>                Duplication file extensions (comma-separated)
  --min-unique-ratio <f>             Duplication distinct token floor (0..1, default: 0.10)
  --max-literal-ratio <f>            Duplication literal token ceiling (0..1, default: 0.50)
  --no-barrel-filter                 Disable barrel re-export duplication filtering
  --solid                            Enable SOLID analysis detector
  --solid-threshold <n>              SOLID score threshold (default: 80)
  --no-update-check                  Suppress background update check
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
  repo-scanner --deps --fail-on-vulns --severity-threshold high
  repo-scanner --deps --fail-on-outdated --outdated-threshold minor
  repo-scanner --diff main...HEAD --diff-dry-check --diff-env-check
`;

const parseSeverity = (raw: string): VulnerabilitySeverity | undefined => {
  const normalized = raw.trim().toUpperCase();
  if (!VALID_SEVERITIES.has(normalized as VulnerabilitySeverity)) {
    return undefined;
  }
  return normalized as VulnerabilitySeverity;
};

const parseOutdatedThreshold = (raw: string): OutdatedThreshold | undefined => {
  const normalized = raw.trim().toLowerCase();
  if (!VALID_OUTDATED_THRESHOLDS.has(normalized as OutdatedThreshold)) {
    return undefined;
  }
  return normalized as OutdatedThreshold;
};

const parseComponentGroupingMode = (
  raw: string,
): DependencyComponentGroupingMode | undefined => {
  const normalized = raw.trim().toLowerCase();
  if (
    !VALID_COMPONENT_GROUPING_MODES.has(
      normalized as DependencyComponentGroupingMode,
    )
  ) {
    return undefined;
  }
  return normalized as DependencyComponentGroupingMode;
};

const parsePositiveInteger = (raw: string): number | undefined => {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
};

const parseUnitInterval = (raw: string): number | undefined => {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
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
  let showUpdate = false;
  let showDetectors = false;
  let completionShell: "bash" | "zsh" | "fish" | undefined;
  let completionInstall = false;
  let completionUninstall = false;
  let detectorsSchema = false;
  const detectorSelectionWarnings: string[] = [];
  let noUpdateCheck = false;
  let scanArchitecture = false;
  let scanInventory = false;
  let scanExternalServices = false;
  let scanBuildAndTest = false;
  let allDetectors = false;
  let dryCheck = false;
  let deps = false;
  let depsDebug = false;
  let ecosystems: Ecosystem[] | undefined;
  let skipUsage = false;
  let skipSecurity = false;
  let skipVersionLookup = false;
  let concurrency = os.cpus().length;
  let componentGrouping: DependencyComponentGroupingMode = "default";
  let failOnVulns = false;
  let failOnVulnsCount: number | undefined;
  let severityThreshold: VulnerabilitySeverity = "LOW";
  let failOnOutdated = false;
  let failOnOutdatedCount: number | undefined;
  let outdatedThreshold: OutdatedThreshold = "patch";
  let largeFileThreshold = 500;
  let minTokens = 50;
  let minLines = 6;
  let extensions: string[] = [];
  let minUniqueRatio = 0.1;
  let maxLiteralRatio = 0.5;
  let ignoreBarrelExports = true;
  let solid = false;
  let callGraph = false;
  let solidThreshold = 80;
  let envIncludeTests = false;
  let topology = false;
  let topologyDiagrams: DiagramKind[] | undefined;
  let topologyOutput: string | undefined;
  let diff: string | undefined;
  let diffDryCheck = false;
  let diffDryIncludeTests = false;
  let diffEnvCheck = false;
  let failOnNewDuplicationPct: number | undefined;
  let failOnNewEnvVars = false;
  let failOnDeadDeps = false;
  let failOnDeadDepsCount: number | undefined;
  let includeDevDeadDeps = false;
  let dbSchema = false;
  let env = false;
  let namingConvention = false;
  let runtime = false;
  let largeFile = false;
  let todo = false;
  let deadExport = false;
  let codeDuplication = false;
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
  let apiSurfaceDetector = false;
  let vcs = false;
  const enableDetector = (detectorId: DetectorId): void => {
    switch (detectorId) {
      case "api-surface":
        apiSurfaceDetector = true;
        return;
      case "build":
        buildDetector = true;
        return;
      case "build-commands":
        buildCommandsDetector = true;
        return;
      case "call-graph":
        callGraph = true;
        return;
      case "ci":
        ciDetector = true;
        return;
      case "codebase-size":
        codebaseSizeDetector = true;
        return;
      case "code-duplication":
        codeDuplication = true;
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
      case "db-schema":
        dbSchema = true;
        return;
      case "dead-export":
        deadExport = true;
        return;
      case "dependency-manager":
        dependencyManagerDetector = true;
        return;
      case "deployment-platform":
        deploymentPlatformDetector = true;
        return;
      case "env":
        env = true;
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
      case "naming-convention":
        namingConvention = true;
        return;
      case "repo-tools":
        repoToolsDetector = true;
        return;
      case "runtime":
        runtime = true;
        return;
      case "solid-health":
        solid = true;
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
  if (command === "update") {
    showUpdate = true;
    args.splice(0, 1);
  } else if (command === "detectors") {
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
      case "--no-update-check":
        noUpdateCheck = true;
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
      case "--deps":
        deps = true;
        break;
      case "--dry-check":
        dryCheck = true;
        break;
      case "--deps-debug":
        depsDebug = true;
        break;
      case "--ecosystems": {
        const tokens = parseCommaSeparatedValues(args[++i], "--ecosystems");

        const invalid = tokens.filter(
          (value) => !VALID_ECOSYSTEMS.has(value as Ecosystem),
        );

        if (invalid.length > 0) {
          failCliParse(
            `Error: invalid ecosystems "${invalid.join(",")}". Use one of npm,pypi,go,cargo,rubygems,maven,nuget,packagist,cocoapods,pub,conan.`,
          );
        }

        ecosystems = [...new Set(tokens)] as Ecosystem[];
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
      case "--no-usage":
        skipUsage = true;
        break;
      case "--no-security":
        skipSecurity = true;
        break;
      case "--no-version-lookup":
        skipVersionLookup = true;
        break;
      case "--concurrency":
        concurrency = parseRequiredPositiveIntegerOption(
          args[++i],
          "--concurrency",
        );
        break;
      case "--component-grouping": {
        const raw = args[++i] ?? "";
        const parsed =
          parseComponentGroupingMode(raw) ??
          failCliParse(
            `Error: invalid component grouping mode "${raw}". Use one of default,apps-only,services-only,workspace-package.`,
          );
        componentGrouping = parsed;
        break;
      }
      case "--fail-on-vulns":
        failOnVulns = true;
        break;
      case "--fail-on-vulns-count": {
        failOnVulnsCount = parseRequiredPositiveIntegerOption(
          args[++i],
          "--fail-on-vulns-count",
        );
        break;
      }
      case "--severity-threshold": {
        const raw = args[++i] ?? "";
        const parsed =
          parseSeverity(raw) ??
          failCliParse(
            `Error: invalid severity threshold "${raw}". Use one of unknown,low,moderate,high,critical.`,
          );
        severityThreshold = parsed;
        break;
      }
      case "--fail-on-outdated":
        failOnOutdated = true;
        break;
      case "--fail-on-outdated-count": {
        failOnOutdatedCount = parseRequiredPositiveIntegerOption(
          args[++i],
          "--fail-on-outdated-count",
        );
        break;
      }
      case "--outdated-threshold": {
        const raw = args[++i] ?? "";
        const parsed =
          parseOutdatedThreshold(raw) ??
          failCliParse(
            `Error: invalid outdated threshold "${raw}". Use one of patch,minor,major.`,
          );
        outdatedThreshold = parsed;
        break;
      }
      case "--large-file-threshold":
        largeFileThreshold = parseRequiredPositiveIntegerOption(
          args[++i],
          "--large-file-threshold",
        );
        break;
      case "--min-tokens":
        minTokens = parseRequiredPositiveIntegerOption(
          args[++i],
          "--min-tokens",
        );
        break;
      case "--min-lines":
        minLines = parseRequiredPositiveIntegerOption(args[++i], "--min-lines");
        break;
      case "--extensions":
        extensions = (args[++i] ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
          .map((value) => (value.startsWith(".") ? value : `.${value}`));
        break;
      case "--min-unique-ratio": {
        const raw = args[++i] ?? "";
        minUniqueRatio =
          parseUnitInterval(raw) ??
          failCliParse(
            `Error: invalid min-unique-ratio "${raw}". Value must be between 0 and 1.`,
          );
        break;
      }
      case "--max-literal-ratio": {
        const raw = args[++i] ?? "";
        maxLiteralRatio =
          parseUnitInterval(raw) ??
          failCliParse(
            `Error: invalid max-literal-ratio "${raw}". Value must be between 0 and 1.`,
          );
        break;
      }
      case "--no-barrel-filter":
        ignoreBarrelExports = false;
        break;
      case "--env-include-tests":
        envIncludeTests = true;
        break;
      case "--solid":
        solid = true;
        break;
      case "--solid-threshold":
        solidThreshold = parseRequiredPositiveIntegerOption(
          args[++i],
          "--solid-threshold",
        );
        break;
      case "--topology":
        topology = true;
        break;
      case "--topology-diagrams": {
        const tokens = parseCommaSeparatedValues(
          args[++i],
          "--topology-diagrams",
        );

        const invalid = tokens.filter(
          (value) => !VALID_DIAGRAM_KINDS.has(value as DiagramKind),
        );

        if (invalid.length > 0) {
          failCliParse(
            `Error: invalid diagram types "${invalid.join(",")}". Use one of ${ALL_DIAGRAM_KINDS.join(",")}.`,
          );
        }

        topologyDiagrams = [...new Set(tokens)] as DiagramKind[];
        topology = true;
        break;
      }
      case "--topology-output":
        topologyOutput =
          args[++i] ??
          failCliParse("Error: --topology-output requires a file path.");
        if (isFlagToken(topologyOutput)) {
          failCliParse("Error: --topology-output requires a file path.");
        }
        topology = true;
        break;
      case "--diff": {
        const value =
          args[++i] ??
          failCliParse("Error: --diff requires a git range value.");
        if (isFlagToken(value)) {
          failCliParse("Error: --diff requires a git range value.");
        }
        diff = value;
        break;
      }
      case "--diff-dry-check":
        diffDryCheck = true;
        break;
      case "--diff-dry-include-tests":
        diffDryIncludeTests = true;
        break;
      case "--diff-env-check":
        diffEnvCheck = true;
        break;
      case "--fail-on-new-duplication-pct": {
        const raw =
          args[++i] ??
          failCliParse(
            "Error: --fail-on-new-duplication-pct requires a numeric value.",
          );
        if (isFlagToken(raw)) {
          failCliParse(
            "Error: --fail-on-new-duplication-pct requires a numeric value.",
          );
        }
        const parsed = Number.parseFloat(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          failCliParse(
            `Error: invalid fail-on-new-duplication-pct "${raw}". Value must be a non-negative number.`,
          );
        }
        failOnNewDuplicationPct = parsed;
        break;
      }
      case "--fail-on-new-env-vars":
        failOnNewEnvVars = true;
        break;
      case "--fail-on-dead-deps":
        failOnDeadDeps = true;
        break;
      case "--fail-on-dead-deps-count":
        failOnDeadDepsCount = parseRequiredPositiveIntegerOption(
          args[++i],
          "--fail-on-dead-deps-count",
        );
        break;
      case "--include-dev-dead-deps":
        includeDevDeadDeps = true;
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
    showUpdate,
    showDetectors,
    completionShell,
    completionInstall,
    completionUninstall,
    detectorsSchema,
    detectorSelectionWarnings,
    noUpdateCheck,
    scanArchitecture,
    scanInventory,
    scanExternalServices,
    scanBuildAndTest,
    allDetectors,
    dryCheck,
    deps,
    depsDebug,
    ecosystems,
    skipUsage,
    skipSecurity,
    skipVersionLookup,
    concurrency,
    componentGrouping,
    failOnVulns,
    failOnVulnsCount,
    severityThreshold,
    failOnOutdated,
    failOnOutdatedCount,
    outdatedThreshold,
    largeFileThreshold,
    minTokens,
    minLines,
    extensions,
    minUniqueRatio,
    maxLiteralRatio,
    ignoreBarrelExports,
    solid,
    callGraph,
    solidThreshold,
    envIncludeTests,
    topology,
    topologyDiagrams,
    topologyOutput,
    diff,
    diffDryCheck,
    diffDryIncludeTests,
    diffEnvCheck,
    failOnNewDuplicationPct,
    failOnNewEnvVars,
    failOnDeadDeps,
    failOnDeadDepsCount,
    includeDevDeadDeps,
    dbSchema,
    env,
    namingConvention,
    runtime,
    largeFile,
    todo,
    deadExport,
    codeDuplication,
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
    apiSurfaceDetector,
    vcs,
  };
};

export const getHelpText = () => HELP_TEXT;

export const getVersion = (): string => BUILD_SHA;
