#!/usr/bin/env bun
import fs from "fs";
import { stat } from "fs/promises";
import path from "path";
import { CliParseError, getHelpText, getVersion, parseArgs } from "./cli";
import {
  DETECTOR_CATALOG,
  DETECTOR_IDS,
  type DetectorId,
} from "./detectors/catalog";
import "./detectors/init";
import { shouldColor } from "./output/ansi";
import { renderJson } from "./output/json";
import { renderTable } from "./output/table";
import { scanRepo } from "./scanner";

const renderDetectorsOutput = (
  json: boolean,
  stream: NodeJS.WritableStream,
  color: boolean,
): void => {
  if (json) {
    renderJson({ detectors: DETECTOR_CATALOG }, stream, { color });
    return;
  }

  stream.write("Supported detectors\n");
  for (const detector of DETECTOR_CATALOG) {
    stream.write(`  - ${detector.id.padEnd(20)} ${detector.description}\n`);
  }
  stream.write(
    `\nUse with: repo-scanner --detectors ${DETECTOR_IDS.join(",")}\n`,
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
  COMPREPLY=( $(compgen -W "--help --version --path --json --no-color --detectors" -- "\${current}") )
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
    '--json[Output JSON]' \\
    '--no-color[Disable ANSI colors in JSON output]' \\
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
complete -c repo-scanner -l json -d "Output JSON"
complete -c repo-scanner -l no-color -d "Disable ANSI colors in JSON output"
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

const resolveExplicitDetectorIds = (
  options: ReturnType<typeof parseArgs>,
): readonly DetectorId[] => {
  const ids: DetectorId[] = [];
  if (options.languageDetector) ids.push("language");
  if (options.frameworkDetector) ids.push("framework");
  if (options.monorepoDetector) ids.push("monorepo");
  if (options.packageManagerDetector) ids.push("packageManager");
  if (options.ciProviderDetector) ids.push("ciProvider");
  if (options.buildSystemDetector) ids.push("buildSystem");
  if (options.containerizationDetector) ids.push("containerization");
  return ids;
};

// Swallow EPIPE from process.stdout — happens when a downstream consumer
// (e.g. `repo-scanner --json | head -5`) closes the pipe early. Without this
// handler, Node emits an unhandled 'error' event and crashes with a stack
// trace. Other stdout errors still propagate normally.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const main = async () => {
  const options = parseArgs(process.argv);
  if (options.detectorSelectionWarnings.length > 0) {
    for (const warning of options.detectorSelectionWarnings) {
      process.stderr.write(`[detectors] warning: ${warning}\n`);
    }
  }

  if (options.showVersion) {
    process.stdout.write(`${getVersion()}\n`);
    process.exit(0);
  }

  if (options.showHelp) {
    process.stdout.write(getHelpText());
    process.exit(0);
  }

  const color = shouldColor({
    noColor: options.noColor,
    isTTY: Boolean(process.stdout.isTTY),
  });

  if (options.showDetectors) {
    renderDetectorsOutput(options.json, process.stdout, color);
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

  try {
    const s = await stat(options.path);
    if (!s.isDirectory()) {
      process.stderr.write(`Error: ${options.path} is not a directory.\n`);
      process.exit(2);
    }
  } catch {
    process.stderr.write(`Error: no such directory: ${options.path}\n`);
    process.exit(2);
  }

  const explicitDetectorIds = resolveExplicitDetectorIds(options);
  const result =
    explicitDetectorIds.length > 0
      ? await scanRepo(options.path, { detectors: explicitDetectorIds })
      : await scanRepo(options.path);

  if (options.json) {
    renderJson(result as unknown as Record<string, unknown>, process.stdout, {
      color,
    });
  } else {
    renderTable(result, process.stdout);
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
