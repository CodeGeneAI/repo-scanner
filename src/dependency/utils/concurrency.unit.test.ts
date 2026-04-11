import { describe, expect, it } from "bun:test";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("processes all items", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, 2, async (n) => n * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("preserves order", async () => {
    const items = [50, 10, 30, 20, 40];
    const results = await mapWithConcurrency(items, 3, async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n;
    });
    expect(results).toEqual([50, 10, 30, 20, 40]);
  });

  it("handles empty array", async () => {
    const results = await mapWithConcurrency([], 5, async (n: number) => n);
    expect(results).toEqual([]);
  });

  it("handles single item", async () => {
    const results = await mapWithConcurrency([42], 1, async (n) => n + 1);
    expect(results).toEqual([43]);
  });

  it("respects concurrency limit", async () => {
    let activeCalls = 0;
    let maxActive = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      activeCalls++;
      maxActive = Math.max(maxActive, activeCalls);
      await new Promise((r) => setTimeout(r, 10));
      activeCalls--;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("propagates errors", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("fail");
        return n;
      }),
    ).rejects.toThrow("fail");
  });

  it("passes index to callback", async () => {
    const indices: number[] = [];
    await mapWithConcurrency([10, 20, 30], 3, async (_, idx) => {
      indices.push(idx);
    });
    expect(indices.sort()).toEqual([0, 1, 2]);
  });
});
