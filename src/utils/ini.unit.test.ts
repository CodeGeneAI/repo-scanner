import { describe, expect, it } from "vitest";
import { parseIniSections } from "./ini";

describe("parseIniSections", () => {
  it("parses sections and key-values", () => {
    const parsed = parseIniSections(`[core]
repositoryformatversion = 0
[remote "origin"]
url = https://github.com/acme/repo.git
`);

    expect(parsed.core?.repositoryformatversion).toBe("0");
    expect(parsed['remote "origin"']?.url).toBe(
      "https://github.com/acme/repo.git",
    );
  });

  it("ignores comments and blank lines", () => {
    const parsed = parseIniSections(`
; comment
# comment
[paths]

default = https://example.com/repo
`);

    expect(parsed.paths?.default).toBe("https://example.com/repo");
  });

  it("normalizes section and key names to lowercase", () => {
    const parsed = parseIniSections(`[Paths]
Default = https://example.com/repo
`);

    expect(parsed.paths?.default).toBe("https://example.com/repo");
  });
});
