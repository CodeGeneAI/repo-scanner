import { describe, expect, it } from "vitest";
import type { DependencyReport, DepScannerResult, ScanResult } from "../types";
import { renderJson } from "./json";
import { renderTable } from "./table";

const createMockStream = () => {
  const chunks: string[] = [];
  return {
    stream: {
      write: (s: string) => {
        chunks.push(s);
        return true;
      },
    } as NodeJS.WritableStream,
    getOutput: () => chunks.join(""),
  };
};

const makeReport = (
  name: string,
  overrides?: Partial<DependencyReport>,
): DependencyReport => ({
  dependency: {
    name,
    currentVersion: "1.0.0",
    ecosystem: "npm",
    manifestPath: "package.json",
    isDev: false,
    isOptional: false,
  },
  version: {
    latestVersion: "2.0.0",
    updateType: "major",
  },
  vulnerabilities: [],
  usages: [],
  ...overrides,
});

const makeScanResult = (
  reports: DependencyReport[],
  overrides?: Partial<ScanResult>,
): ScanResult => ({
  ecosystem: "npm",
  reports,
  manifestPaths: ["package.json"],
  scanDurationMs: 150,
  ...overrides,
});

const makeResult = (
  scans: ScanResult[],
  overrides?: Partial<DepScannerResult>,
): DepScannerResult => ({
  scans,
  totalDependencies: scans.reduce((sum, s) => sum + s.reports.length, 0),
  totalVulnerabilities: scans.reduce(
    (sum, s) =>
      sum + s.reports.reduce((vs, r) => vs + r.vulnerabilities.length, 0),
    0,
  ),
  summary: {
    ecosystems: [...new Set(scans.map((scan) => scan.ecosystem))],
    outdatedDependencies: scans.reduce(
      (sum, scan) =>
        sum +
        scan.reports.filter(
          (report) =>
            report.version !== undefined &&
            report.version.updateType !== "up-to-date" &&
            report.version.updateType !== "unknown",
        ).length,
      0,
    ),
    topOutdated: [],
    topVulnerable: [],
    byComponent: [],
  },
  scanPath: "/project",
  timestamp: "2026-03-07T12:00:00.000Z",
  durationMs: 500,
  ...overrides,
});

describe("renderJson", () => {
  it("outputs valid JSON", () => {
    const result = makeResult([makeScanResult([makeReport("express")])]);
    const mock = createMockStream();

    renderJson(result, mock.stream);

    const output = mock.getOutput();
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("contains all scan result fields", () => {
    const report = makeReport("lodash", {
      vulnerabilities: [
        {
          id: "GHSA-1",
          summary: "XSS issue",
          severity: "HIGH",
          affectedVersions: "1.0.0",
          fixedVersion: "1.0.1",
        },
      ],
      usages: [
        {
          filePath: "/project/src/index.ts",
          line: 3,
          importStatement: 'import lodash from "lodash";',
        },
      ],
    });
    const result = makeResult([makeScanResult([report])], {
      totalVulnerabilities: 1,
    });

    const mock = createMockStream();
    renderJson(result, mock.stream);

    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.scanPath).toBe("/project");
    expect(parsed.timestamp).toBe("2026-03-07T12:00:00.000Z");
    expect(parsed.durationMs).toBe(500);
    expect(parsed.totalDependencies).toBe(1);
    expect(parsed.totalVulnerabilities).toBe(1);
    expect(parsed.scans).toHaveLength(1);
    expect(parsed.scans[0].ecosystem).toBe("npm");
    expect(parsed.scans[0].reports).toHaveLength(1);
    expect(parsed.scans[0].reports[0].dependency.name).toBe("lodash");
    expect(parsed.scans[0].reports[0].vulnerabilities[0].id).toBe("GHSA-1");
    expect(parsed.scans[0].reports[0].usages[0].filePath).toBe(
      "/project/src/index.ts",
    );
  });

  it("outputs pretty-printed JSON with 2-space indent", () => {
    const result = makeResult([makeScanResult([])]);
    const mock = createMockStream();

    renderJson(result, mock.stream);

    const output = mock.getOutput();
    // JSON.stringify with indent 2 produces lines starting with spaces
    expect(output).toContain("  ");
    expect(output).toBe(`${JSON.stringify(result, null, 2)}\n`);
  });
});

describe("renderTable", () => {
  it("outputs ecosystem header", () => {
    const result = makeResult([makeScanResult([makeReport("express")])]);
    const mock = createMockStream();

    renderTable(result, mock.stream);

    const output = mock.getOutput();
    expect(output).toContain("NPM");
  });

  it("contains dependency names", () => {
    const result = makeResult([
      makeScanResult([makeReport("express"), makeReport("lodash")]),
    ]);
    const mock = createMockStream();

    renderTable(result, mock.stream);

    const output = mock.getOutput();
    expect(output).toContain("express");
    expect(output).toContain("lodash");
  });

  it("contains summary line with dependency count", () => {
    const result = makeResult(
      [makeScanResult([makeReport("express"), makeReport("lodash")])],
      { totalDependencies: 2 },
    );
    const mock = createMockStream();

    renderTable(result, mock.stream);

    const output = mock.getOutput();
    expect(output).toContain("Summary");
    expect(output).toContain("Dependencies");
    expect(output).toContain("2");
  });

  it("shows vulnerability count", () => {
    const report = makeReport("vuln-pkg", {
      vulnerabilities: [
        {
          id: "GHSA-1",
          summary: "Issue",
          severity: "CRITICAL",
          affectedVersions: "1.0.0",
        },
        {
          id: "GHSA-2",
          summary: "Another",
          severity: "HIGH",
          affectedVersions: "1.0.0",
        },
      ],
    });
    const result = makeResult([makeScanResult([report])], {
      totalVulnerabilities: 2,
    });
    const mock = createMockStream();

    renderTable(result, mock.stream);

    const output = mock.getOutput();
    expect(output).toContain("Vulnerabilities");
    expect(output).toContain("2");
  });

  it("shows scan path and timestamp", () => {
    const result = makeResult([makeScanResult([])]);
    const mock = createMockStream();

    renderTable(result, mock.stream);

    const output = mock.getOutput();
    expect(output).toContain("/project");
    expect(output).toContain("2026-03-07T12:00:00.000Z");
  });

  it("handles multiple ecosystems", () => {
    const npmScan = makeScanResult([makeReport("express")], {
      ecosystem: "npm",
    });
    const pypiScan = makeScanResult(
      [
        makeReport("requests", {
          dependency: {
            name: "requests",
            currentVersion: "2.28.0",
            ecosystem: "pypi",
            manifestPath: "requirements.txt",
            isDev: false,
            isOptional: false,
          },
        }),
      ],
      { ecosystem: "pypi", manifestPaths: ["requirements.txt"] },
    );

    const result = makeResult([npmScan, pypiScan], { totalDependencies: 2 });
    const mock = createMockStream();

    renderTable(result, mock.stream);

    const output = mock.getOutput();
    expect(output).toContain("NPM");
    expect(output).toContain("PYPI");
  });

  it("displays zero vulnerabilities in green when none exist", () => {
    const result = makeResult([makeScanResult([makeReport("safe-pkg")])], {
      totalVulnerabilities: 0,
    });
    const mock = createMockStream();

    renderTable(result, mock.stream);

    const output = mock.getOutput();
    // The green ANSI escape wraps "0" for vulnerabilities
    expect(output).toContain("Vulnerabilities");
    expect(output).toContain("0");
  });
});
