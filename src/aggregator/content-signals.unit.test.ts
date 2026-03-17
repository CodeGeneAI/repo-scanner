import path from "path";
import { describe, expect, it } from "vitest";
import type { FileIndex, IndexedFile } from "../utils/file-index";
import { detectSecondaryKinds } from "./content-signals";

/** Create a mock FileIndex that returns the given files for a component path. */
const mockIndex = (
  componentPath: string,
  relativePaths: string[],
): FileIndex => {
  const files: IndexedFile[] = relativePaths.map((relPath) => ({
    path: `/${componentPath}/${relPath}`,
    name: path.basename(relPath),
    ext: path.extname(relPath).toLowerCase(),
    relativePath: `${componentPath}/${relPath}`,
  }));

  return {
    getUnderPath: (prefix: string) =>
      prefix === componentPath || `${prefix}/` === `${componentPath}/`
        ? files
        : [],
  } as unknown as FileIndex;
};

describe("detectSecondaryKinds", () => {
  it("returns empty array when no signals found", () => {
    const index = mockIndex("packages/utils", ["src/index.ts", "README.md"]);
    const result = detectSecondaryKinds("packages/utils", "package", index);
    expect(result).toEqual([]);
  });

  it("returns empty array when component dir is empty", () => {
    const index = mockIndex("packages/empty", []);
    const result = detectSecondaryKinds("packages/empty", "package", index);
    expect(result).toEqual([]);
  });

  it("detects app from index.html", () => {
    const index = mockIndex("packages/ui", ["index.html", "src/index.ts"]);
    const result = detectSecondaryKinds("packages/ui", "package", index);
    expect(result).toEqual(["app"]);
  });

  it("detects app from vite.config.ts", () => {
    const index = mockIndex("packages/ui", ["vite.config.ts", "src/index.ts"]);
    const result = detectSecondaryKinds("packages/ui", "package", index);
    expect(result).toEqual(["app"]);
  });

  it("detects app from next.config.mjs", () => {
    const index = mockIndex("packages/web", ["next.config.mjs"]);
    const result = detectSecondaryKinds("packages/web", "package", index);
    expect(result).toEqual(["app"]);
  });

  it("detects app from vercel.json", () => {
    const index = mockIndex("packages/ui", ["vercel.json", "src/index.ts"]);
    const result = detectSecondaryKinds("packages/ui", "package", index);
    expect(result).toEqual(["app"]);
  });

  it("detects app from netlify.toml", () => {
    const index = mockIndex("packages/docs", ["netlify.toml"]);
    const result = detectSecondaryKinds("packages/docs", "package", index);
    expect(result).toEqual(["app"]);
  });

  it("detects service from Dockerfile", () => {
    const index = mockIndex("packages/worker", ["Dockerfile", "src/index.ts"]);
    const result = detectSecondaryKinds("packages/worker", "package", index);
    expect(result).toEqual(["service"]);
  });

  it("detects service from nest-cli.json", () => {
    const index = mockIndex("packages/api", ["nest-cli.json"]);
    const result = detectSecondaryKinds("packages/api", "package", index);
    expect(result).toEqual(["service"]);
  });

  it("detects service from server entry files", () => {
    const index = mockIndex("packages/gateway", ["server.ts"]);
    const result = detectSecondaryKinds("packages/gateway", "package", index);
    expect(result).toEqual(["service"]);
  });

  it("detects package from tsup.config.ts", () => {
    const index = mockIndex("services/shared", ["tsup.config.ts"]);
    const result = detectSecondaryKinds("services/shared", "service", index);
    expect(result).toEqual(["package"]);
  });

  it("detects both app and service as secondary kinds", () => {
    const index = mockIndex("packages/full-stack", [
      "index.html",
      "Dockerfile",
      "src/index.ts",
    ]);
    const result = detectSecondaryKinds(
      "packages/full-stack",
      "package",
      index,
    );
    expect(result).toEqual(["app", "service"]);
  });

  it("excludes primary kind from secondary", () => {
    const index = mockIndex("apps/web", ["index.html", "vite.config.ts"]);
    const result = detectSecondaryKinds("apps/web", "app", index);
    expect(result).toEqual([]);
  });

  it("excludes primary service kind from secondary", () => {
    const index = mockIndex("services/api", ["Dockerfile", "server.ts"]);
    const result = detectSecondaryKinds("services/api", "service", index);
    expect(result).toEqual([]);
  });

  it("returns sorted secondary kinds", () => {
    const index = mockIndex("infra/platform", [
      "Dockerfile",
      "vercel.json",
      "tsup.config.ts",
    ]);
    const result = detectSecondaryKinds("infra/platform", "infra", index);
    expect(result).toEqual(["app", "package", "service"]);
  });
});
