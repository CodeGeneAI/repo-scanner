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
        skipVersionLookup: true,
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
        skipVersionLookup: true,
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
        skipVersionLookup: true,
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

  it("computes dead dependencies from usage scan results", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-deps-dead-"),
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
              "unused-pkg": "^1.0.0",
            },
          },
          null,
          2,
        ),
      );

      // Create a source file that imports axios but NOT unused-pkg
      await writeFile(
        path.join(repoPath, "index.ts"),
        'import axios from "axios";\nconsole.log(axios);\n',
      );

      const result = await scanDependencySubsystem({
        path: repoPath,
        ecosystems: ["npm"],
        skipSecurity: true,
        skipUsage: false,
        skipVersionLookup: true,
        concurrency: 1,
      });

      expect(result.summary.deadDependencies).toBe(1);
      expect(result.summary.topDead).toHaveLength(1);
      expect(result.summary.topDead[0]?.name).toBe("unused-pkg");
      expect(result.summary.topDead[0]?.ecosystem).toBe("npm");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("excludes dev tooling from dead deps by default", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-deps-dead-dev-"),
    );

    try {
      await writeFile(
        path.join(repoPath, "package.json"),
        JSON.stringify(
          {
            name: "fixture",
            version: "1.0.0",
            dependencies: {
              "unused-pkg": "^1.0.0",
            },
            devDependencies: {
              typescript: "^5.0.0",
              vitest: "^1.0.0",
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
        skipUsage: false,
        skipVersionLookup: true,
        concurrency: 1,
      });

      // Only unused-pkg should be dead; typescript and vitest are excluded
      expect(result.summary.deadDependencies).toBe(1);
      expect(result.summary.topDead[0]?.name).toBe("unused-pkg");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("includes dev tooling in dead deps when includeDevDeadDeps is true", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-deps-dead-include-dev-"),
    );

    try {
      await writeFile(
        path.join(repoPath, "package.json"),
        JSON.stringify(
          {
            name: "fixture",
            version: "1.0.0",
            devDependencies: {
              typescript: "^5.0.0",
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
        skipUsage: false,
        skipVersionLookup: true,
        concurrency: 1,
        includeDevDeadDeps: true,
      });

      // With includeDevDeadDeps, typescript should be reported as dead
      expect(result.summary.deadDependencies).toBe(1);
      expect(result.summary.topDead[0]?.name).toBe("typescript");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("does not count deps as dead when usage scanning is skipped", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-deps-skip-usage-"),
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
        skipVersionLookup: true,
        concurrency: 1,
      });

      // When usage scanning is skipped, nothing should be counted as dead
      expect(result.summary.deadDependencies).toBe(0);
      expect(result.summary.topDead).toHaveLength(0);
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("limits topDead to 5 entries and sorts by ecosystem then name", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-deps-dead-limit-"),
    );

    try {
      await writeFile(
        path.join(repoPath, "package.json"),
        JSON.stringify(
          {
            name: "fixture",
            version: "1.0.0",
            dependencies: {
              "alpha-unused": "^1.0.0",
              "bravo-unused": "^1.0.0",
              "charlie-unused": "^1.0.0",
              "delta-unused": "^1.0.0",
              "echo-unused": "^1.0.0",
              "foxtrot-unused": "^1.0.0",
              "golf-unused": "^1.0.0",
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
        skipUsage: false,
        skipVersionLookup: true,
        concurrency: 1,
      });

      expect(result.summary.deadDependencies).toBe(7);
      expect(result.summary.topDead).toHaveLength(5);
      // Sorted alphabetically by name (same ecosystem)
      expect(result.summary.topDead[0]?.name).toBe("alpha-unused");
      expect(result.summary.topDead[4]?.name).toBe("echo-unused");
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("tracks dead dependencies per component in byComponent", async () => {
    const repoPath = await mkdtemp(
      path.join(os.tmpdir(), "repo-scanner-deps-dead-components-"),
    );

    try {
      const appDir = path.join(repoPath, "apps", "web");
      const svcDir = path.join(repoPath, "services", "api");
      await mkdir(appDir, { recursive: true });
      await mkdir(svcDir, { recursive: true });

      // apps/web has one dead dep
      await writeFile(
        path.join(appDir, "package.json"),
        JSON.stringify({
          name: "@fixture/web",
          version: "1.0.0",
          dependencies: { "dead-in-web": "^1.0.0" },
        }),
      );

      // services/api has two dead deps
      await writeFile(
        path.join(svcDir, "package.json"),
        JSON.stringify({
          name: "@fixture/api",
          version: "1.0.0",
          dependencies: {
            "dead-in-api-1": "^1.0.0",
            "dead-in-api-2": "^1.0.0",
          },
        }),
      );

      const result = await scanDependencySubsystem({
        path: repoPath,
        ecosystems: ["npm"],
        skipSecurity: true,
        skipUsage: false,
        skipVersionLookup: true,
        concurrency: 1,
      });

      expect(result.summary.deadDependencies).toBe(3);

      const webComponent = result.summary.byComponent.find(
        (c) => c.component === "apps/web",
      );
      const apiComponent = result.summary.byComponent.find(
        (c) => c.component === "services/api",
      );

      expect(webComponent?.deadDependencies).toBe(1);
      expect(apiComponent?.deadDependencies).toBe(2);
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
        skipVersionLookup: true,
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
