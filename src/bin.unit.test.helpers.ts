import { expect } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import os from "os";
import path from "path";

const repoRootPath = path.resolve(import.meta.dir, "..");
const binPath = path.resolve(import.meta.dir, "bin.ts");
const textDecoder = new TextDecoder();

export const decode = (value: ArrayBufferLike | ArrayBufferView): string =>
  textDecoder.decode(value);

const buildRepoScannerEnv = (
  envOverrides?: Record<string, string>,
): Record<string, string | undefined> => ({
  ...process.env,
  ...envOverrides,
});

export const createCliFixtureRepo = async (): Promise<string> => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "repo-scanner-cli-"));

  await writeFile(path.join(repoPath, "README.md"), "# fixture\n");
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        version: "1.0.0",
        dependencies: {
          lodash: "^4.17.21",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(repoPath, "index.ts"),
    "import lodash from 'lodash';\n",
  );

  return repoPath;
};

export const createCoreProfileFixtureRepo = async (): Promise<string> => {
  const repoPath = await mkdtemp(
    path.join(os.tmpdir(), "repo-scanner-core-profile-"),
  );

  await mkdir(path.join(repoPath, ".github", "workflows"), { recursive: true });
  await writeFile(path.join(repoPath, "README.md"), "# core fixture\n");
  await writeFile(
    path.join(repoPath, ".github", "workflows", "ci.yml"),
    "name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
  );
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "fixture-core",
        version: "1.0.0",
        dependencies: {
          "@openrouter/ai-sdk-provider": "^2.0.0",
          ai: "^6.0.0",
        },
        scripts: {
          build: "tsc -p tsconfig.json",
          test: "bun test",
          lint: "biome check --diagnostic-level=error",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(repoPath, "index.ts"), "export const ok = true;\n");

  return repoPath;
};

export const createAllDetectorsFixtureRepo = async (): Promise<string> => {
  const repoPath = await createCoreProfileFixtureRepo();

  await mkdir(path.join(repoPath, "db"), { recursive: true });
  await writeFile(
    path.join(repoPath, "db", "schema.sql"),
    "CREATE TABLE users (id INT PRIMARY KEY, email TEXT);\n",
  );
  await writeFile(
    path.join(repoPath, "solid.ts"),
    "export class Service { run(): number { return 1; } }\n",
  );

  return repoPath;
};

export const createEnvFixtureRepo = async (): Promise<string> => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "repo-scanner-env-"));

  await writeFile(path.join(repoPath, "README.md"), "# env fixture\n");
  await writeFile(
    path.join(repoPath, "index.ts"),
    "export const apiKey = process.env.OPENAI_API_KEY;\n",
  );

  return repoPath;
};

export const runRepoScanner = (
  args: readonly string[],
  envOverrides?: Record<string, string>,
) =>
  Bun.spawnSync([process.execPath, binPath, ...args], {
    cwd: repoRootPath,
    stdout: "pipe",
    stderr: "pipe",
    env: buildRepoScannerEnv(envOverrides),
  });

const runGit = (repoPath: string, args: readonly string[]): void => {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: repoPath,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${decode(result.stderr).trim()}`,
    );
  }
};

export const createGitDiffFixtureRepo = async (): Promise<string> => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "repo-scanner-diff-"));

  await writeFile(path.join(repoPath, "README.md"), "# diff fixture\n");
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify({ name: "diff-fixture", version: "1.0.0" }, null, 2),
  );
  await mkdir(path.join(repoPath, "src"), { recursive: true });
  await writeFile(
    path.join(repoPath, "src", "index.ts"),
    "export const x = 1;\n",
  );

  runGit(repoPath, ["init"]);
  runGit(repoPath, ["config", "user.email", "repo-scanner-tests@example.com"]);
  runGit(repoPath, ["config", "user.name", "Repo Scanner Tests"]);
  runGit(repoPath, ["add", "."]);
  runGit(repoPath, ["commit", "-m", "base"]);

  await writeFile(
    path.join(repoPath, "src", "index.ts"),
    "export const x = 2;\n",
  );
  runGit(repoPath, ["add", "."]);
  runGit(repoPath, ["commit", "-m", "change"]);

  return repoPath;
};

export const assertDetectorSelectorScoping = (
  repoPath: string,
  detectorId: string,
): void => {
  const metadataKeys = new Set(["scanPath", "timestamp", "durationMs"]);
  const result = runRepoScanner([
    "--path",
    repoPath,
    "--detectors",
    detectorId,
    "--format",
    "json",
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`detector ${detectorId} failed: ${decode(result.stderr)}`);
  }

  const payload = JSON.parse(decode(result.stdout)) as Record<string, unknown>;
  const nonMetadataKeys = Object.keys(payload).filter(
    (key) => !metadataKeys.has(key),
  );

  if (nonMetadataKeys.length !== 1) {
    throw new Error(
      `detector ${detectorId} produced unexpected keys: ${Object.keys(payload).join(",")}`,
    );
  }
};

export const expectTopLevelKeys = (
  payload: Record<string, unknown>,
  expectedKeys: readonly string[],
): void => {
  const keys = Object.keys(payload).sort();
  expect(keys).toEqual([...expectedKeys].sort());
};
