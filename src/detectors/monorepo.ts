import path from "path";
import {
  type ComponentInfo,
  discoverComponents,
} from "../utils/component-discovery";
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
  ["melos.yaml", "Melos (Dart)"],
  ["pants.toml", "Pants"],
  ["WORKSPACE", "Bazel"],
  ["WORKSPACE.bazel", "Bazel"],
  ["MODULE.bazel", "Bazel"],
]);

/** Extension-based monorepo markers (matched by extension, not exact name). */
const MONOREPO_EXT_MARKERS: ReadonlyMap<string, string> = new Map([
  [".sln", ".NET Solution"],
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
  "tooling",
  "scripts",
  "e2e",
  "crates",
  "python",
];

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

    // Check extension-based monorepo markers (.sln)
    for (const [ext, toolName] of MONOREPO_EXT_MARKERS) {
      const files = index.getByExtensionPrimary(ext);
      if (files.length > 0) {
        isMonorepo = true;
        findings.push({
          value: toolName,
          confidence: 1.0,
          evidence: [`found ${files[0]!.name}`],
        });
      }
    }

    // Discover .NET solution components from .sln files
    for (const slnFile of index.getByExtensionPrimary(".sln")) {
      const content = await readText(slnFile.path);
      if (!content) continue;
      // Parse: Project("{GUID}") = "Name", "Path\To\Project.csproj", "{GUID}"
      const projRegex =
        /Project\("[^"]*"\)\s*=\s*"([^"]+)"\s*,\s*"([^"]+\.(?:csproj|fsproj|vbproj))"/g;
      let pm: RegExpExecArray | null;
      while ((pm = projRegex.exec(content)) !== null) {
        const projName = pm[1]!;
        const projPath = pm[2]!.replace(/\\/g, "/");
        const compPath = projPath.split("/").slice(0, -1).join("/");
        if (compPath && !componentHints.some((c) => c.path === compPath)) {
          componentHints.push({ path: compPath, name: projName });
        }
      }
    }

    // Parse pnpm-workspace.yaml `packages:` globs into components
    if (index.hasFile("pnpm-workspace.yaml")) {
      const yamlText = await readText(
        path.join(rootPath, "pnpm-workspace.yaml"),
      );
      if (yamlText) {
        for (const glob of parsePnpmWorkspaceGlobs(yamlText)) {
          if (glob.startsWith("!")) continue;
          const isLiteral = !glob.includes("*");
          if (isLiteral) {
            const manifestFile = index
              .getByNamePrimary("package.json")
              .find((f) => f.relativePath === `${glob}/package.json`);
            if (manifestFile) {
              const pkg = await readJson<PackageJson>(manifestFile.path);
              if (!componentHints.some((c) => c.path === glob)) {
                componentHints.push({
                  path: glob,
                  name: pkg?.name ?? glob.split("/").pop()!,
                  description: pkg?.description,
                  manifestPath: manifestFile.path,
                  manifestName: "package.json",
                });
              }
            }
          } else {
            const parentDir = glob.split("/")[0]!;
            if (parentDir && parentDir !== "*") {
              for (const comp of await discoverComponents(index, parentDir)) {
                if (!componentHints.some((c) => c.path === comp.path)) {
                  componentHints.push(comp);
                }
              }
            }
          }
        }
      }
    }

    // Parse go.work `use (...)` block into components
    if (index.hasFile("go.work")) {
      const goWork = await readText(path.join(rootPath, "go.work"));
      if (goWork) {
        for (const usePath of parseGoWorkUseDirective(goWork)) {
          if (componentHints.some((c) => c.path === usePath)) continue;
          const goModRel = `${usePath}/go.mod`;
          const goModFile = index
            .getByNamePrimary("go.mod")
            .find((f) => f.relativePath === goModRel);
          componentHints.push({
            path: usePath,
            name: usePath.split("/").pop() ?? usePath,
            ...(goModFile
              ? { manifestPath: goModFile.path, manifestName: "go.mod" }
              : {}),
          });
        }
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
        // Skip negation patterns (e.g. "!packages/**/test/**")
        if (glob.startsWith("!")) continue;

        const isLiteral = !glob.includes("*");
        if (isLiteral) {
          // Literal workspace path (e.g. "e2e") — treat as a direct component
          const manifestFile = index
            .getByNamePrimary("package.json")
            .find((f) => f.relativePath === `${glob}/package.json`);
          if (manifestFile) {
            const pkg = await readJson<PackageJson>(manifestFile.path);
            componentHints.push({
              path: glob,
              name: pkg?.name ?? glob.split("/").pop()!,
              description: pkg?.description,
              manifestPath: manifestFile.path,
              manifestName: "package.json",
            });
          }
        } else {
          const parentDir = glob.split("/")[0]!;
          if (parentDir && parentDir !== "*") {
            componentHints.push(
              ...(await discoverComponents(index, parentDir)),
            );
          }
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

    // Check Elixir umbrella project
    const mixExs = await readText(path.join(rootPath, "mix.exs"));
    if (mixExs?.includes("apps_path")) {
      isMonorepo = true;
      findings.push({
        value: "Elixir umbrella",
        confidence: 1.0,
        evidence: ["mix.exs contains apps_path (umbrella project)"],
      });
      // Discover apps under apps/ directory
      const appsComponents = await discoverComponents(index, "apps");
      for (const comp of appsComponents) {
        if (!componentHints.some((c) => c.path === comp.path)) {
          componentHints.push(comp);
        }
      }
    }

    // Check Scala SBT multi-project build
    const buildSbt = await readText(path.join(rootPath, "build.sbt"));
    if (
      buildSbt &&
      (/lazy\s+val\s+\w+\s*=\s*\(?project/.test(buildSbt) ||
        buildSbt.includes(".aggregate("))
    ) {
      isMonorepo = true;
      findings.push({
        value: "SBT multi-project",
        confidence: 1.0,
        evidence: ["build.sbt contains multi-project definitions"],
      });
    }

    // Check Gradle multi-project (settings.gradle / settings.gradle.kts)
    for (const settingsName of ["settings.gradle", "settings.gradle.kts"]) {
      const settingsContent = await readText(path.join(rootPath, settingsName));
      if (settingsContent) {
        // Find all include statements, then extract quoted module names from them
        const includeLinePattern = /include\s*\(?([^)\n]+)\)?/g;
        const quotedModulePattern = /['"](:?[^'"]+)['"]/g;
        let hasIncludes = false;
        let lineMatch: RegExpExecArray | null;
        while (
          (lineMatch = includeLinePattern.exec(settingsContent)) !== null
        ) {
          const args = lineMatch[1]!;
          let qm: RegExpExecArray | null;
          while ((qm = quotedModulePattern.exec(args)) !== null) {
            hasIncludes = true;
            const modulePath = qm[1]!.replace(/^:/, "").replace(/:/g, "/");
            if (
              modulePath &&
              !componentHints.some((c) => c.path === modulePath)
            ) {
              componentHints.push({
                path: modulePath,
                name: path.basename(modulePath),
              });
            }
          }
          quotedModulePattern.lastIndex = 0;
        }
        if (hasIncludes) {
          isMonorepo = true;
          const toolName =
            settingsName === "settings.gradle.kts"
              ? "Gradle multi-project (Kotlin DSL)"
              : "Gradle multi-project";
          findings.push({
            value: toolName,
            confidence: 1.0,
            evidence: [`${settingsName} contains include directives`],
          });
        }
      }
    }

    // Check Maven multi-module (pom.xml with <modules>)
    const pomXml = await readText(path.join(rootPath, "pom.xml"));
    if (pomXml?.includes("<modules>")) {
      const moduleRegex = /<module>([^<]+)<\/module>/g;
      let hasModules = false;
      let mm: RegExpExecArray | null;
      while ((mm = moduleRegex.exec(pomXml)) !== null) {
        hasModules = true;
        const modulePath = mm[1]!.trim();
        if (modulePath && !componentHints.some((c) => c.path === modulePath)) {
          componentHints.push({
            path: modulePath,
            name: path.basename(modulePath),
          });
        }
      }
      if (hasModules) {
        isMonorepo = true;
        findings.push({
          value: "Maven multi-module",
          confidence: 1.0,
          evidence: ["pom.xml contains <modules>"],
        });
      }
    }

    // Check Python uv workspaces (pyproject.toml with [tool.uv.workspace])
    const pyprojectToml = await readText(path.join(rootPath, "pyproject.toml"));
    if (pyprojectToml?.includes("[tool.uv.workspace]")) {
      isMonorepo = true;
      findings.push({
        value: "uv workspace",
        confidence: 1.0,
        evidence: ["pyproject.toml contains [tool.uv.workspace]"],
      });
      // Extract members = ["packages/*", ...] and discover components
      const membersMatch = pyprojectToml.match(
        /\[tool\.uv\.workspace\][^[]*members\s*=\s*\[([^\]]*)\]/s,
      );
      if (membersMatch) {
        const memberEntries = membersMatch[1]!.match(/["']([^"']+)["']/g);
        for (const entry of memberEntries ?? []) {
          const memberGlob = entry.replace(/["']/g, "");
          const parentDir = memberGlob.split("/")[0]!;
          if (parentDir && parentDir !== "*") {
            const newComponents = await discoverComponents(index, parentDir);
            for (const comp of newComponents) {
              if (!componentHints.some((c) => c.path === comp.path)) {
                componentHints.push(comp);
              }
            }
          }
        }
      }
    }

    // Check Dart Melos monorepo components (pubspec.yaml in subdirs)
    if (findings.some((f) => f.value === "Melos (Dart)")) {
      for (const pubspec of index.getByNamePrimary("pubspec.yaml")) {
        const relDir = pubspec.relativePath.split("/").slice(0, -1).join("/");
        if (
          relDir &&
          relDir !== "." &&
          !componentHints.some((c) => c.path === relDir)
        ) {
          const content = await readJson<{
            name?: string;
            description?: string;
          }>(pubspec.path);
          componentHints.push({
            path: relDir,
            name: content?.name ?? path.basename(relDir),
            description: content?.description,
          });
        }
      }
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

function parseGoWorkUseDirective(text: string): string[] {
  const out: string[] = [];
  const blockMatch = text.match(/use\s*\(([^)]*)\)/);
  if (blockMatch) {
    for (const raw of blockMatch[1]!.split("\n")) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      if (!line) continue;
      out.push(line.replace(/^\.\//, ""));
    }
    return out;
  }
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    const m = line.match(/^use\s+(\S+)$/);
    if (m) out.push(m[1]!.replace(/^\.\//, ""));
  }
  return out;
}

function parsePnpmWorkspaceGlobs(yamlText: string): string[] {
  const lines = yamlText.split("\n");
  const out: string[] = [];
  let inPackages = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "");
    if (/^\s*packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const m = line.match(/^\s*-\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (m) {
        out.push(m[1]!);
        continue;
      }
      if (/^\S/.test(line) && line.trim().length > 0) {
        inPackages = false;
      }
    }
  }
  return out;
}
