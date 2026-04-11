import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { cppParser } from "./cpp";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-cpp-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("cppParser", () => {
  it("has correct ecosystem", () => {
    expect(cppParser.ecosystem).toBe("conan");
  });

  describe("conanfile.txt", () => {
    it("parses [requires] section", async () => {
      const content = `
[requires]
zlib/1.3.1
boost/1.84.0
openssl/3.2.0

[generators]
CMakeDeps
CMakeToolchain
      `.trim();
      const filePath = path.join(tmpDir, "conanfile.txt");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(3);
      expect(deps[0]?.name).toBe("zlib");
      expect(deps[0]?.currentVersion).toBe("1.3.1");
      expect(deps[1]?.name).toBe("boost");
      expect(deps[1]?.currentVersion).toBe("1.84.0");
      expect(deps[2]?.name).toBe("openssl");
      expect(deps[2]?.currentVersion).toBe("3.2.0");
    });

    it("parses [test_requires] as dev dependencies", async () => {
      const content = `
[requires]
zlib/1.3.1

[test_requires]
gtest/1.14.0
      `.trim();
      const filePath = path.join(tmpDir, "conanfile.txt");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);

      const gtest = deps.find((d) => d.name === "gtest");
      expect(gtest?.isDev).toBe(true);
      expect(gtest?.currentVersion).toBe("1.14.0");
    });

    it("ignores comments and empty lines", async () => {
      const content = `
[requires]
# this is a comment
zlib/1.3.1

boost/1.84.0
      `.trim();
      const filePath = path.join(tmpDir, "conanfile.txt");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
    });
  });

  describe("conanfile.py", () => {
    it("parses self.requires calls", async () => {
      const content = `
from conan import ConanFile

class MyProjectConan(ConanFile):
    name = "myproject"
    version = "1.0"

    def requirements(self):
        self.requires("zlib/1.3.1")
        self.requires("boost/1.84.0")
      `.trim();
      const filePath = path.join(tmpDir, "conanfile.py");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("zlib");
      expect(deps[0]?.currentVersion).toBe("1.3.1");
      expect(deps[1]?.name).toBe("boost");
      expect(deps[1]?.currentVersion).toBe("1.84.0");
    });

    it("parses requires = assignment", async () => {
      const content = `
from conan import ConanFile

class MyConan(ConanFile):
    requires = "zlib/1.3.1"
      `.trim();
      const filePath = path.join(tmpDir, "conanfile.py");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("zlib");
    });

    it("parses self.tool_requires as dev dependencies", async () => {
      const content = `
from conan import ConanFile

class MyConan(ConanFile):
    def build_requirements(self):
        self.tool_requires("cmake/3.27.7")
      `.trim();
      const filePath = path.join(tmpDir, "conanfile.py");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("cmake");
      expect(deps[0]?.isDev).toBe(true);
    });
  });

  describe("vcpkg.json", () => {
    it("parses string dependencies", async () => {
      const content = JSON.stringify({
        name: "myproject",
        version: "1.0.0",
        dependencies: ["zlib", "boost", "fmt"],
      });
      const filePath = path.join(tmpDir, "vcpkg.json");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(3);
      expect(deps[0]?.name).toBe("zlib");
      expect(deps[0]?.currentVersion).toBe("*");
      expect(deps[1]?.name).toBe("boost");
      expect(deps[2]?.name).toBe("fmt");
    });

    it("parses object dependencies with name field", async () => {
      const content = JSON.stringify({
        name: "myproject",
        dependencies: [
          { name: "zlib", version: "1.3.1" },
          { name: "boost" },
          "fmt",
        ],
      });
      const filePath = path.join(tmpDir, "vcpkg.json");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(3);
      expect(deps[0]?.name).toBe("zlib");
      expect(deps[0]?.currentVersion).toBe("1.3.1");
      expect(deps[1]?.name).toBe("boost");
      expect(deps[1]?.currentVersion).toBe("*");
    });

    it("handles missing dependencies field", async () => {
      const content = JSON.stringify({ name: "myproject" });
      const filePath = path.join(tmpDir, "vcpkg.json");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(0);
    });
  });

  describe("CMakeLists.txt", () => {
    it("parses find_package calls", async () => {
      const content = `
cmake_minimum_required(VERSION 3.15)
project(MyProject)

find_package(Boost REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(ZLIB)
      `.trim();
      const filePath = path.join(tmpDir, "CMakeLists.txt");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(3);
      expect(deps[0]?.name).toBe("Boost");
      expect(deps[1]?.name).toBe("OpenSSL");
      expect(deps[2]?.name).toBe("ZLIB");
    });

    it("parses find_package with version", async () => {
      const content = `
find_package(Boost 1.70 REQUIRED)
      `.trim();
      const filePath = path.join(tmpDir, "CMakeLists.txt");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("Boost");
      expect(deps[0]?.currentVersion).toBe("1.70");
    });

    it("deduplicates find_package calls", async () => {
      const content = `
find_package(Boost REQUIRED)
find_package(Boost COMPONENTS filesystem system)
      `.trim();
      const filePath = path.join(tmpDir, "CMakeLists.txt");
      await writeFile(filePath, content);

      const deps = await cppParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
    });
  });

  describe("getImportPatterns", () => {
    it("matches #include <header> patterns", () => {
      const deps = [
        {
          name: "boost",
          currentVersion: "1.84.0",
          ecosystem: "conan" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = cppParser.getImportPatterns(deps);
      const regex = patterns.get("boost")!;

      expect(regex.test("#include <boost/filesystem.hpp>")).toBe(true);
      expect(regex.test('#include "boost/asio.hpp"')).toBe(true);
      expect(regex.test("#include <iostream>")).toBe(false);
    });

    it("matches exact header name", () => {
      const deps = [
        {
          name: "zlib",
          currentVersion: "1.3.1",
          ecosystem: "conan" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = cppParser.getImportPatterns(deps);
      const regex = patterns.get("zlib")!;

      expect(regex.test("#include <zlib.h>")).toBe(false);
      expect(regex.test("#include <zlib>")).toBe(true);
      expect(regex.test("#include <zlib/zlib.h>")).toBe(true);
    });
  });
});
