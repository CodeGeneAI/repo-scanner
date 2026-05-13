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

export const assertDetectorSelectorScoping = (
  repoPath: string,
  detectorId: string,
): void => {
  const metadataKeys = new Set(["rootPath", "scannedAt"]);
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
