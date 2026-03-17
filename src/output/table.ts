import type { RepoScanResult } from "../types";
import { deriveProtocol } from "../utils/protocol";

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

  if (result.inventory.envVars.length > 0) {
    w(section("Environment Variables"));
    w(`  Found: ${result.inventory.envVars.length} unique variables\n`);
    for (const v of result.inventory.envVars) {
      const type =
        v.inferredType !== "unknown"
          ? ` ${DIM}(${v.inferredType})${RESET}`
          : "";
      const req = v.required
        ? `${YELLOW}required${RESET}`
        : `${DIM}optional${RESET}`;
      const def = v.defaultValue
        ? ` ${DIM}default: ${v.defaultValue}${RESET}`
        : "";
      const prefix = v.frameworkPrefix
        ? ` ${CYAN}[${v.frameworkPrefix}]${RESET}`
        : "";
      w(`    ${v.name}${type}  ${req}${def}${prefix}\n`);
      for (const u of v.usages.slice(0, 3)) {
        w(`      ${DIM}${u.file}:${u.line}${RESET}\n`);
      }
      if (v.usages.length > 3)
        w(`      ${DIM}... +${v.usages.length - 3} more${RESET}\n`);
    }
  }

  if (
    result.inventory.namingConventions &&
    result.inventory.namingConventions.length > 0
  ) {
    w(section("Naming Conventions"));
    for (const nc of result.inventory.namingConventions) {
      const cat = nc.category.padEnd(12);
      const style = nc.dominantStyle.padEnd(22);
      const pct = `${nc.percentage.toFixed(0)}%`.padStart(4);
      w(
        `  ${YELLOW}${cat}${RESET} ${style} ${pct}  ${DIM}(${nc.sampleSize} samples)${RESET}\n`,
      );
    }
  }

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

  // API Surface
  if (
    result.inventory.apiSurface &&
    result.inventory.apiSurface.endpoints.length > 0
  ) {
    const api = result.inventory.apiSurface;
    w(section("API Surface"));
    w(`  Protocols:  ${api.protocols.join(", ")}\n`);
    w(`  Frameworks: ${api.frameworksUsed.join(", ")}\n`);
    w(`  Endpoints:  ${api.endpoints.length}\n`);

    // Group by protocol
    const byProtocol = new Map<string, (typeof api.endpoints)[number][]>();
    for (const ep of api.endpoints) {
      const proto = deriveProtocol(ep.method);
      const group = byProtocol.get(proto);
      if (group) group.push(ep);
      else byProtocol.set(proto, [ep]);
    }

    const MAX_SHOWN = 10;
    for (const [proto, endpoints] of byProtocol) {
      w(`\n  ${BOLD}${proto}${RESET} (${endpoints.length}):\n`);
      const shown = endpoints.slice(0, MAX_SHOWN);
      for (const ep of shown) {
        const method = ep.method.padEnd(8);
        const path = ep.path.padEnd(30);
        w(
          `    ${YELLOW}${method}${RESET} ${path} ${DIM}(${ep.framework} — ${ep.file}:${ep.line})${RESET}\n`,
        );
      }
      if (endpoints.length > MAX_SHOWN) {
        w(`    ${DIM}... +${endpoints.length - MAX_SHOWN} more${RESET}\n`);
      }
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

  // Likely Dead Exports
  if (result.inventory.deadExports && result.inventory.deadExports.length > 0) {
    const dead = result.inventory.deadExports;
    w(section("Likely Dead Exports"));
    w(
      `  Found: ${dead.length} exported symbol${dead.length > 1 ? "s" : ""} with no detected imports ${DIM}(heuristic)${RESET}\n`,
    );
    const MAX_SHOWN = 20;
    const shown = dead.slice(0, MAX_SHOWN);
    for (const d of shown) {
      const kind = d.exportType.padEnd(10);
      const sym = d.symbol.padEnd(24);
      w(
        `    ${YELLOW}${kind}${RESET} ${sym} ${DIM}${d.file}:${d.line}${RESET}  ${d.language}\n`,
      );
    }
    if (dead.length > MAX_SHOWN) {
      w(`    ${DIM}... +${dead.length - MAX_SHOWN} more${RESET}\n`);
    }
  }

  // Code Duplication
  if (result.inventory.codeDuplication) {
    const cd = result.inventory.codeDuplication;
    w(section("Code Duplication"));
    w(
      `  Duplication: ${YELLOW}${cd.stats.duplicationPercentage}%${RESET}  ${DIM}(${cd.stats.duplicatedLines.toLocaleString()} lines in ${cd.stats.duplicateGroups} group${cd.stats.duplicateGroups !== 1 ? "s" : ""})${RESET}\n`,
    );
    w(
      `  Files scanned: ${cd.stats.filesScanned.toLocaleString()}  Tokens: ${cd.stats.totalTokens.toLocaleString()}\n`,
    );
    if (cd.groups.length > 0) {
      const MAX_SHOWN = 10;
      const shown = cd.groups.slice(0, MAX_SHOWN);
      for (const g of shown) {
        w(
          `\n  ${BOLD}Group #${g.id}${RESET} ${DIM}(${g.lineCount} lines, ${g.tokenCount} tokens)${RESET}\n`,
        );
        for (const inst of g.instances) {
          w(
            `    ${DIM}${inst.file}:${inst.startLine}-${inst.endLine}${RESET}\n`,
          );
        }
      }
      if (cd.groups.length > MAX_SHOWN) {
        w(
          `\n  ${DIM}... +${cd.groups.length - MAX_SHOWN} more groups${RESET}\n`,
        );
      }
    }
  }

  // SOLID Health
  if (result.inventory.solidHealth) {
    const sh = result.inventory.solidHealth;
    const scoreColor =
      sh.score >= 80 ? GREEN : sh.score >= 50 ? YELLOW : "\x1b[31m";
    w(section("SOLID Health"));
    w(
      `  Score: ${BOLD}${scoreColor}${sh.score}/100${RESET}  ${DIM}(${sh.analyzedFiles} files, ${sh.analyzedClasses} classes)${RESET}\n\n`,
    );

    const confidenceLabel = (c: number) =>
      c >= 0.8 ? "high" : c >= 0.6 ? "medium" : "low";

    const principles = [
      { key: "SRP", data: sh.principles.srp },
      { key: "OCP", data: sh.principles.ocp },
      { key: "LSP", data: sh.principles.lsp },
      { key: "ISP", data: sh.principles.isp },
      { key: "DIP", data: sh.principles.dip },
    ] as const;

    for (const { key, data } of principles) {
      const pColor =
        data.score >= 80 ? GREEN : data.score >= 50 ? YELLOW : "\x1b[31m";
      const conf = confidenceLabel(data.confidence);
      const violCount = data.violations.length;
      w(
        `  ${BOLD}${key}${RESET}  ${pColor}${String(data.score).padStart(3)}/100${RESET}  ${DIM}(${conf} confidence)${RESET}  ${violCount > 0 ? `${violCount} violation${violCount > 1 ? "s" : ""}` : `${GREEN}clean${RESET}`}\n`,
      );
    }

    if (sh.worstFiles.length > 0) {
      w(`\n  ${BOLD}Worst Files:${RESET}\n`);
      const MAX_SHOWN = 10;
      for (const f of sh.worstFiles.slice(0, MAX_SHOWN)) {
        const fColor =
          f.score >= 80 ? GREEN : f.score >= 50 ? YELLOW : "\x1b[31m";
        w(
          `    ${fColor}${String(f.score).padStart(3)}/100${RESET}  ${f.file}  ${DIM}(${f.violations} violations)${RESET}\n`,
        );
      }
      if (sh.worstFiles.length > MAX_SHOWN) {
        w(`    ${DIM}... +${sh.worstFiles.length - MAX_SHOWN} more${RESET}\n`);
      }
    }

    // Top violations
    const allViolations = [
      ...sh.principles.srp.violations,
      ...sh.principles.ocp.violations,
      ...sh.principles.lsp.violations,
      ...sh.principles.isp.violations,
      ...sh.principles.dip.violations,
    ];
    if (allViolations.length > 0) {
      w(`\n  ${BOLD}Top Violations:${RESET}\n`);
      const topViolations = allViolations
        .filter((v) => v.severity === "error" || v.severity === "warning")
        .slice(0, 10);
      for (const v of topViolations) {
        const sev = v.severity === "error" ? "\x1b[31m" : YELLOW;
        w(
          `    ${sev}${v.principle.padEnd(4)}${RESET} ${DIM}${v.file}:${v.line}${RESET}  ${v.entity}: ${v.message}\n`,
        );
      }
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

  // External Services
  if (
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

  if (result.dependencies) {
    w(section("Dependencies"));

    w(`  Ecosystems:       ${list(result.dependencies.summary.ecosystems)}\n`);
    w(`  Dependencies:     ${result.dependencies.totalDependencies}\n`);
    w(
      `  Outdated:         ${result.dependencies.summary.outdatedDependencies}\n`,
    );
    w(`  Vulnerabilities:  ${result.dependencies.totalVulnerabilities}\n`);

    if (result.dependencies.summary.topOutdated.length > 0) {
      w("  Top outdated:\n");
      for (const item of result.dependencies.summary.topOutdated) {
        w(
          `    ${YELLOW}${item.name}${RESET} ${DIM}(${item.ecosystem}, ${item.updateType})${RESET}\n`,
        );
      }
    }

    if (result.dependencies.summary.topVulnerable.length > 0) {
      w("  Top vulnerable:\n");
      for (const item of result.dependencies.summary.topVulnerable) {
        w(
          `    ${YELLOW}${item.name}${RESET} ${DIM}(${item.ecosystem}, ${item.vulnerabilityCount} vuln, highest ${item.highestSeverity})${RESET}\n`,
        );
      }
    }

    if (result.dependencies.summary.byComponent.length > 0) {
      w("  By component:\n");
      for (const component of result.dependencies.summary.byComponent.slice(
        0,
        10,
      )) {
        w(
          `    ${YELLOW}${component.component}${RESET} ${DIM}deps:${component.totalDependencies} outdated:${component.outdatedDependencies} vulns:${component.vulnerabilityCount}${RESET}\n`,
        );
      }
      if (result.dependencies.summary.byComponent.length > 10) {
        w(
          `    ${DIM}... +${result.dependencies.summary.byComponent.length - 10} more${RESET}\n`,
        );
      }
    }
  }

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
  w(`${check(result.signals.hasTypedContracts)} Typed Contracts  `);
  w(`${check(result.signals.isPolyglot)} Polyglot  `);
  w(`${check(result.signals.hasQualityGates)} Quality Gates  `);
  w(`${check(result.signals.hasDeploymentPlatform)} Deployment\n`);
  w("\n");
};
