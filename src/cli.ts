import type { CliOptions } from "./types";

const HELP_TEXT = `repo-scanner - Universal repository structure scanner

Usage: repo-scanner [options]

Options:
  --path <dir>     Directory to scan (default: cwd)
  --format <fmt>   Output format: table | json (default: table)
  --help, -h       Show this help text
`;

export const parseArgs = (argv: string[]): CliOptions => {
  const args = argv.slice(2);
  let pathArg = process.cwd();
  let format: "table" | "json" = "table";
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    switch (arg) {
      case "--help":
      case "-h":
        showHelp = true;
        break;
      case "--path":
        pathArg = args[++i] ?? pathArg;
        break;
      case "--format": {
        const fmt: string = args[++i] ?? format;
        if (fmt !== "table" && fmt !== "json") {
          console.error(
            `Error: invalid format "${fmt}". Must be "table" or "json".`,
          );
          process.exit(1);
        }
        format = fmt;
        break;
      }
    }
  }

  return { path: pathArg, format, showHelp };
};

export const getHelpText = () => HELP_TEXT;
