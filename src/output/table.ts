import type { ScanSection } from "../scan-profile";
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

export interface TableRenderOptions {
  readonly selectedSections?: readonly ScanSection[];
  readonly includeSignals?: boolean;
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
  const showExternalServices = sectionSet
    ? sectionSet.has("external-services")
    : true;
  const showBuildAndTest = sectionSet ? sectionSet.has("build-and-test") : true;
  const includeSignals = options?.includeSignals ?? sectionSet === undefined;

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
    w(`  Datastores:   ${list(result.inventory.datastores)}\n`);
    w(`  Dep Managers: ${list(result.inventory.dependencyManagers)}\n`);
    if (result.inventory.containerization.length > 0)
      w(`  Containers:   ${list(result.inventory.containerization)}\n`);
    if (result.inventory.iac.length > 0)
      w(`  IaC:          ${list(result.inventory.iac)}\n`);
    if (result.inventory.testing.length > 0)
      w(`  Testing:      ${list(result.inventory.testing)}\n`);
    if (result.inventory.buildTools.length > 0)
      w(`  Build Tools:  ${list(result.inventory.buildTools)}\n`);
    if (result.inventory.linting.length > 0)
      w(`  Linting:      ${list(result.inventory.linting)}\n`);
    if (result.inventory.codeQuality.length > 0)
      w(`  Code Quality: ${list(result.inventory.codeQuality)}\n`);
    if (result.inventory.deploymentPlatforms.length > 0)
      w(`  Deploy:       ${list(result.inventory.deploymentPlatforms)}\n`);
    if (result.inventory.repoTools.length > 0)
      w(`  Other Tools:  ${list(result.inventory.repoTools)}\n`);

    // Runtimes
    if (result.inventory.runtimes.length > 0) {
      w(section("Runtimes"));
      for (const r of result.inventory.runtimes) {
        const lang = r.language.padEnd(12);
        const ver = r.version.padEnd(16);
        w(
          `  ${YELLOW}${lang}${RESET} ${ver} ${DIM}(${r.source} — ${r.file})${RESET}\n`,
        );
      }
    }

    // Large Files
    if (result.inventory.largeFiles && result.inventory.largeFiles.length > 0) {
      w(section("Large Files"));
      w(
        `  Found: ${result.inventory.largeFiles.length} file(s) exceeding line threshold\n`,
      );
      const MAX_SHOWN = 20;
      const shown = result.inventory.largeFiles.slice(0, MAX_SHOWN);
      for (const lf of shown) {
        const lines = lf.lineCount.toLocaleString().padStart(8);
        const lang = lf.language.padEnd(14);
        w(
          `    ${YELLOW}${lines} lines${RESET}  ${lang} ${DIM}${lf.relativePath}${RESET}\n`,
        );
      }
      if (result.inventory.largeFiles.length > MAX_SHOWN) {
        w(
          `    ${DIM}... +${result.inventory.largeFiles.length - MAX_SHOWN} more${RESET}\n`,
        );
      }
    }

    // Code Annotations (TODO/FIXME/HACK/BUG/XXX)
    if (
      result.inventory.todoAnnotations &&
      result.inventory.todoAnnotations.length > 0
    ) {
      const todos = result.inventory.todoAnnotations;
      w(section("Code Annotations"));

      // Summary by tag
      const tagCounts = new Map<string, number>();
      for (const a of todos) {
        tagCounts.set(a.tag, (tagCounts.get(a.tag) ?? 0) + 1);
      }
      const summary = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => `${count} ${tag}`)
        .join(", ");
      w(`  Found: ${todos.length} annotations (${summary})\n`);

      const MAX_SHOWN = 20;
      const shown = todos.slice(0, MAX_SHOWN);
      for (const a of shown) {
        const tag = a.tag.padEnd(6);
        const loc = `${a.file}:${a.line}`;
        const author = a.author ? ` ${CYAN}(${a.author})${RESET}` : "";
        w(
          `    ${YELLOW}${tag}${RESET} ${DIM}${loc}${RESET}${author}  ${a.text}\n`,
        );
      }
      if (todos.length > MAX_SHOWN) {
        w(`    ${DIM}... +${todos.length - MAX_SHOWN} more${RESET}\n`);
      }
    }

    // Complexity Hotspots
    if (
      result.inventory.complexityHotspots &&
      result.inventory.complexityHotspots.length > 0
    ) {
      const hotspots = result.inventory.complexityHotspots;
      w(section("Complexity Hotspots"));
      w(`  Top ${hotspots.length} files by complexity × churn:\n`);
      for (const h of hotspots) {
        const scoreColor =
          h.score > 70 ? "\x1b[31m" : h.score > 30 ? YELLOW : GREEN;
        const score = `${h.score}`.padStart(3);
        const complexity = `${h.complexity}`.padStart(4);
        const churn = `${h.churn}`.padStart(4);
        const lang = h.language.padEnd(12);
        w(
          `    ${scoreColor}${score}${RESET}  ${DIM}complexity=${complexity} churn=${churn}${RESET}  ${lang} ${DIM}${h.file}${RESET}\n`,
        );
      }
    }
  }

  // External Services
  if (
    showExternalServices &&
    result.inventory.externalServices &&
    result.inventory.externalServices.length > 0
  ) {
    const services = result.inventory.externalServices;
    w(section("External Services"));

    // Group by category
    const byCategory = new Map<string, (typeof services)[number][]>();
    for (const svc of services) {
      const group = byCategory.get(svc.category);
      if (group) group.push(svc);
      else byCategory.set(svc.category, [svc]);
    }

    for (const [category, svcs] of byCategory) {
      const names = svcs.map((s) => s.name).join(", ");
      w(`  ${YELLOW}${category}${RESET} (${svcs.length}): ${names}\n`);
    }
  }

  if (showBuildAndTest) {
    w(section("Build & Test"));
    w(`  CI Systems:   ${list(result.buildAndTest.ciSystems)}\n`);
    w(`  Build:        ${list(result.buildAndTest.buildCommands)}\n`);
    w(`  Test:         ${list(result.buildAndTest.testCommands)}\n`);
    w(`  Lint:         ${list(result.buildAndTest.lintCommands)}\n`);
  }

  if (includeSignals) {
    w(section("Signals"));
    w(`  ${check(result.signals.hasReadme)} README  `);
    w(`${check(result.signals.hasCi)} CI  `);
    w(`${check(result.signals.hasContainerization)} Containers  `);
    w(`${check(result.signals.hasIaC)} IaC  `);
    w(`${check(result.signals.hasTests)} Tests  `);
    w(`${check(result.signals.hasTypedContracts)} Typed Contracts  `);
    w(`${check(result.signals.isPolyglot)} Polyglot  `);
    w(`${check(result.signals.hasQualityGates)} Quality Gates  `);
    w(`${check(result.signals.hasDeploymentPlatform)} Deployment\n`);
  }
  w("\n");
};
