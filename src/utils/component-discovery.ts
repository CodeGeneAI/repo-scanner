import type { FileIndex } from "./file-index";
import { readJson } from "./fs";

interface PackageJson {
  name?: string;
  description?: string;
  workspaces?: string[] | { packages?: string[] };
}

export interface ComponentInfo {
  path: string;
  name: string;
  description?: string;
  /** Absolute path to the manifest file that defined this component. */
  manifestPath?: string;
  /** Which manifest file was matched (e.g. "package.json", "Cargo.toml"). */
  manifestName?: string;
}

/**
 * Discover component directories by looking for manifest files under a parent dir.
 * Finds the nearest manifest to the parent dir for each unique component path,
 * supporting deeply nested structures like packages/ai/agent-sdk/package.json.
 */
export const discoverComponents = async (
  index: FileIndex,
  parentDir: string,
): Promise<ComponentInfo[]> => {
  const manifests = [
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    "pubspec.yaml",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Gemfile",
    "composer.json",
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

  // .NET project files use extensions instead of fixed filenames
  const dotnetExts = [".csproj", ".fsproj", ".vbproj"];
  for (const ext of dotnetExts) {
    for (const file of index.getByExtensionPrimary(ext)) {
      const parts = file.relativePath.split("/");
      if (parts.length < 3 || parts[0] !== parentDir) continue;

      const componentPath = parts.slice(0, -1).join("/");
      const depth = parts.length - 2;

      const existing = componentMap.get(componentPath);
      if (!existing || depth < existing.depth) {
        componentMap.set(componentPath, {
          file: file.path,
          depth,
          manifest: file.name,
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
      manifestPath: info.file,
      manifestName: info.manifest,
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
