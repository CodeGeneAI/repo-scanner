import path from "path";
import type { FileIndex } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface PackageJson {
  name?: string;
  description?: string;
  workspaces?: string[] | { packages?: string[] };
}

/** Monorepo markers: file → tool name. */
const MONOREPO_MARKERS: ReadonlyMap<string, string> = new Map([
  ["turbo.json", "Turborepo"],
  ["nx.json", "Nx"],
  ["lerna.json", "Lerna"],
  ["rush.json", "Rush"],
  ["pnpm-workspace.yaml", "pnpm workspaces"],
  ["go.work", "Go workspaces"],
]);

/** Conventional component directories to scan. */
const COMPONENT_DIRS = [
  "apps",
  "app",
  "services",
  "service",
  "packages",
  "libs",
  "lib",
  "modules",
  "infra",
  "infrastructure",
  "terraform",
  "deploy",
  "tools",
  "scripts",
  "e2e",
  "crates",
  "python",
];

interface ComponentInfo {
  path: string;
  name: string;
  description?: string;
}

/**
 * Discover component directories by looking for manifest files under a parent dir.
 * Finds the nearest manifest to the parent dir for each unique component path,
 * supporting deeply nested structures like packages/ai/agent-sdk/package.json.
 */
const discoverComponents = async (
  index: FileIndex,
  parentDir: string,
): Promise<ComponentInfo[]> => {
  const manifests = [
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    "pubspec.yaml",
  ];
  const componentMap = new Map<
    string,
    { file: string; depth: number; manifest: string }
  >();

  for (const manifestName of manifests) {
    for (const file of index.getByNamePrimary(manifestName)) {
      const parts = file.relativePath.split("/");
      // Must be at least parentDir/something/manifest
      if (parts.length < 3 || parts[0] !== parentDir) continue;

      // The component path is everything between parentDir and the manifest file
      // e.g. packages/ai/agent-sdk/package.json → packages/ai/agent-sdk
      const componentPath = parts.slice(0, -1).join("/");
      const depth = parts.length - 2; // depth 1 = direct child, depth 2 = grandchild, etc.

      const existing = componentMap.get(componentPath);
      if (!existing || depth < existing.depth) {
        componentMap.set(componentPath, {
          file: file.path,
          depth,
          manifest: manifestName,
        });
      }
    }
  }

  // Now deduplicate: if both packages/ai and packages/ai/agent-sdk exist,
  // prefer the more specific paths (children) over parents that also have manifests.
  // A parent is only kept if it has NO children.
  const paths = [...componentMap.keys()].sort();
  const keep = new Set<string>();
  for (const p of paths) {
    // Check if this path is a prefix of any other path
    const hasChildren = paths.some(
      (other) => other !== p && other.startsWith(`${p}/`),
    );
    if (!hasChildren) {
      keep.add(p);
    }
  }

  const results: ComponentInfo[] = [];
  for (const [compPath, info] of componentMap) {
    if (!keep.has(compPath)) continue;

    const comp: ComponentInfo = {
      path: compPath,
      name: compPath.split("/").pop()!,
    };

    // Read package.json for richer metadata
    if (info.manifest === "package.json") {
      const pkg = await readJson<PackageJson>(info.file);
      if (pkg?.name) comp.name = pkg.name;
      if (pkg?.description) comp.description = pkg.description;
    }

    results.push(comp);
  }

  return results;
};

registerDetector({
  id: "monorepo",
  async detect(rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const findings: Finding[] = [];
    const componentHints: ComponentInfo[] = [];
    let isMonorepo = false;

    // Check monorepo marker files
    for (const [fileName, toolName] of MONOREPO_MARKERS) {
      if (index.hasFile(fileName)) {
        isMonorepo = true;
        findings.push({
          value: toolName,
          confidence: 1.0,
          evidence: [`found ${fileName}`],
        });
      }
    }

    // Check package.json workspaces
    const rootPkg = await readJson<PackageJson>(
      path.join(rootPath, "package.json"),
    );
    if (rootPkg?.workspaces) {
      isMonorepo = true;
      findings.push({
        value: "npm/yarn workspaces",
        confidence: 1.0,
        evidence: ["package.json contains workspaces field"],
      });

      const globs = Array.isArray(rootPkg.workspaces)
        ? rootPkg.workspaces
        : (rootPkg.workspaces.packages ?? []);

      for (const glob of globs) {
        const parentDir = glob.split("/")[0]!;
        if (parentDir && parentDir !== "*") {
          componentHints.push(...(await discoverComponents(index, parentDir)));
        }
      }
    }

    // Check Cargo workspace
    const cargoToml = await readText(path.join(rootPath, "Cargo.toml"));
    if (cargoToml?.includes("[workspace]")) {
      isMonorepo = true;
      findings.push({
        value: "Cargo workspace",
        confidence: 1.0,
        evidence: ["Cargo.toml contains [workspace]"],
      });
    }

    // Scan conventional component dirs
    for (const dir of COMPONENT_DIRS) {
      const filesUnder = index.getUnderPath(dir);
      if (filesUnder.length > 0) {
        const newComponents = await discoverComponents(index, dir);
        for (const comp of newComponents) {
          if (!componentHints.some((c) => c.path === comp.path)) {
            componentHints.push(comp);
          }
        }
        if (newComponents.length > 1) {
          isMonorepo = true;
        }
      }
    }

    // Add a "monorepo" finding so the aggregator can detect it via findings.length
    if (isMonorepo && !findings.some((f) => f.value === "monorepo")) {
      findings.push({
        value: "monorepo",
        confidence: 1.0,
        evidence: ["detected monorepo structure"],
      });
    }

    return {
      detectorId: "monorepo",
      findings,
      componentHints,
    };
  },
});
