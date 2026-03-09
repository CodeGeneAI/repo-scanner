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

/** Derive protocol from method. */
const deriveProtocol = (method: string): string => {
  switch (method) {
    case "QUERY":
    case "MUTATION":
    case "SUBSCRIPTION":
      return "GraphQL";
    case "RPC":
      return "gRPC";
    case "WS":
      return "WebSocket";
    default:
      return "REST";
  }
};

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
  w(`  Repo Tools:   ${list(result.inventory.repoTools)}\n`);

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
