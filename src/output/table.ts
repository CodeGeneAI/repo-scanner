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
        const blast =
          c.blastRadius && c.blastRadius.score > 0
            ? ` ${DIM}[blast: ${c.blastRadius.score}]${RESET}`
            : "";
        w(
          `    ${YELLOW}${c.kind.padEnd(8)}${RESET}${secondary} ${c.name}${blast}${desc} ${DIM}${c.path}${RESET}\n`,
        );

        // Per-component metadata
        if (c.metadata) {
          const m = c.metadata;
          const meta: string[] = [];
          if (m.platform) meta.push(m.platform);
          if (m.frameworks && m.frameworks.length > 0)
            meta.push(m.frameworks.join(", "));
          if (m.runtime)
            meta.push(
              `${m.runtime.name}${m.runtime.version ? " " + m.runtime.version : ""}`,
            );
          if (m.lineCount) meta.push(`${m.lineCount.toLocaleString()} lines`);
          if (m.ports && m.ports.length > 0)
            meta.push(
              `port${m.ports.length > 1 ? "s" : ""}: ${m.ports.join(", ")}`,
            );
          if (m.entryPoint) meta.push(`entry: ${m.entryPoint}`);
          if (m.version) meta.push(`v${m.version}`);
          if (m.private) meta.push("private");
          if (m.deployTarget) meta.push(m.deployTarget);

          if (meta.length > 0) {
            w(`             ${DIM}${meta.join(" · ")}${RESET}\n`);
          }

          // Boolean flags
          const flags: string[] = [];
          if (m.hasReadme) flags.push("readme");
          if (m.hasDockerfile) flags.push("docker");
          if (m.hasTests) flags.push("tests");
          if (m.hasMigrations) flags.push("migrations");
          if (flags.length > 0) {
            w(`             ${DIM}[${flags.join(", ")}]${RESET}\n`);
          }

          // Datastores, services, env, api
          if (m.datastores && m.datastores.length > 0)
            w(
              `             ${DIM}datastores: ${m.datastores.join(", ")}${RESET}\n`,
            );
          if (m.externalServices && m.externalServices.length > 0)
            w(
              `             ${DIM}services: ${m.externalServices.map((s) => s.name).join(", ")}${RESET}\n`,
            );
          if (m.observability && m.observability.length > 0)
            w(
              `             ${DIM}observability: ${m.observability.join(", ")}${RESET}\n`,
            );
        }
      }
    }

    // Cross-Package Dependencies
    if (
      result.architecture.crossPackageDeps &&
      result.architecture.crossPackageDeps.edges.length > 0
    ) {
      const cpd = result.architecture.crossPackageDeps;
      w(section("Cross-Package Dependencies"));
      w(`  Internal edges: ${cpd.edges.length}\n`);
      const MAX_SHOWN = 20;
      const shown = cpd.edges.slice(0, MAX_SHOWN);
      for (const e of shown) {
        const dev = e.isDev ? ` ${DIM}(dev)${RESET}` : "";
        w(
          `    ${YELLOW}${e.fromName}${RESET} → ${e.toName}  ${DIM}(${e.ecosystem})${RESET}${dev}\n`,
        );
      }
      if (cpd.edges.length > MAX_SHOWN) {
        w(`    ${DIM}... +${cpd.edges.length - MAX_SHOWN} more${RESET}\n`);
      }
      if (cpd.orphans.length > 0) {
        w(`  Orphan components: ${cpd.orphans.length}\n`);
        for (const o of cpd.orphans.slice(0, 10)) {
          w(`    ${DIM}${o}${RESET}\n`);
        }
      }
    }

    // Architecture Issues (circular deps + layer violations)
    const hasArchIssues =
      (result.architecture.circularDeps &&
        result.architecture.circularDeps.length > 0) ||
      (result.architecture.layerViolations &&
        result.architecture.layerViolations.length > 0);

    if (hasArchIssues) {
      w(section("Architecture Issues"));
      const MAX_SHOWN = 10;

      if (
        result.architecture.circularDeps &&
        result.architecture.circularDeps.length > 0
      ) {
        const cycles = result.architecture.circularDeps;
        w(`  ${YELLOW}Circular dependencies: ${cycles.length}${RESET}\n`);
        for (const cycle of cycles.slice(0, MAX_SHOWN)) {
          w(`    ${YELLOW}${cycle.join(" → ")} → ${cycle[0]}${RESET}\n`);
        }
        if (cycles.length > MAX_SHOWN) {
          w(`    ${DIM}... +${cycles.length - MAX_SHOWN} more${RESET}\n`);
        }
      }

      if (
        result.architecture.layerViolations &&
        result.architecture.layerViolations.length > 0
      ) {
        const violations = result.architecture.layerViolations;
        w(`  ${YELLOW}Layer violations: ${violations.length}${RESET}\n`);
        for (const v of violations.slice(0, MAX_SHOWN)) {
          w(
            `    ${YELLOW}${v.from}${RESET} → ${v.to}  ${DIM}(${v.reason})${RESET}\n`,
          );
        }
        if (violations.length > MAX_SHOWN) {
          w(`    ${DIM}... +${violations.length - MAX_SHOWN} more${RESET}\n`);
        }
      }
    }

    // High Impact Components
    if (
      result.architecture.highImpactComponents &&
      result.architecture.highImpactComponents.length > 0
    ) {
      w(section("High Impact Components"));
      for (const hic of result.architecture.highImpactComponents) {
        const scoreColor =
          hic.score > 70 ? "\x1b[31m" : hic.score > 30 ? YELLOW : GREEN;
        const score = `${hic.score}`.padStart(3);
        w(
          `    ${scoreColor}${score}${RESET}  ${hic.name}  ${DIM}(${hic.transitiveDependents} transitive dependents)  ${hic.path}${RESET}\n`,
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
