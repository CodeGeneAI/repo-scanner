import type { DryCheckResult } from "../code-duplication/types";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

export const renderDryCheckJson = (
  result: DryCheckResult,
  stream: NodeJS.WritableStream,
): void => {
  stream.write(JSON.stringify(result, null, 2));
  stream.write("\n");
};

export const renderDryCheckTable = (
  result: DryCheckResult,
  stream: NodeJS.WritableStream,
): void => {
  const w = (s: string) => stream.write(s);
  const { stats, groups } = result;

  w(
    `${BOLD}dry-check${RESET} — scanned ${stats.filesScanned} files in ${result.durationMs}ms\n`,
  );
  w("\n");

  w(`${BOLD}${CYAN}Summary${RESET}\n`);
  w(`  Files scanned:     ${stats.filesScanned}\n`);
  w(`  Total tokens:      ${stats.totalTokens.toLocaleString()}\n`);
  w(`  Duplicate groups:  ${stats.duplicateGroups}\n`);
  w(`  Duplicated lines:  ${stats.duplicatedLines.toLocaleString()}\n`);

  const pctColor =
    stats.duplicationPercentage > 10
      ? RED
      : stats.duplicationPercentage > 5
        ? YELLOW
        : GREEN;
  w(
    `  Duplication:       ${pctColor}${stats.duplicationPercentage}%${RESET}\n`,
  );
  w("\n");

  if (groups.length === 0) {
    w(`${GREEN}No duplicated code blocks found.${RESET}\n\n`);
    return;
  }

  w(`${BOLD}${CYAN}Duplicate Groups${RESET}\n`);
  for (const group of groups) {
    w(
      `\n  ${BOLD}#${group.id}${RESET} ${DIM}(${group.lineCount} lines, ${group.tokenCount} tokens)${RESET}\n`,
    );
    for (const inst of group.instances) {
      w(
        `    ${YELLOW}${inst.file}${RESET}:${inst.startLine}-${inst.endLine}\n`,
      );
    }
  }

  w("\n");
};
