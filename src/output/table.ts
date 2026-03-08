import type { RepoScanResult } from "../types";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const check = (v: boolean) => (v ? `${GREEN}✓${RESET}` : `${DIM}✗${RESET}`);
const section = (title: string) => `\n${BOLD}${CYAN}${title}${RESET}\n`;
const list = (items: readonly string[]) =>
  items.length > 0 ? items.join(", ") : `${DIM}(none)${RESET}`;

export const renderTable = (
  result: RepoScanResult,
  stream: NodeJS.WritableStream,
): void => {
  const w = (s: string) => stream.write(s);

  w(
    `${BOLD}repo-scanner${RESET} — scanned ${result.scanPath} in ${result.durationMs}ms\n`,
  );

  w(section("Architecture"));
  w(
    `  Monorepo: ${result.architecture.monorepo ? `${GREEN}yes${RESET}` : "no"}\n`,
  );
  if (result.architecture.components.length > 0) {
    w(`  Components (${result.architecture.components.length}):\n`);
    for (const c of result.architecture.components) {
      const desc = c.description ? ` ${DIM}— ${c.description}${RESET}` : "";
      w(
        `    ${YELLOW}${c.kind.padEnd(8)}${RESET} ${c.name}${desc} ${DIM}${c.path}${RESET}\n`,
      );
    }
  }

  w(section("Inventory"));
  w(`  Languages:    ${list(result.inventory.languages)}\n`);
  w(`  Frameworks:   ${list(result.inventory.frameworks)}\n`);
  w(`  Datastores:   ${list(result.inventory.datastores)}\n`);
  w(`  Dep Managers: ${list(result.inventory.dependencyManagers)}\n`);
  w(`  Repo Tools:   ${list(result.inventory.repoTools)}\n`);

  w(section("Build & Test"));
  w(`  CI Systems:   ${list(result.buildAndTest.ciSystems)}\n`);
  w(`  Build:        ${list(result.buildAndTest.buildCommands)}\n`);
  w(`  Test:         ${list(result.buildAndTest.testCommands)}\n`);
  w(`  Lint:         ${list(result.buildAndTest.lintCommands)}\n`);

  w(section("Signals"));
  w(`  ${check(result.signals.hasReadme)} README  `);
  w(`${check(result.signals.hasCi)} CI  `);
  w(`${check(result.signals.hasContainerization)} Containers  `);
  w(`${check(result.signals.hasIaC)} IaC  `);
  w(`${check(result.signals.hasTests)} Tests  `);
  w(`${check(result.signals.hasTypedContracts)} Typed Contracts\n`);
  w("\n");
};
