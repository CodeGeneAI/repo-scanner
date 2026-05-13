import { describe, expect, test } from "bun:test";

const run = async (args: string[]): Promise<unknown> => {
  const proc = Bun.spawn(["bun", "src/bin.ts", ...args], { stdout: "pipe" });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(text);
};

describe("CLI --detectors filter preserves canonical schema", () => {
  test("--detectors monorepo emits architecture.monorepo, not flat monorepo", async () => {
    const out = (await run([
      "--path",
      ".",
      "--format",
      "json",
      "--detectors",
      "monorepo",
    ])) as any;
    expect(out.architecture).toBeDefined();
    expect(out.architecture).toHaveProperty("monorepo");
    expect(out.architecture).toHaveProperty("components");
    expect(out.inventory).toBeDefined();
    expect(out.inventory.languages).toEqual([]);
    expect(out.inventory.frameworks).toEqual([]);
    expect(out.languageStats).toBeDefined();
  });

  test("--detectors language emits inventory.languages with content, monorepo defaults false", async () => {
    const out = (await run([
      "--path",
      ".",
      "--format",
      "json",
      "--detectors",
      "language",
    ])) as any;
    expect(out.inventory.languages.length).toBeGreaterThan(0);
    expect(out.architecture.monorepo).toBe(false);
    expect(out.architecture.components).toEqual([]);
  });
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
