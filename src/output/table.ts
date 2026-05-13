import type { RepoScanResult } from "../types";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const section = (title: string) => `\n${BOLD}${CYAN}${title}${RESET}\n`;
const list = (items: readonly string[]) =>
  items.length > 0 ? items.join(", ") : `${DIM}(none)${RESET}`;

export const renderTable = (
  result: RepoScanResult,
  stream: NodeJS.WritableStream,
): void => {
  const w = (s: string) => stream.write(s);

  w(`${BOLD}repo-scanner${RESET} — scanned ${result.rootPath}\n`);

  w(section("Languages"));
  if (result.languageStats.perLanguage.length > 0) {
    w(
      `  ${DIM}${result.languageStats.totalFiles.toLocaleString()} files, ${result.languageStats.totalLines.toLocaleString()} lines${RESET}\n`,
    );
    for (const lang of result.languageStats.perLanguage) {
      const pct =
        lang.files > 0 && lang.percentage < 0.1
          ? "< 0.1"
          : lang.percentage.toFixed(1).padStart(5);
      const files = `${lang.files}`.padStart(4);
      const loc = lang.lines.toLocaleString().padStart(8);
      w(
        `    ${YELLOW}${lang.language.padEnd(14)}${RESET} ${pct}%  ${DIM}(${files} files, ${loc} lines)${RESET}\n`,
      );
    }
  } else {
    w(`  ${list(result.inventory.languages)}\n`);
  }

  w(section("Frameworks"));
  w(`  ${list(result.inventory.frameworks)}\n`);

  w(section("Components"));
  if (result.architecture.components.length > 0) {
    for (const c of result.architecture.components) {
      const desc = c.description ? ` ${DIM}— ${c.description}${RESET}` : "";
      const secondary =
        c.secondaryKinds && c.secondaryKinds.length > 0
          ? ` ${DIM}(+${c.secondaryKinds.join(", +")})${RESET}`
          : "";
      w(
        `  ${YELLOW}${c.kind.padEnd(8)}${RESET}${secondary} ${c.name}${desc} ${DIM}${c.path}${RESET}\n`,
      );
    }
  } else {
    w(`  ${DIM}(none)${RESET}\n`);
  }

  w("\n");
};
