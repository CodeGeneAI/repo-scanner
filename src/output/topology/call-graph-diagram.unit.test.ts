import { describe, expect, it } from "vitest";
import type { RepoScanResult } from "../../types";
import { generateCallGraphDiagram } from "./call-graph-diagram";

const buildBaseResult = (): RepoScanResult => ({
  inventory: {
    languages: [],
    languageStats: [],
    totalFiles: 0,
    totalLinesOfCode: 0,
    frameworks: [],
    datastores: [],
    dependencyManagers: [],
    containerization: [],
    iac: [],
    testing: [],
    buildTools: [],
    linting: [],
    codeQuality: [],
    deploymentPlatforms: [],
    repoTools: [],
    envVars: [],
    runtimes: [],
  },
  architecture: {
    monorepo: false,
    components: [],
  },
  buildAndTest: {
    buildCommands: [],
    testCommands: [],
    lintCommands: [],
    ciSystems: [],
  },
  signals: {
    hasReadme: false,
    hasCi: false,
    hasContainerization: false,
    hasIaC: false,
    hasTests: false,
    hasTypedContracts: false,
    hasQualityGates: false,
    isPolyglot: false,
    hasDeploymentPlatform: false,
  },
  scanPath: "/tmp/repo",
  timestamp: new Date().toISOString(),
  durationMs: 1,
});

describe("generateCallGraphDiagram", () => {
  it("returns null when call graph is missing", () => {
    const result = buildBaseResult();
    expect(generateCallGraphDiagram(result)).toBeNull();
  });

  it("renders nodes and edges", () => {
    const result: RepoScanResult = {
      ...buildBaseResult(),
      inventory: {
        ...buildBaseResult().inventory,
        callGraph: {
          nodes: [
            { id: "a", name: "handler", file: "src/a.ts", line: 10 },
            { id: "b", name: "service", file: "src/b.ts", line: 20 },
          ],
          edges: [
            {
              callerId: "a",
              calleeId: "b",
              line: 11,
              caller: { name: "handler", file: "src/a.ts" },
              callee: { name: "service", file: "src/b.ts" },
            },
          ],
        },
      },
    };

    const diagram = generateCallGraphDiagram(result);
    expect(diagram?.kind).toBe("call-graph");
    expect(diagram?.mermaid).toContain("flowchart LR");
    expect(diagram?.mermaid).toContain("-->");
  });

  it("uses <br/> instead of backslash-n for line breaks in node labels", () => {
    const result: RepoScanResult = {
      ...buildBaseResult(),
      inventory: {
        ...buildBaseResult().inventory,
        callGraph: {
          nodes: [
            {
              id: "a",
              name: "handler",
              file: "packages/dev-scanner/src/index.ts",
              line: 42,
            },
          ],
          edges: [],
        },
      },
    };

    const diagram = generateCallGraphDiagram(result);
    expect(diagram?.mermaid).toContain("<br/>");
    expect(diagram?.mermaid).not.toContain("\\n");
  });
});
