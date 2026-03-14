import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { scanDependencySubsystem } from "./scanner";

import "./parsers/init";

describe("scanDependencySubsystem", () => {
  it("returns deterministically sorted reports and scans", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-deps-"),
    );

    try {
      await writeFile(
        path.join(repoPath, "package.json"),
        JSON.stringify(
          {
            name: "fixture",
            version: "1.0.0",
            dependencies: {
              zod: "^4.0.0",
              axios: "^1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const result = await scanDependencySubsystem({
        path: repoPath,
        ecosystems: ["npm"],
        skipSecurity: true,
        skipUsage: true,
        concurrency: 1,
      });

      expect(result.scans.map((scan) => scan.ecosystem)).toEqual(["npm"]);
      expect(
        result.scans[0]?.reports.map((report) => report.dependency.name),
      ).toEqual(["axios", "zod"]);
      expect(result.summary.ecosystems).toEqual(["npm"]);
      expect(result.summary.byComponent[0]?.component).toBe("root");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("supports workspace-package component grouping", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-deps-grouping-"),
    );

    try {
      const packageDir = path.join(repoPath, "packages", "shared");
      await mkdir(packageDir, { recursive: true });
      await writeFile(
        path.join(packageDir, "package.json"),
        JSON.stringify(
          {
            name: "@fixture/shared",
            version: "1.0.0",
            dependencies: {
              axios: "^1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const result = await scanDependencySubsystem({
        path: repoPath,
        ecosystems: ["npm"],
        skipSecurity: true,
        skipUsage: true,
        concurrency: 1,
        componentGrouping: "workspace-package",
      });

      expect(result.summary.byComponent[0]?.component).toBe("packages/shared");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("preserves per-manifest dependency reports for component summaries", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-deps-components-"),
    );

    try {
      const appDir = path.join(repoPath, "apps", "web");
      const serviceDir = path.join(repoPath, "services", "api");

      await mkdir(appDir, { recursive: true });
      await mkdir(serviceDir, { recursive: true });

      const manifest = {
        name: "fixture",
        version: "1.0.0",
        dependencies: {
          axios: "^1.0.0",
        },
      };

      await writeFile(
        path.join(appDir, "package.json"),
        JSON.stringify(manifest, null, 2),
      );
      await writeFile(
        path.join(serviceDir, "package.json"),
        JSON.stringify(manifest, null, 2),
      );

      const result = await scanDependencySubsystem({
        path: repoPath,
        ecosystems: ["npm"],
        skipSecurity: true,
        skipUsage: true,
        concurrency: 1,
      });

      const componentNames = result.summary.byComponent.map(
        (component) => component.component,
      );

      expect(componentNames).toContain("apps/web");
      expect(componentNames).toContain("services/api");
      expect(result.totalDependencies).toBe(2);
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("exposes vulnerability key debug stats when enabled", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-deps-debug-"),
    );

    try {
      await writeFile(
        path.join(repoPath, "package.json"),
        JSON.stringify(
          {
            name: "fixture",
            version: "1.0.0",
            dependencies: {
              axios: "^1.0.0",
            },
            devDependencies: {
              axios: "^1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const result = await scanDependencySubsystem({
        path: repoPath,
        ecosystems: ["npm"],
        skipSecurity: true,
        skipUsage: true,
        concurrency: 1,
        debugVulnerabilityKeys: true,
      });

      expect(result.debug).toBeDefined();
      expect(result.debug?.vulnerabilityKeyStats.totalDependencies).toBe(1);
      expect(result.debug?.vulnerabilityKeyStats.uniqueKeys).toBe(1);
      expect(result.debug?.vulnerabilityKeyStats.duplicateKeys).toBe(0);
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
