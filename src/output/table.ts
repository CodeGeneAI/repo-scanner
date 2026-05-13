import type { PartialRepoScanResult, RepoScanResult } from "../types";
import { ANSI } from "./ansi";

const { BOLD, DIM, YELLOW, CYAN, RESET } = ANSI;

const section = (title: string) => `\n${BOLD}${CYAN}${title}${RESET}\n`;
const list = (items: readonly string[]) =>
  items.length > 0 ? items.join(", ") : `${DIM}(none)${RESET}`;

export const renderTable = (
  result: RepoScanResult | PartialRepoScanResult,
  stream: NodeJS.WritableStream,
): void => {
  const w = (s: string) => stream.write(s);

  w(`${BOLD}repo-scanner${RESET} — scanned ${result.rootPath}\n`);

  // Languages section: requires both inventory.languages (the list) and
  // languageStats (the stats). Both come from the language detector, so they
  // either both exist (full scan, or filter included `language`) or neither
  // does. Render based on presence.
  if (result.languageStats || result.inventory?.languages) {
    w(section("Languages"));
    const stats = result.languageStats;
    if (stats && stats.perLanguage.length > 0) {
      w(
        `  ${DIM}${stats.totalFiles.toLocaleString()} files, ${stats.totalLines.toLocaleString()} lines${RESET}\n`,
      );
      for (const lang of stats.perLanguage) {
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
      w(`  ${list(result.inventory?.languages ?? [])}\n`);
    }
  }

  if (result.inventory?.frameworks !== undefined) {
    w(section("Frameworks"));
    w(`  ${list(result.inventory.frameworks)}\n`);
  }

  if (result.inventory?.packageManagers !== undefined) {
    w(section("Package managers"));
    w(`  ${list(result.inventory.packageManagers)}\n`);
  }

  if (result.architecture) {
    w(section("Monorepo"));
    const flag = result.architecture.monorepo ? "yes" : "no";
    const suffix = result.architecture.toolName
      ? ` ${DIM}(${result.architecture.toolName})${RESET}`
      : "";
    w(`  ${flag}${suffix}\n`);

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
  }

  w("\n");
};
