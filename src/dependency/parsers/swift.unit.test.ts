import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { swiftParser } from "./swift";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-swift-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("swiftParser", () => {
  it("has correct ecosystem", () => {
    expect(swiftParser.ecosystem).toBe("cocoapods");
  });

  describe("parseDependencies", () => {
    it("parses .package(url:, from:) declarations", async () => {
      const content = `
// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "MyApp",
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.2.0"),
        .package(url: "https://github.com/vapor/vapor.git", from: "4.77.0"),
    ]
)
      `.trim();
      const filePath = path.join(tmpDir, "Package.swift");
      await writeFile(filePath, content);

      const deps = await swiftParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("swift-argument-parser");
      expect(deps[0]?.currentVersion).toBe(">=1.2.0");
      expect(deps[1]?.name).toBe("vapor");
      expect(deps[1]?.currentVersion).toBe(">=4.77.0");
    });

    it("extracts name from URL (last path component without .git)", async () => {
      const content = `
// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "MyApp",
    dependencies: [
        .package(url: "https://github.com/Alamofire/Alamofire.git", from: "5.8.0"),
    ]
)
      `.trim();
      const filePath = path.join(tmpDir, "Package.swift");
      await writeFile(filePath, content);

      const deps = await swiftParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("Alamofire");
    });

    it("handles .package with explicit name parameter", async () => {
      const content = `
// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "MyApp",
    dependencies: [
        .package(name: "MyCustomName", url: "https://github.com/user/repo.git", from: "1.0.0"),
    ]
)
      `.trim();
      const filePath = path.join(tmpDir, "Package.swift");
      await writeFile(filePath, content);

      const deps = await swiftParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("MyCustomName");
    });

    it("handles exact version specification", async () => {
      const content = `
// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "MyApp",
    dependencies: [
        .package(url: "https://github.com/user/repo.git", exact: "2.0.0"),
    ]
)
      `.trim();
      const filePath = path.join(tmpDir, "Package.swift");
      await writeFile(filePath, content);

      const deps = await swiftParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.currentVersion).toBe("2.0.0");
    });

    it("resolves from Package.resolved v2 format", async () => {
      const packageSwift = `
// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "MyApp",
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.2.0"),
    ]
)
      `.trim();
      const packageResolved = JSON.stringify({
        pins: [
          {
            identity: "swift-argument-parser",
            kind: "remoteSourceControl",
            location: "https://github.com/apple/swift-argument-parser.git",
            state: {
              revision: "abc123",
              version: "1.2.3",
            },
          },
        ],
        version: 2,
      });

      await writeFile(path.join(tmpDir, "Package.swift"), packageSwift);
      await writeFile(path.join(tmpDir, "Package.resolved"), packageResolved);

      const deps = await swiftParser.parseDependencies([
        path.join(tmpDir, "Package.swift"),
        path.join(tmpDir, "Package.resolved"),
      ]);
      expect(deps[0]?.resolvedVersion).toBe("1.2.3");
    });

    it("handles empty Package.swift", async () => {
      const content = `
// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "MyApp",
    dependencies: []
)
      `.trim();
      const filePath = path.join(tmpDir, "Package.swift");
      await writeFile(filePath, content);

      const deps = await swiftParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(0);
    });
  });

  describe("getImportPatterns", () => {
    it("matches Swift import statements", () => {
      const deps = [
        {
          name: "Alamofire",
          currentVersion: "5.8.0",
          ecosystem: "cocoapods" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = swiftParser.getImportPatterns(deps);
      const regex = patterns.get("Alamofire")!;

      expect(regex.test("import Alamofire")).toBe(true);
    });
  });
});
