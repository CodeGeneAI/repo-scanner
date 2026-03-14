import path from "path";
import type { Dependency } from "../types";
import { findFiles, readJson, readText } from "../utils/fs";
import { buildImportPatterns, type EcosystemParser } from "./types";

interface PackageJson {
  name?: string;
  version?: string;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  catalogs?: Record<string, Record<string, string>>;
}

interface PackageLockJson {
  packages?: Record<string, { version?: string }>;
  dependencies?: Record<string, { version?: string }>;
}

interface BunLockJson {
  packages?: Record<string, unknown[]>;
}

/**
 * Parse pnpm-lock.yaml for resolved versions using regex.
 * Handles both v9 (importers.*.deps.version) and v5 (top-level dependencies).
 */
const parsePnpmLock = (
  content: string,
  versions: Map<string, string>,
): void => {
  // v9 format: packages section has keys like "name@version":
  //   '@babel/core@7.29.0':
  const pkgKeyRe = /^ {2}'?(@?[^@'\s]+)@([^':\s]+)'?:/gm;
  let m: RegExpExecArray | null;
  while ((m = pkgKeyRe.exec(content)) !== null) {
    const name = m[1]!;
    const ver = m[2]!;
    if (!versions.has(name)) {
      versions.set(name, ver);
    }
  }

  // v5 format: top-level dependencies/devDependencies with "name: version"
  if (versions.size === 0) {
    const depSectionRe =
      /^(?:dependencies|devDependencies):\n((?:[ ]{2,}.+\n)*)/gm;
    let secMatch: RegExpExecArray | null;
    while ((secMatch = depSectionRe.exec(content)) !== null) {
      const block = secMatch[1]!;
      const lineRe = /^ {2,}'?(@?[^@'\s:]+)'?:\s+([^\s]+)/gm;
      let lineMatch: RegExpExecArray | null;
      while ((lineMatch = lineRe.exec(block)) !== null) {
        const name = lineMatch[1]!;
        const ver = lineMatch[2]!;
        if (!versions.has(name)) {
          versions.set(name, ver);
        }
      }
    }
  }
};

/**
 * Walk up from a directory to find the workspace root (package.json with "workspaces").
 */
const findWorkspaceRoot = async (
  startDir: string,
): Promise<string | undefined> => {
  let dir = startDir;
  const root = path.parse(dir).root;
  while (dir !== root) {
    const pkg = await readJson<PackageJson>(path.join(dir, "package.json"));
    if (pkg?.workspaces) return dir;
    dir = path.dirname(dir);
  }
  return undefined;
};

/**
 * Build a flat map of package name → catalog version from the root catalogs config.
 */
const buildCatalogMap = (
  catalogs: Record<string, Record<string, string>>,
): Map<string, string> => {
  const map = new Map<string, string>();
  for (const deps of Object.values(catalogs)) {
    for (const [name, version] of Object.entries(deps)) {
      if (!map.has(name)) map.set(name, version);
    }
  }
  return map;
};

/**
 * Build a map of workspace package name → version by scanning all package.json
 * files within the workspace root.
 */
const buildWorkspaceVersionMap = async (
  manifestPaths: readonly string[],
): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  for (const manifestPath of manifestPaths) {
    const pkg = await readJson<PackageJson>(manifestPath);
    if (pkg?.name && pkg.version) {
      map.set(pkg.name, pkg.version);
    }
  }
  return map;
};

/**
 * Resolve catalog: and workspace: version references to actual version strings.
 */
const resolveSpecialVersion = (
  version: string,
  depName: string,
  catalogMap: Map<string, string>,
  workspaceMap: Map<string, string>,
): string => {
  if (version.startsWith("catalog:")) {
    return catalogMap.get(depName) ?? version;
  }
  if (version.startsWith("workspace:")) {
    const workspaceVersion = workspaceMap.get(depName);
    if (!workspaceVersion) return version;
    const protocol = version.slice("workspace:".length); // *, ^, ~
    if (protocol === "*") return workspaceVersion;
    // workspace:^ → ^version, workspace:~ → ~version
    return `${protocol}${workspaceVersion}`;
  }
  return version;
};

const extractDeps = (
  deps: Record<string, string> | undefined,
  manifestPath: string,
  isDev: boolean,
  isOptional: boolean,
  resolvedVersions: Map<string, string>,
  catalogMap: Map<string, string>,
  workspaceMap: Map<string, string>,
): Dependency[] => {
  if (!deps) return [];
  return Object.entries(deps).map(([name, version]) => ({
    name,
    currentVersion: resolveSpecialVersion(
      version,
      name,
      catalogMap,
      workspaceMap,
    ),
    resolvedVersion: resolvedVersions.get(name),
    ecosystem: "npm" as const,
    manifestPath,
    isDev,
    isOptional,
  }));
};

const loadResolvedVersions = async (
  manifestDir: string,
): Promise<Map<string, string>> => {
  const versions = new Map<string, string>();

  // Try package-lock.json
  const lockPath = path.join(manifestDir, "package-lock.json");
  const lock = await readJson<PackageLockJson>(lockPath);
  if (lock) {
    // npm v7+ format
    if (lock.packages) {
      for (const [key, val] of Object.entries(lock.packages)) {
        if (!key || !val.version) continue;
        const name = key.replace(/^node_modules\//, "");
        if (name && !name.includes("node_modules/")) {
          versions.set(name, val.version);
        }
      }
    }
    // npm v6 format
    if (lock.dependencies) {
      for (const [name, val] of Object.entries(lock.dependencies)) {
        if (val.version && !versions.has(name)) {
          versions.set(name, val.version);
        }
      }
    }
    return versions;
  }

  // Try yarn.lock (simple line-based parsing for resolved versions)
  const yarnContent = await readText(path.join(manifestDir, "yarn.lock"));
  if (yarnContent) {
    let currentPkg: string | undefined;
    for (const line of yarnContent.split("\n")) {
      const headerMatch = line.match(/^"?(@?[^@"]+)@[^:]+:?\s*$/);
      if (headerMatch) {
        currentPkg = headerMatch[1];
        continue;
      }
      if (currentPkg) {
        const verMatch = line.match(/^\s+version\s+"([^"]+)"/);
        if (verMatch) {
          versions.set(currentPkg, verMatch[1]!);
          currentPkg = undefined;
        }
      }
    }
    if (versions.size > 0) return versions;
  }

  // Try pnpm-lock.yaml (regex-based, no YAML parser needed)
  const pnpmContent = await readText(path.join(manifestDir, "pnpm-lock.yaml"));
  if (pnpmContent) {
    parsePnpmLock(pnpmContent, versions);
    if (versions.size > 0) return versions;
  }

  // Try bun.lock (JSON format)
  const bunLock = await readJson<BunLockJson>(
    path.join(manifestDir, "bun.lock"),
  );
  if (bunLock?.packages) {
    for (const [name, tuple] of Object.entries(bunLock.packages)) {
      if (!Array.isArray(tuple) || !tuple[0]) continue;
      const resolved = tuple[0] as string;
      const lastAt = resolved.lastIndexOf("@");
      if (lastAt > 0) {
        versions.set(name, resolved.slice(lastAt + 1));
      }
    }
  }

  return versions;
};

export const javascriptParser: EcosystemParser = {
  ecosystem: "npm",
  manifestPatterns: ["package.json"],

  async detectFiles(rootPath: string): Promise<readonly string[]> {
    return findFiles(rootPath, ["package.json"]);
  },

  async parseDependencies(
    manifestPaths: readonly string[],
  ): Promise<readonly Dependency[]> {
    const seen = new Set<string>();
    const allDeps: Dependency[] = [];

    // Pre-compute workspace root, catalog map, and workspace version map once
    let catalogMap = new Map<string, string>();
    let workspaceMap = new Map<string, string>();
    let rootResolvedVersions: Map<string, string> | undefined;
    let workspaceRootDir: string | undefined;

    if (manifestPaths.length > 0) {
      const firstDir = path.dirname(manifestPaths[0]!);
      workspaceRootDir = await findWorkspaceRoot(firstDir);

      if (workspaceRootDir) {
        const rootPkg = await readJson<PackageJson>(
          path.join(workspaceRootDir, "package.json"),
        );
        if (rootPkg?.catalogs) {
          catalogMap = buildCatalogMap(rootPkg.catalogs);
        }
        workspaceMap = await buildWorkspaceVersionMap(manifestPaths);
        rootResolvedVersions = await loadResolvedVersions(workspaceRootDir);
      }
    }

    for (const manifestPath of manifestPaths) {
      const pkg = await readJson<PackageJson>(manifestPath);
      if (!pkg) continue;

      const dir = path.dirname(manifestPath);
      // Use local lockfile if present, otherwise fall back to workspace root lockfile
      let resolvedVersions = await loadResolvedVersions(dir);
      if (
        resolvedVersions.size === 0 &&
        rootResolvedVersions &&
        dir !== workspaceRootDir
      ) {
        resolvedVersions = rootResolvedVersions;
      }

      const depGroups = [
        ...extractDeps(
          pkg.dependencies,
          manifestPath,
          false,
          false,
          resolvedVersions,
          catalogMap,
          workspaceMap,
        ),
        ...extractDeps(
          pkg.devDependencies,
          manifestPath,
          true,
          false,
          resolvedVersions,
          catalogMap,
          workspaceMap,
        ),
        ...extractDeps(
          pkg.optionalDependencies,
          manifestPath,
          false,
          true,
          resolvedVersions,
          catalogMap,
          workspaceMap,
        ),
        ...extractDeps(
          pkg.peerDependencies,
          manifestPath,
          false,
          true,
          resolvedVersions,
          catalogMap,
          workspaceMap,
        ),
      ];

      for (const dep of depGroups) {
        const key = `${dep.name}@${manifestPath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allDeps.push(dep);
      }
    }

    return allDeps;
  },

  getImportPatterns(dependencies) {
    return buildImportPatterns("npm", dependencies);
  },
};
