import { describe, expect, it, mock } from "bun:test";
import type { Component } from "../types";

const execFileMock = mock(async () => ({
  stdout: [
    "packages/api/src/handlerService.ts",
    "packages/api/src/user_service.py",
    "packages/api/src/kebab-dir/file_name.py",
    "",
  ].join("\n"),
  stderr: "",
}));

mock.module("child_process", () => ({
  execFile: (
    _cmd: string,
    _args: readonly string[],
    _opts: { cwd: string },
    cb: (
      err: Error | null,
      result?: { stdout: string; stderr: string },
    ) => void,
  ) => {
    execFileMock()
      .then((result) => cb(null, result))
      .catch((error: Error) => cb(error));
  },
}));

const { learnComponentConventionBaselinesFromGit } = await import(
  "./convention-history"
);

describe("learnComponentConventionBaselinesFromGit", () => {
  it("derives per-language component baselines from git history", async () => {
    const components: readonly Component[] = [
      {
        name: "api",
        path: "packages/api",
        kind: "service",
        description: "",
        confidence: 1,
        evidence: [],
      },
    ];

    const baselines = await learnComponentConventionBaselinesFromGit(
      "/tmp/repo",
      components,
      20,
    );
    const apiBaseline = baselines["packages/api"];

    expect(apiBaseline).toBeDefined();
    expect(apiBaseline?.fileStyleByLanguage.typescript).toBe("camelCase");
    expect(apiBaseline?.fileStyleByLanguage.python).toBe("snake_case");
    expect(apiBaseline?.directoryStyleByLanguage.python).toBe("flatcase");
  });
});
