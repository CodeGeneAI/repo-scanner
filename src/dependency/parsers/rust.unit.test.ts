import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { rustParser } from "./rust";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-rs-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("rustParser", () => {
  it("has correct ecosystem", () => {
    expect(rustParser.ecosystem).toBe("cargo");
  });

  describe("parseDependencies", () => {
    it("parses simple string versions", async () => {
      const content = `
[package]
name = "myapp"
version = "0.1.0"

[dependencies]
serde = "1.0"
tokio = "1.35"
      `.trim();
      const filePath = path.join(tmpDir, "Cargo.toml");
      await writeFile(filePath, content);

      const deps = await rustParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("serde");
      expect(deps[0]?.currentVersion).toBe("1.0");
    });

    it("parses table-style dependencies", async () => {
      const content = `
[package]
name = "myapp"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.35", optional = true }
      `.trim();
      const filePath = path.join(tmpDir, "Cargo.toml");
      await writeFile(filePath, content);

      const deps = await rustParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);

      const tokio = deps.find((d) => d.name === "tokio");
      expect(tokio?.isOptional).toBe(true);
    });

    it("parses dev-dependencies", async () => {
      const content = `
[package]
name = "myapp"

[dev-dependencies]
pretty_assertions = "1.4"
      `.trim();
      const filePath = path.join(tmpDir, "Cargo.toml");
      await writeFile(filePath, content);

      const deps = await rustParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.isDev).toBe(true);
    });

    it("parses build-dependencies", async () => {
      const content = `
[package]
name = "myapp"

[build-dependencies]
cc = "1.0"
      `.trim();
      const filePath = path.join(tmpDir, "Cargo.toml");
      await writeFile(filePath, content);

      const deps = await rustParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("cc");
    });

    it("resolves from Cargo.lock", async () => {
      const toml = `
[package]
name = "myapp"

[dependencies]
serde = "1.0"
      `.trim();
      const lock = `
[[package]]
name = "serde"
version = "1.0.193"
      `.trim();

      await writeFile(path.join(tmpDir, "Cargo.toml"), toml);
      await writeFile(path.join(tmpDir, "Cargo.lock"), lock);

      const deps = await rustParser.parseDependencies([
        path.join(tmpDir, "Cargo.toml"),
      ]);
      expect(deps[0]?.resolvedVersion).toBe("1.0.193");
    });

    it("skips path-only dependencies (no version)", async () => {
      const content = `
[package]
name = "myapp"

[dependencies]
my-local = { path = "../my-local" }
      `.trim();
      const filePath = path.join(tmpDir, "Cargo.toml");
      await writeFile(filePath, content);

      const deps = await rustParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(0);
    });
  });

  describe("getImportPatterns", () => {
    it("converts hyphens to underscores for Rust imports", () => {
      const deps = [
        {
          name: "serde-json",
          currentVersion: "1.0",
          ecosystem: "cargo" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = rustParser.getImportPatterns(deps);
      const regex = patterns.get("serde-json")!;

      expect(regex.test("use serde_json::Value;")).toBe(true);
      expect(regex.test("extern crate serde_json;")).toBe(true);
    });
  });
});
