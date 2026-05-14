import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";

const detect = async (
  files: Record<string, string>,
): Promise<readonly string[]> => {
  const dir = await mkdtemp(path.join(tmpdir(), "rs-build-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  const det = getDetectors().find((d) => d.id === "buildSystem")!;
  const index = await FileIndex.build(dir);
  const result = await det.detect(dir, index);
  return result.findings.map((f) => f.value);
};

describe("buildSystem detector: file rules", () => {
  test.each([
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
  ])("detects %s as %s", async (file, expected) => {
    const names = await detect({ [file]: "# build file\n" });
    expect(names).toContain(expected);
  });
});

describe("buildSystem detector: dedup", () => {
  test("multiple Bazel marker files produce one finding per file but same value", async () => {
    const names = await detect({
      "BUILD.bazel": "# bazel build\n",
      WORKSPACE: "workspace(name = 'myrepo')\n",
    });
    // Two findings, both with value "Bazel"
    const bazelFindings = names.filter((n) => n === "Bazel");
    expect(bazelFindings.length).toBe(2);
  });

  test("same file detected only once even if matched by multiple rules", async () => {
    // Makefile only matches "Make" once, not twice
    const names = await detect({ Makefile: "all:\n\techo hello\n" });
    expect(names.filter((n) => n === "Make")).toHaveLength(1);
  });
});

describe("buildSystem detector: edge cases", () => {
  test("no findings when repo has no build system files", async () => {
    const names = await detect({ "README.md": "# project\n" });
    expect(names).toEqual([]);
  });

  test("multiple build systems detected in same repo", async () => {
    const names = await detect({
      Makefile: "all:\n",
      Earthfile: "VERSION 0.7\n",
    });
    expect(names).toContain("Make");
    expect(names).toContain("Earthly");
  });
});
