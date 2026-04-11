import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { phpParser } from "./php";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-php-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("phpParser", () => {
  it("has correct ecosystem", () => {
    expect(phpParser.ecosystem).toBe("packagist");
  });

  describe("parseDependencies", () => {
    it("parses require and require-dev sections", async () => {
      const content = JSON.stringify({
        require: {
          "laravel/framework": "^10.0",
          "guzzlehttp/guzzle": "^7.2",
        },
        "require-dev": {
          "phpunit/phpunit": "^10.1",
        },
      });
      const filePath = path.join(tmpDir, "composer.json");
      await writeFile(filePath, content);

      const deps = await phpParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(3);

      const laravel = deps.find((d) => d.name === "laravel/framework");
      expect(laravel?.currentVersion).toBe("^10.0");
      expect(laravel?.isDev).toBe(false);

      const phpunit = deps.find((d) => d.name === "phpunit/phpunit");
      expect(phpunit?.isDev).toBe(true);
    });

    it("skips php and ext-* entries", async () => {
      const content = JSON.stringify({
        require: {
          php: ">=8.1",
          "ext-mbstring": "*",
          "ext-json": "*",
          "monolog/monolog": "^3.0",
        },
      });
      const filePath = path.join(tmpDir, "composer.json");
      await writeFile(filePath, content);

      const deps = await phpParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("monolog/monolog");
    });

    it("skips lib-* entries", async () => {
      const content = JSON.stringify({
        require: {
          "lib-pcre": ">=7.0",
          "symfony/console": "^6.0",
        },
      });
      const filePath = path.join(tmpDir, "composer.json");
      await writeFile(filePath, content);

      const deps = await phpParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("symfony/console");
    });

    it("marks require-dev as isDev", async () => {
      const content = JSON.stringify({
        "require-dev": {
          "mockery/mockery": "^1.6",
          "fakerphp/faker": "^1.23",
        },
      });
      const filePath = path.join(tmpDir, "composer.json");
      await writeFile(filePath, content);

      const deps = await phpParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps.every((d) => d.isDev)).toBe(true);
    });

    it("handles empty composer.json", async () => {
      const content = JSON.stringify({});
      const filePath = path.join(tmpDir, "composer.json");
      await writeFile(filePath, content);

      const deps = await phpParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(0);
    });
  });

  describe("getImportPatterns", () => {
    it("matches PHP use statements with namespace", () => {
      const deps = [
        {
          name: "monolog/monolog",
          currentVersion: "3.0",
          ecosystem: "packagist" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = phpParser.getImportPatterns(deps);
      const regex = patterns.get("monolog/monolog")!;

      expect(regex.test("use Monolog\\\\Monolog;")).toBe(true);
    });
  });
});
