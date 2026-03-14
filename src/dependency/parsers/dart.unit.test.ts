import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dartParser } from "./dart";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-dart-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("dartParser", () => {
  it("has correct ecosystem", () => {
    expect(dartParser.ecosystem).toBe("pub");
  });

  describe("parseDependencies", () => {
    it("parses dependencies and dev_dependencies sections", async () => {
      const content = `
name: my_app
version: 1.0.0

dependencies:
  http: ^0.13.0
  provider: ^6.0.0

dev_dependencies:
  test: ^1.24.0
  mockito: ^5.4.0
`;
      const filePath = path.join(tmpDir, "pubspec.yaml");
      await writeFile(filePath, content);

      const deps = await dartParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(4);

      const http = deps.find((d) => d.name === "http");
      expect(http?.currentVersion).toBe("^0.13.0");
      expect(http?.isDev).toBe(false);

      const testDep = deps.find((d) => d.name === "test");
      expect(testDep?.isDev).toBe(true);
    });

    it("handles caret prefix in versions", async () => {
      const content = `
name: my_app

dependencies:
  dio: ^5.3.2
`;
      const filePath = path.join(tmpDir, "pubspec.yaml");
      await writeFile(filePath, content);

      const deps = await dartParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("dio");
      expect(deps[0]?.currentVersion).toBe("^5.3.2");
    });

    it("skips flutter sdk dependencies", async () => {
      const content = `
name: my_app

dependencies:
  flutter:
    sdk: flutter
  http: ^0.13.0
`;
      const filePath = path.join(tmpDir, "pubspec.yaml");
      await writeFile(filePath, content);

      const deps = await dartParser.parseDependencies([filePath]);
      expect(deps.some((d) => d.name === "flutter")).toBe(false);
      expect(deps.some((d) => d.name === "http")).toBe(true);
    });

    it("handles dependencies with block version syntax", async () => {
      const content = `
name: my_app

dependencies:
  some_pkg:
    version: ^2.0.0
    hosted: https://custom.pub.dev
`;
      const filePath = path.join(tmpDir, "pubspec.yaml");
      await writeFile(filePath, content);

      const deps = await dartParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("some_pkg");
      expect(deps[0]?.currentVersion).toBe("^2.0.0");
    });

    it("handles empty pubspec.yaml", async () => {
      const content = `
name: my_app
version: 1.0.0
`;
      const filePath = path.join(tmpDir, "pubspec.yaml");
      await writeFile(filePath, content);

      const deps = await dartParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(0);
    });
  });

  describe("getImportPatterns", () => {
    it("matches Dart package import statements", () => {
      const deps = [
        {
          name: "http",
          currentVersion: "0.13.0",
          ecosystem: "pub" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = dartParser.getImportPatterns(deps);
      const regex = patterns.get("http")!;

      expect(regex.test("import 'package:http/http.dart';")).toBe(true);
    });
  });
});
