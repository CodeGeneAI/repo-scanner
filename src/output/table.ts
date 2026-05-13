import type { ScanSection } from "../scan-profile";
import type { RepoScanResult } from "../types";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const section = (title: string) => `\n${BOLD}${CYAN}${title}${RESET}\n`;
const list = (items: readonly string[]) =>
  items.length > 0 ? items.join(", ") : `${DIM}(none)${RESET}`;

export interface TableRenderOptions {
  readonly selectedSections?: readonly ScanSection[];
}

export const renderTable = (
  result: RepoScanResult,
  stream: NodeJS.WritableStream,
  options?: TableRenderOptions,
): void => {
  const w = (s: string) => stream.write(s);
  const sectionSet = options?.selectedSections
    ? new Set(options.selectedSections)
    : undefined;
  const showArchitecture = sectionSet ? sectionSet.has("architecture") : true;
  const showInventory = sectionSet ? sectionSet.has("inventory") : true;

  w(
    `${BOLD}repo-scanner${RESET} — scanned ${result.scanPath} in ${result.durationMs}ms\n`,
  );

  if (showArchitecture) {
    w(section("Architecture"));
    w(
      `  Monorepo: ${result.architecture.monorepo ? `${GREEN}yes${RESET}` : "no"}\n`,
    );
    if (result.architecture.components.length > 0) {
      w(`  Components (${result.architecture.components.length}):\n`);
      for (const c of result.architecture.components) {
        const desc = c.description ? ` ${DIM}— ${c.description}${RESET}` : "";
        const secondary =
          c.secondaryKinds && c.secondaryKinds.length > 0
            ? ` ${DIM}(+${c.secondaryKinds.join(", +")})${RESET}`
            : "";
        w(
          `    ${YELLOW}${c.kind.padEnd(8)}${RESET}${secondary} ${c.name}${desc} ${DIM}${c.path}${RESET}\n`,
        );
      }
    }
  }

  if (showInventory) {
    w(section("Inventory"));
    if (result.inventory.languageStats.length > 0) {
      w(
        `  Languages: ${DIM}${result.inventory.totalFiles.toLocaleString()} files, ${result.inventory.totalLinesOfCode.toLocaleString()} lines${RESET}\n`,
      );
      for (const lang of result.inventory.languageStats) {
        const pct =
          lang.fileCount > 0 && lang.percentage < 0.1
            ? "< 0.1"
            : lang.percentage.toFixed(1).padStart(5);
        const files = `${lang.fileCount}`.padStart(4);
        const loc = lang.linesOfCode.toLocaleString().padStart(8);
        w(
          `    ${YELLOW}${lang.name.padEnd(14)}${RESET} ${pct}%  ${DIM}(${files} files, ${loc} lines)${RESET}\n`,
        );
      }
    } else {
      w(`  Languages:    ${list(result.inventory.languages)}\n`);
    }
    w(`  Frameworks:   ${list(result.inventory.frameworks)}\n`);
  }

  w("\n");
};
