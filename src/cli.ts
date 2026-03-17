import os from "os";
import type {
  DependencyComponentGroupingMode,
  Ecosystem,
  OutdatedThreshold,
  VulnerabilitySeverity,
} from "./dependency/types";
import type { CliOptions } from "./types";

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

const HELP_TEXT = `repo-scanner - Universal repository structure scanner

Usage: repo-scanner [options]

Options:
  --path <dir>                Directory to scan (default: cwd)
  --format <fmt>              Output format: table | json (default: table)
  --dry-check                 Run duplication-only scan with dry-check output contract
  --deps                      Enable deep dependency analysis
  --deps-debug                Emit dependency debug diagnostics to stderr
  --ecosystems <list>         Comma-separated ecosystems to scan (default: all)
                              Valid: npm,pypi,go,cargo,rubygems,maven,nuget,packagist,cocoapods,pub,conan
  --no-usage                  Skip dependency usage scanning
  --no-security               Skip vulnerability checks
  --no-version-lookup         Skip registry version lookups
  --concurrency <n>           Max dependency scan parallel operations (default: CPU count)
  --component-grouping <m>    Component grouping for dependency summaries
                              Valid: default,apps-only,services-only,workspace-package (default: default)
  --fail-on-vulns             Exit with code 1 when vulnerabilities match threshold
  --fail-on-vulns-count <n>   Exit with code 1 when vulnerability matches >= n
  --severity-threshold <lvl>  Vulnerability threshold for --fail-on-vulns
                              Valid: unknown,low,moderate,high,critical (default: low)
  --fail-on-outdated          Exit with code 1 when updates match outdated threshold
  --fail-on-outdated-count <n> Exit with code 1 when outdated matches >= n
  --outdated-threshold <lvl>  Update threshold for --fail-on-outdated
                              Valid: patch,minor,major (default: patch)
  --large-file-threshold <n>  Line count threshold for large file detection (default: 500)
  --min-tokens <n>            Minimum token window for duplication detection (default: 50)
  --min-lines <n>             Minimum duplicate lines to report (default: 6)
  --extensions <list>         Comma-separated file extensions for duplication scan
  --min-unique-ratio <f>      Min distinct/total token ratio for duplication filtering (default: 0.10)
  --max-literal-ratio <f>     Max literal token ratio for duplication filtering (default: 0.50)
  --no-barrel-filter          Disable barrel re-export duplication filtering
  --solid                     Enable SOLID principles analysis (uses tree-sitter AST)
  --solid-threshold <n>       SOLID score threshold for reporting (default: 80)
  --env-include-tests         Include test files in env var detection
  --version, -v               Show version number
  --help, -h                  Show this help text
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
  let solidThreshold = 80;
  let envIncludeTests = false;

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
      case "--path":
        pathArg = args[++i] ?? pathArg;
        break;
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
        const raw = args[++i];
        if (!raw || isFlagToken(raw)) {
          failCliParse("Error: --ecosystems requires a comma-separated value.");
        }

        const tokens = raw
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0);

        if (tokens.length === 0) {
          failCliParse(
            "Error: --ecosystems must include at least one ecosystem.",
          );
        }

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
    }
  }

  return {
    path: pathArg,
    format,
    showHelp,
    showVersion,
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
    solidThreshold,
    envIncludeTests,
  };
};

export const getHelpText = () => HELP_TEXT;

export const getVersion = async (): Promise<string> => {
  const { default: pkg } = await import("../package.json");
  return pkg.version;
};
