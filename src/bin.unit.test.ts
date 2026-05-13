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
