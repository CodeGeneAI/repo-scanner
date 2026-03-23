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
    expect(script).toContain("--version-url");
    expect(script).toContain("detect_platform");
    expect(script).toContain("scanner tools bundle checksum mismatch");
  });

  it("fails fast when required install arguments are missing", () => {
    const result = Bun.spawnSync(["sh", installerScriptPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(1);
    expect(decode(result.stderr)).toContain(
      "--version-url or (--bundle-url and --bundle-sha256) is required",
    );
  });

  it("fails fast when bundle sha256 is malformed (explicit mode)", () => {
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

  it("detect_platform uses word-boundary grep for avx2 detection", () => {
    const script = fs.readFileSync(installerScriptPath, "utf8");
    // Must use grep -qw (word boundary) not grep -q ' avx2 ' (space-delimited),
    // because avx2 may be the last flag on the line (followed by newline, not space).
    expect(script).toContain("grep -qw 'avx2'");
    expect(script).not.toContain("grep -q ' avx2 '");
  });

  it("passes platform as a positional argument to python3 (not interpolated)", () => {
    const script = fs.readFileSync(installerScriptPath, "utf8");
    // The platform string must be passed via sys.argv, not interpolated into the
    // Python script body, to avoid shell injection.
    expect(script).toContain("sys.argv[1]");
    // Must NOT interpolate $platform directly inside python3 script strings.
    expect(script).not.toMatch(/python3\s+-c\s+"[^"]*\$platform/);
  });

  it("does not combine a python heredoc with piped version_json", () => {
    const script = fs.readFileSync(installerScriptPath, "utf8");
    expect(script).not.toContain(`python3 - "$platform" <<'PYEOF'`);
  });
  it("invokes python3 only once to extract both bundleUrl and bundleChecksum", () => {
    const script = fs.readFileSync(installerScriptPath, "utf8");
    // The version-url resolution section should only spawn python3 once.
    // Count actual python3 *command invocations* (lines starting python3 or piping to python3),
    // excluding `command -v python3` checks and error message strings.
    const resolveSection = script.slice(
      script.indexOf("Resolve bundle URL"),
      script.indexOf("Validate resolved bundle"),
    );
    // Match lines that actually execute python3 as a command (pipe into or direct call).
    const python3Invocations = (resolveSection.match(/\|\s*python3\b/g) || [])
      .length;
    expect(python3Invocations).toBe(1);
  });

  it("does not require repo-scanner to already be on PATH", () => {
    const script = fs.readFileSync(installerScriptPath, "utf8");
    expect(script).not.toContain("command -v repo-scanner");
    expect(script).toContain('"$bin_root/repo-scanner" --help');
  });

  it("does not error on missing --bundle-url when --version-url is provided", () => {
    // Use a localhost URL that immediately fails (connection refused) rather than
    // a real URL that would hang. We only need to confirm arg validation passes.
    const result = Bun.spawnSync(
      [
        "sh",
        installerScriptPath,
        "--version-url",
        "https://127.0.0.1:1/version.json",
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      },
    );

    // Should NOT fail with the "missing required args" error.
    // A network/curl error or similar is expected and acceptable here.
    const stderr = decode(result.stderr);
    expect(stderr).not.toContain(
      "--version-url or (--bundle-url and --bundle-sha256) is required",
    );
    expect(stderr).not.toContain("--bundle-url is required");
  });
});
