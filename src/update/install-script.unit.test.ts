import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";

const installerScriptPath = path.resolve(
  import.meta.dir,
  "../../scripts/install-repo-scanner.sh",
);

const decode = (value: Uint8Array): string =>
  Buffer.from(value).toString("utf8");

describe("repo-scanner installer script", () => {
  it("exists and advertises required install arguments", () => {
    expect(fs.existsSync(installerScriptPath)).toBe(true);

    const script = fs.readFileSync(installerScriptPath, "utf8");
    expect(script.startsWith("#!/bin/sh")).toBe(true);
    expect(script).toContain("--bundle-url");
    expect(script).toContain("--bundle-sha256");
    expect(script).toContain("--bundle-version");
    expect(script).toContain("scanner tools bundle checksum mismatch");
  });

  it("fails fast when required install arguments are missing", () => {
    const result = Bun.spawnSync(["sh", installerScriptPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(1);
    expect(decode(result.stderr)).toContain("--bundle-url is required");
  });

  it("fails fast when bundle sha256 is malformed", () => {
    const result = Bun.spawnSync(
      [
        "sh",
        installerScriptPath,
        "--bundle-url",
        "https://assets.codegene.dev/binaries/scanner-tools-bundle.tar.gz",
        "--bundle-sha256",
        "not-a-sha",
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    expect(result.exitCode).toBe(1);
    expect(decode(result.stderr)).toContain(
      "--bundle-sha256 must be a 64-character hex digest",
    );
  });
});
