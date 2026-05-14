import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import { createFindingAdder } from "./shared";
import type { DetectorResult } from "./types";

/** Exact-filename rules: filename → build system display name. */
const BUILD_FILE_RULES: ReadonlyMap<string, string> = new Map([
  // Make — GNU make accepts both cases without -f flag
  ["Makefile", "Make"],
  ["makefile", "Make"],
  ["GNUmakefile", "Make"],
  // Just — both common cases per just's docs
  ["Justfile", "Just"],
  ["justfile", "Just"],
  [".justfile", "Just"],
  // Task — all documented variants including .dist forms
  ["Taskfile.yml", "Task"],
  ["Taskfile.yaml", "Task"],
  ["taskfile.yml", "Task"],
  ["taskfile.yaml", "Task"],
  ["Taskfile.dist.yml", "Task"],
  ["Taskfile.dist.yaml", "Task"],
  ["taskfile.dist.yml", "Task"],
  ["taskfile.dist.yaml", "Task"],
  // Rake
  ["Rakefile", "Rake"],
  ["rakefile", "Rake"],
  // CMake
  ["CMakeLists.txt", "CMake"],
  // Meson
  ["meson.build", "Meson"],
  // SCons — top-level script alternates per SCons docs
  ["SConstruct", "SCons"],
  ["Sconstruct", "SCons"],
  ["sconstruct", "SCons"],
  ["SConstruct.py", "SCons"],
  ["sconstruct.py", "SCons"],
  ["SConscript", "SCons"],
  // Ant
  ["build.xml", "Ant"],
  // Bazel — REMOVED bare "BUILD" (ambiguous with Pants/Buck);
  // WORKSPACE / WORKSPACE.bazel / MODULE.bazel / BUILD.bazel remain
  ["BUILD.bazel", "Bazel"],
  ["WORKSPACE", "Bazel"],
  ["WORKSPACE.bazel", "Bazel"],
  ["MODULE.bazel", "Bazel"],
  // GN (Chromium's build system)
  ["BUILD.gn", "GN"],
  [".gn", "GN"],
  // Mage
  ["magefile.go", "Mage"],
  ["mage.go", "Mage"],
  // Earthly
  ["Earthfile", "Earthly"],
  // Dagger
  ["dagger.json", "Dagger"],
  // Zig
  ["build.zig", "Zig build"],
]);

registerDetector({
  id: "buildSystem",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const { findings, addFinding } = createFindingAdder();
    for (const [fileName, system] of BUILD_FILE_RULES) {
      for (const file of index.getByNamePrimary(fileName)) {
        addFinding(
          system,
          1.0,
          `build file: ${file.relativePath}`,
          file.relativePath,
        );
      }
    }
    return { detectorId: "buildSystem", findings };
  },
});
