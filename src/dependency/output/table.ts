import type { DependencyReport, DepScannerResult, ScanResult } from "../types";

// Simple ANSI color helpers (no external deps)
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

const pad = (s: string, len: number): string => {
  // Strip ANSI for length calculation
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping requires matching ESC character
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  return s + " ".repeat(Math.max(0, len - plain.length));
};

const statusText = (report: DependencyReport): string => {
  if (!report.version) return dim("unknown");
  switch (report.version.updateType) {
    case "up-to-date":
      return green("✓ up to date");
    case "patch":
      return green("patch available");
    case "minor":
      return yellow("minor update");
    case "major":
      return red("MAJOR update");
    case "unknown":
      return dim("unknown");
  }
};

const vulnText = (report: DependencyReport): string => {
  if (report.vulnerabilities.length === 0) return green("none");
  const critCount = report.vulnerabilities.filter(
    (v) => v.severity === "CRITICAL" || v.severity === "HIGH",
  ).length;
  const total = report.vulnerabilities.length;
  if (critCount > 0) {
    return red(`${total} (${critCount} critical/high)`);
  }
  return yellow(`${total}`);
};

const renderScan = (scan: ScanResult, stream: NodeJS.WritableStream): void => {
  stream.write(`\n${bold(cyan(`═══ ${scan.ecosystem.toUpperCase()} ═══`))}\n`);
  stream.write(dim(`  Manifests: ${scan.manifestPaths.join(", ")}\n`));
  stream.write(dim(`  Scan time: ${scan.scanDurationMs}ms\n\n`));

  if (scan.reports.length === 0) {
    stream.write("  No dependencies found.\n");
    return;
  }

  // Calculate column widths
  const nameWidth = Math.min(
    40,
    Math.max(7, ...scan.reports.map((r) => r.dependency.name.length)),
  );
  const currentWidth = Math.min(
    15,
    Math.max(7, ...scan.reports.map((r) => r.dependency.currentVersion.length)),
  );
  const latestWidth = Math.min(
    15,
    Math.max(
      6,
      ...scan.reports.map((r) => r.version?.latestVersion.length ?? 6),
    ),
  );

  // Header
  const header = `  ${pad("Package", nameWidth)}  ${pad("Current", currentWidth)}  ${pad("Latest", latestWidth)}  ${pad("Status", 18)}  ${pad("Vulns", 25)}  Usages`;
  stream.write(`${bold(header)}\n`);
  stream.write(`  ${"─".repeat(header.length - 2)}\n`);

  for (const report of scan.reports) {
    const name = report.dependency.isDev
      ? dim(pad(report.dependency.name, nameWidth))
      : pad(report.dependency.name, nameWidth);

    const current = pad(report.dependency.currentVersion, currentWidth);
    const latest = pad(report.version?.latestVersion ?? "?", latestWidth);
    const status = pad(statusText(report), 18);
    const vulns = pad(vulnText(report), 25);
    const usageCount = report.usages.length;
    const usage = usageCount > 0 ? `${usageCount} files` : dim("0");

    stream.write(
      `  ${name}  ${current}  ${latest}  ${status}  ${vulns}  ${usage}\n`,
    );
  }
};

export const renderTable = (
  result: DepScannerResult,
  stream: NodeJS.WritableStream,
): void => {
  stream.write(bold("\n🔍 dep-scanner results\n"));
  stream.write(dim(`  Path: ${result.scanPath}\n`));
  stream.write(dim(`  Scanned: ${result.timestamp}\n`));

  for (const scan of result.scans) {
    renderScan(scan, stream);
  }

  // Summary
  stream.write(`\n${bold("Summary:")}\n`);
  stream.write(`  Dependencies: ${result.totalDependencies}\n`);

  const outdated = result.scans.reduce(
    (sum, s) =>
      sum +
      s.reports.filter(
        (r) =>
          r.version &&
          r.version.updateType !== "up-to-date" &&
          r.version.updateType !== "unknown",
      ).length,
    0,
  );
  stream.write(
    `  Outdated: ${outdated > 0 ? yellow(String(outdated)) : green("0")}\n`,
  );
  stream.write(
    `  Vulnerabilities: ${result.totalVulnerabilities > 0 ? red(String(result.totalVulnerabilities)) : green("0")}\n`,
  );
  stream.write(dim(`  Duration: ${result.durationMs}ms\n\n`));
};
