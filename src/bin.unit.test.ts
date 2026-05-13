import { describe, expect, test } from "bun:test";

const run = async (args: string[]): Promise<unknown> => {
  const proc = Bun.spawn(["bun", "src/bin.ts", ...args], { stdout: "pipe" });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(text);
};

describe("CLI --detectors filter emits sliced schema", () => {
  test("--detectors monorepo emits sliced shape (only architecture + metadata)", async () => {
    const out = (await run([
      "--path",
      ".",
      "--format",
      "json",
      "--detectors",
      "monorepo",
    ])) as any;
    expect(Object.keys(out).sort()).toEqual([
      "architecture",
      "rootPath",
      "scannedAt",
    ]);
    expect(out.architecture).toBeDefined();
    expect(out.inventory).toBeUndefined();
    expect(out.languageStats).toBeUndefined();
  });

  test("--detectors language emits inventory.languages + languageStats only", async () => {
    const out = (await run([
      "--path",
      ".",
      "--format",
      "json",
      "--detectors",
      "language",
    ])) as any;
    expect(Object.keys(out).sort()).toEqual([
      "inventory",
      "languageStats",
      "rootPath",
      "scannedAt",
    ]);
    expect(out.inventory.languages.length).toBeGreaterThan(0);
    expect(out.inventory.frameworks).toBeUndefined();
    expect(out.architecture).toBeUndefined();
  });
});

test("--detectors packageManager emits sliced schema (inventory.packageManagers only)", async () => {
  const out = (await run([
    "--path",
    ".",
    "--format",
    "json",
    "--detectors",
    "packageManager",
  ])) as any;
  expect(Object.keys(out).sort()).toEqual([
    "inventory",
    "rootPath",
    "scannedAt",
  ]);
  expect(out.inventory.packageManagers).toBeDefined();
  expect(out.inventory.languages).toBeUndefined();
  expect(out.inventory.frameworks).toBeUndefined();
  expect(out.architecture).toBeUndefined();
});

test("--path on nonexistent dir prints a friendly error and exits nonzero", async () => {
  const proc = Bun.spawn(
    ["bun", "src/bin.ts", "--path", "/definitely/not/here/foo"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  expect(exit).not.toBe(0);
  expect(stderr).toMatch(/no such directory|does not exist|cannot find/i);
  expect(stderr).not.toMatch(/scandir/);
});
