import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import { createFindingAdder } from "./shared";
import type { DetectorResult } from "./types";

/** Exact-filename rules: filename → build system display name. */
const BUILD_FILE_RULES: ReadonlyMap<string, string> = new Map([
  ["Makefile", "Make"],
  ["GNUmakefile", "Make"],
  ["Justfile", "Just"],
  [".justfile", "Just"],
  ["Taskfile.yml", "Task"],
  ["Taskfile.yaml", "Task"],
  ["Rakefile", "Rake"],
  ["rakefile", "Rake"],
  ["CMakeLists.txt", "CMake"],
  ["meson.build", "Meson"],
  ["SConstruct", "SCons"],
  ["SConscript", "SCons"],
  ["build.xml", "Ant"],
  ["BUILD", "Bazel"],
  ["BUILD.bazel", "Bazel"],
  ["WORKSPACE", "Bazel"],
  ["WORKSPACE.bazel", "Bazel"],
  ["MODULE.bazel", "Bazel"],
  ["BUILD.gn", "GN"],
  [".gn", "GN"],
  ["magefile.go", "Mage"],
  ["mage.go", "Mage"],
  ["Earthfile", "Earthly"],
  ["dagger.json", "Dagger"],
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
