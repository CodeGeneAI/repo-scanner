import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rubyParser } from "./ruby";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-rb-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("rubyParser", () => {
  it("has correct ecosystem", () => {
    expect(rubyParser.ecosystem).toBe("rubygems");
  });

  describe("parseDependencies", () => {
    it("parses gem declarations with versions", async () => {
      const content = `
source "https://rubygems.org"

gem "rails", "~> 7.0"
gem "pg", ">= 1.1"
      `.trim();
      const filePath = path.join(tmpDir, "Gemfile");
      await writeFile(filePath, content);

      const deps = await rubyParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("rails");
      expect(deps[0]?.currentVersion).toBe("~> 7.0");
      expect(deps[1]?.name).toBe("pg");
      expect(deps[1]?.currentVersion).toBe(">= 1.1");
    });

    it("handles gems without versions", async () => {
      const content = `
gem "puma"
gem "bootsnap"
      `.trim();
      const filePath = path.join(tmpDir, "Gemfile");
      await writeFile(filePath, content);

      const deps = await rubyParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("puma");
      expect(deps[0]?.currentVersion).toBe("*");
    });

    it("marks gems in test/development groups as isDev", async () => {
      const content = `
gem "rails", "~> 7.0"

group :development, :test do
  gem "rspec-rails"
end
      `.trim();
      const filePath = path.join(tmpDir, "Gemfile");
      await writeFile(filePath, content);

      const deps = await rubyParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);

      const rails = deps.find((d) => d.name === "rails");
      expect(rails?.isDev).toBe(false);

      const rspec = deps.find((d) => d.name === "rspec-rails");
      expect(rspec?.isDev).toBe(true);
    });

    it("handles single-quoted gem names", async () => {
      const content = `gem 'nokogiri', '~> 1.15'`;
      const filePath = path.join(tmpDir, "Gemfile");
      await writeFile(filePath, content);

      const deps = await rubyParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("nokogiri");
      expect(deps[0]?.currentVersion).toBe("~> 1.15");
    });

    it("handles empty Gemfile", async () => {
      const filePath = path.join(tmpDir, "Gemfile");
      await writeFile(filePath, 'source "https://rubygems.org"\n');

      const deps = await rubyParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(0);
    });
  });

  describe("getImportPatterns", () => {
    it("matches require and gem statements", () => {
      const deps = [
        {
          name: "nokogiri",
          currentVersion: "1.15",
          ecosystem: "rubygems" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = rubyParser.getImportPatterns(deps);
      const regex = patterns.get("nokogiri")!;

      expect(regex.test('require "nokogiri"')).toBe(true);
      expect(regex.test("gem 'nokogiri'")).toBe(true);
    });
  });
});
