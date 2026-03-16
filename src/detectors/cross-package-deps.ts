import type {
  CrossPackageDependencyGraph,
  PackageDependencyEdge,
} from "../types";
import {
  type ComponentInfo,
  discoverComponents,
} from "../utils/component-discovery";
import type { FileIndex } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

// ─── Manifest parsers ────────────────────────────────────────────────

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface ParsedComponent {
  path: string;
  name: string;
  ecosystem: string;
  deps: { name: string; isDev: boolean }[];
}

const parseNpmComponent = async (
  comp: ComponentInfo,
): Promise<ParsedComponent | undefined> => {
  if (comp.manifestName !== "package.json" || !comp.manifestPath) return;
  const pkg = await readJson<PackageJson>(comp.manifestPath);
  if (!pkg?.name) return;

  const deps: { name: string; isDev: boolean }[] = [];
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    deps.push({ name, isDev: false });
  }
  for (const name of Object.keys(pkg.devDependencies ?? {})) {
    deps.push({ name, isDev: true });
  }
  for (const name of Object.keys(pkg.peerDependencies ?? {})) {
    deps.push({ name, isDev: false });
  }

  return { path: comp.path, name: pkg.name, ecosystem: "npm", deps };
};

const parseGoComponent = async (
  comp: ComponentInfo,
): Promise<ParsedComponent | undefined> => {
  if (comp.manifestName !== "go.mod" || !comp.manifestPath) return;
  const content = await readText(comp.manifestPath);
  if (!content) return;

  const moduleMatch = /^module\s+(\S+)/m.exec(content);
  if (!moduleMatch) return;
  const moduleName = moduleMatch[1]!;

  const deps: { name: string; isDev: boolean }[] = [];
  const requireRegex = /^\s*require\s+(\S+)/gm;
  // Also handle require block
  const blockRegex = /require\s*\(([\s\S]*?)\)/g;

  let m: RegExpExecArray | null;
  while ((m = requireRegex.exec(content)) !== null) {
    if (!m[1]!.startsWith("(")) {
      deps.push({ name: m[1]!, isDev: false });
    }
  }
  while ((m = blockRegex.exec(content)) !== null) {
    const block = m[1]!;
    const lineRegex = /^\s*(\S+)\s/gm;
    let lm: RegExpExecArray | null;
    while ((lm = lineRegex.exec(block)) !== null) {
      deps.push({ name: lm[1]!, isDev: false });
    }
  }

  return { path: comp.path, name: moduleName, ecosystem: "go", deps };
};

const parseCargoComponent = async (
  comp: ComponentInfo,
): Promise<ParsedComponent | undefined> => {
  if (comp.manifestName !== "Cargo.toml" || !comp.manifestPath) return;
  const content = await readText(comp.manifestPath);
  if (!content) return;

  const nameMatch = /\[package\][\s\S]*?name\s*=\s*"([^"]+)"/.exec(content);
  if (!nameMatch) return;
  const crateName = nameMatch[1]!;

  const deps: { name: string; isDev: boolean }[] = [];

  // Parse [dependencies] section for name-based and path-based deps
  const depSectionRegex =
    /\[(dependencies|dev-dependencies)\]([\s\S]*?)(?=\n\[|$)/g;
  let sm: RegExpExecArray | null;
  while ((sm = depSectionRegex.exec(content)) !== null) {
    const isDev = sm[1] === "dev-dependencies";
    const section = sm[2]!;

    // Inline: bar = { path = "../bar" } or bar = "1.0"
    const depLineRegex = /^(\w[\w-]*)\s*=/gm;
    let dm: RegExpExecArray | null;
    while ((dm = depLineRegex.exec(section)) !== null) {
      deps.push({ name: dm[1]!, isDev });
    }
  }

  return { path: comp.path, name: crateName, ecosystem: "cargo", deps };
};

const parsePythonComponent = async (
  comp: ComponentInfo,
): Promise<ParsedComponent | undefined> => {
  if (comp.manifestName !== "pyproject.toml" || !comp.manifestPath) return;
  const content = await readText(comp.manifestPath);
  if (!content) return;

  const nameMatch = /\[project\][\s\S]*?name\s*=\s*"([^"]+)"/.exec(content);
  if (!nameMatch) return;
  const pkgName = nameMatch[1]!;

  const deps: { name: string; isDev: boolean }[] = [];
  const depsMatch = /dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(content);
  if (depsMatch) {
    const depList = depsMatch[1]!;
    const depRegex = /"([a-zA-Z0-9_-]+)/g;
    let dm: RegExpExecArray | null;
    while ((dm = depRegex.exec(depList)) !== null) {
      deps.push({ name: dm[1]!, isDev: false });
    }
  }

  return { path: comp.path, name: pkgName, ecosystem: "pypi", deps };
};

// ─── Component directory scanning ────────────────────────────────────

/** Conventional component directories (same as monorepo detector). */
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

// ─── .NET (NuGet / ProjectReference) ─────────────────────────────────

const DOTNET_PROJECT_EXTS = [".csproj", ".fsproj", ".vbproj"];

interface DotNetProject {
  path: string; // component directory
  projectFile: string; // relative path to .csproj/.fsproj/.vbproj
  assemblyName: string; // derived from filename
  projectReferences: string[]; // relative paths from <ProjectReference>
}

/** Discover .NET projects and their ProjectReference dependencies. */
const discoverDotNetProjects = async (
  index: FileIndex,
): Promise<DotNetProject[]> => {
  const projects: DotNetProject[] = [];

  for (const ext of DOTNET_PROJECT_EXTS) {
    for (const file of index.getByExtensionPrimary(ext)) {
      const content = await readText(file.path);
      if (!content) continue;

      const dirPath = file.relativePath.split("/").slice(0, -1).join("/");
      const assemblyName = file.name.replace(ext, "");

      const refs: string[] = [];
      const refRegex = /<ProjectReference\s+Include="([^"]+)"/g;
      let rm: RegExpExecArray | null;
      while ((rm = refRegex.exec(content)) !== null) {
        refs.push(rm[1]!);
      }

      projects.push({
        path: dirPath || ".",
        projectFile: file.relativePath,
        assemblyName,
        projectReferences: refs,
      });
    }
  }

  return projects;
};

// ─── Maven ──────────────────────────────────────────────────────────

const parseMavenComponent = async (
  comp: ComponentInfo,
): Promise<ParsedComponent | undefined> => {
  if (comp.manifestName !== "pom.xml" || !comp.manifestPath) return;
  const content = await readText(comp.manifestPath);
  if (!content) return;

  const groupId = /<groupId>([^<]+)<\/groupId>/.exec(content)?.[1] ?? "unknown";
  const artifactId =
    /<artifactId>([^<]+)<\/artifactId>/.exec(content)?.[1] ?? comp.name;
  const name = `${groupId}:${artifactId}`;

  const deps: { name: string; isDev: boolean }[] = [];
  const depRegex =
    /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>[\s\S]*?<\/dependency>/g;
  let m: RegExpExecArray | null;
  while ((m = depRegex.exec(content)) !== null) {
    const depName = `${m[1]}:${m[2]}`;
    const isDev = /<scope>test<\/scope>/.test(m[0]);
    deps.push({ name: depName, isDev });
  }

  return { path: comp.path, name, ecosystem: "maven", deps };
};

// ─── Gradle ─────────────────────────────────────────────────────────

const parseGradleComponent = async (
  comp: ComponentInfo,
): Promise<ParsedComponent | undefined> => {
  if (
    comp.manifestName !== "build.gradle" &&
    comp.manifestName !== "build.gradle.kts"
  )
    return;
  if (!comp.manifestPath) return;
  const content = await readText(comp.manifestPath);
  if (!content) return;

  // Use dir name as component name
  const name = comp.name;

  const deps: { name: string; isDev: boolean }[] = [];
  const depRegex =
    /(implementation|api|compileOnly|runtimeOnly|testImplementation|testCompileOnly)\s*\(?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = depRegex.exec(content)) !== null) {
    const isDev = m[1] === "testImplementation" || m[1] === "testCompileOnly";
    deps.push({ name: m[2]!, isDev });
  }

  return { path: comp.path, name, ecosystem: "gradle", deps };
};

// ─── Bundler (Ruby) ─────────────────────────────────────────────────

const parseBundlerComponent = async (
  comp: ComponentInfo,
): Promise<ParsedComponent | undefined> => {
  if (comp.manifestName !== "Gemfile" || !comp.manifestPath) return;
  const content = await readText(comp.manifestPath);
  if (!content) return;

  const name = comp.name;
  const deps: { name: string; isDev: boolean }[] = [];
  const gemRegex = /gem\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = gemRegex.exec(content)) !== null) {
    deps.push({ name: m[1]!, isDev: false });
  }

  return { path: comp.path, name, ecosystem: "bundler", deps };
};

// ─── Composer (PHP) ─────────────────────────────────────────────────

interface ComposerJson {
  name?: string;
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
}

const parseComposerComponent = async (
  comp: ComponentInfo,
): Promise<ParsedComponent | undefined> => {
  if (comp.manifestName !== "composer.json" || !comp.manifestPath) return;
  const pkg = await readJson<ComposerJson>(comp.manifestPath);
  if (!pkg?.name) return;

  const deps: { name: string; isDev: boolean }[] = [];
  for (const name of Object.keys(pkg.require ?? {})) {
    if (name === "php" || name.startsWith("ext-")) continue;
    deps.push({ name, isDev: false });
  }
  for (const name of Object.keys(pkg["require-dev"] ?? {})) {
    deps.push({ name, isDev: true });
  }

  return { path: comp.path, name: pkg.name, ecosystem: "composer", deps };
};

const PARSERS = [
  parseNpmComponent,
  parseGoComponent,
  parseCargoComponent,
  parsePythonComponent,
  parseMavenComponent,
  parseGradleComponent,
  parseBundlerComponent,
  parseComposerComponent,
];

// ─── Detector ────────────────────────────────────────────────────────

registerDetector({
  id: "cross-package-deps",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    // Discover all components across conventional dirs
    const allComponents: ComponentInfo[] = [];
    for (const dir of COMPONENT_DIRS) {
      const filesUnder = index.getUnderPath(dir);
      if (filesUnder.length > 0) {
        const components = await discoverComponents(index, dir);
        for (const comp of components) {
          if (!allComponents.some((c) => c.path === comp.path)) {
            allComponents.push(comp);
          }
        }
      }
    }

    // Also discover .NET projects (they aren't found by manifest-based discovery)
    const dotnetProjects = await discoverDotNetProjects(index);
    const hasDotNetMultiProject = dotnetProjects.length >= 2;

    if (allComponents.length < 2 && !hasDotNetMultiProject) {
      return {
        detectorId: "cross-package-deps",
        findings: [],
        metadata: {
          crossPackageDeps: {
            edges: [],
            nodes: allComponents.map((c) => c.path),
            orphans: allComponents.map((c) => c.path),
          },
        },
      };
    }

    // Parse all components and their deps
    const parsedComponents: ParsedComponent[] = [];
    for (const comp of allComponents) {
      for (const parser of PARSERS) {
        const parsed = await parser(comp);
        if (parsed) {
          parsedComponents.push(parsed);
          break;
        }
      }
    }

    // Build name → component path lookup
    const nameToPath = new Map<string, string>();
    const pathToName = new Map<string, string>();
    for (const pc of parsedComponents) {
      nameToPath.set(pc.name, pc.path);
      pathToName.set(pc.path, pc.name);
    }

    // Build edges from manifest-based parsers
    const edges: PackageDependencyEdge[] = [];
    for (const pc of parsedComponents) {
      for (const dep of pc.deps) {
        const targetPath = nameToPath.get(dep.name);
        if (targetPath && targetPath !== pc.path) {
          edges.push({
            from: pc.path,
            to: targetPath,
            fromName: pc.name,
            toName: dep.name,
            ecosystem: pc.ecosystem,
            isDev: dep.isDev,
          });
        }
      }
    }

    // .NET ProjectReference-based edges
    if (hasDotNetMultiProject) {
      // Build a lookup from project file relative path → project info
      const projectFileToProject = new Map<string, DotNetProject>();
      for (const proj of dotnetProjects) {
        projectFileToProject.set(proj.projectFile, proj);
      }

      for (const proj of dotnetProjects) {
        for (const ref of proj.projectReferences) {
          // Resolve the relative path from the project's directory
          const refParts = ref.replace(/\\/g, "/").split("/");
          const projDirParts = proj.path ? proj.path.split("/") : [];
          const resolvedParts = [...projDirParts];
          for (const part of refParts) {
            if (part === "..") resolvedParts.pop();
            else if (part !== ".") resolvedParts.push(part);
          }
          const resolvedFile = resolvedParts.join("/");

          const target = projectFileToProject.get(resolvedFile);
          if (target && target.path !== proj.path) {
            // Add to nodes tracking
            if (!pathToName.has(proj.path)) {
              pathToName.set(proj.path, proj.assemblyName);
            }
            if (!pathToName.has(target.path)) {
              pathToName.set(target.path, target.assemblyName);
            }

            edges.push({
              from: proj.path,
              to: target.path,
              fromName: proj.assemblyName,
              toName: target.assemblyName,
              ecosystem: "nuget",
              isDev: false,
            });
          }
        }
      }

      // Include .NET projects in the node list
      for (const proj of dotnetProjects) {
        if (!parsedComponents.some((c) => c.path === proj.path)) {
          parsedComponents.push({
            path: proj.path,
            name: proj.assemblyName,
            ecosystem: "nuget",
            deps: [],
          });
        }
      }
    }

    // Compute nodes and orphans
    const allNodes = parsedComponents.map((c) => c.path);
    const inEdge = new Set<string>();
    for (const e of edges) {
      inEdge.add(e.from);
      inEdge.add(e.to);
    }
    const orphans = allNodes.filter((n) => !inEdge.has(n));

    const graph: CrossPackageDependencyGraph = {
      edges,
      nodes: allNodes,
      orphans,
    };

    const findings: Finding[] =
      edges.length > 0
        ? [
            {
              value: "cross-package-deps",
              confidence: 1.0,
              evidence: [
                `${edges.length} internal dependency edge${edges.length > 1 ? "s" : ""} across ${allNodes.length} packages`,
              ],
            },
          ]
        : [];

    return {
      detectorId: "cross-package-deps",
      findings,
      metadata: { crossPackageDeps: graph },
    };
  },
});
