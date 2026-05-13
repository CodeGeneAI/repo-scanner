import { describe, expect, test } from "bun:test";
import { scanRepo } from "./index";

describe("public API: scanRepo", () => {
  test("returns populated inventory for repo-scanner itself", async () => {
    const result = await scanRepo(process.cwd());
    expect(result.inventory.languages).toContain("TypeScript");
    expect(result.languageStats.totalFiles).toBeGreaterThan(0);
  });
});
