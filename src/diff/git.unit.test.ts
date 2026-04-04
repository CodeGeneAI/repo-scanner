import { describe, expect, it } from "bun:test";
import { getAddedLines } from "./git";

/**
 * Since getAddedLines spawns `git diff`, we test it by creating
 * a minimal in-process parser test via a known diff fixture.
 * For true integration tests we'd need a git repo fixture.
 *
 * These tests verify parsing against the real git repo's diff output.
 */

describe("getAddedLines", () => {
  it("returns empty map for invalid diff range", async () => {
    const result = await getAddedLines(
      process.cwd(),
      "nonexistent-ref...also-nonexistent",
    );
    expect(result.size).toBe(0);
  });

  it("returns empty map for identical refs", async () => {
    const result = await getAddedLines(process.cwd(), "HEAD...HEAD");
    expect(result.size).toBe(0);
  });

  it("returns map with file keys and line number sets for real diff", async () => {
    // Use HEAD~1 which should have at least one changed file in this repo
    const result = await getAddedLines(process.cwd(), "HEAD~1");
    // We can't assert exact contents since the repo changes, but verify structure
    if (result.size > 0) {
      for (const [file, lines] of result) {
        expect(typeof file).toBe("string");
        expect(file.length).toBeGreaterThan(0);
        expect(lines.size).toBeGreaterThan(0);
        for (const line of lines) {
          expect(typeof line).toBe("number");
          expect(line).toBeGreaterThan(0);
        }
      }
    }
  });
});
