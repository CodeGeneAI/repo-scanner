import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { goParser } from "./go";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-go-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("goParser", () => {
  it("has correct ecosystem", () => {
    expect(goParser.ecosystem).toBe("go");
  });

  describe("parseDependencies", () => {
    it("parses single-line require", async () => {
      const content = `
module example.com/myapp

go 1.21

require github.com/gin-gonic/gin v1.9.1
require golang.org/x/text v0.14.0
      `.trim();
      const filePath = path.join(tmpDir, "go.mod");
      await writeFile(filePath, content);

      const deps = await goParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("github.com/gin-gonic/gin");
      expect(deps[0]?.currentVersion).toBe("1.9.1");
    });

    it("parses require block", async () => {
      const content = `
module example.com/myapp

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	golang.org/x/text v0.14.0 // indirect
)
      `.trim();
      const filePath = path.join(tmpDir, "go.mod");
      await writeFile(filePath, content);

      const deps = await goParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);

      const indirect = deps.find((d) => d.name === "golang.org/x/text");
      expect(indirect?.isOptional).toBe(true); // indirect mapped to optional
    });

    it("skips replaced modules", async () => {
      const content = `
module example.com/myapp

go 1.21

require github.com/old/pkg v1.0.0

replace github.com/old/pkg => github.com/new/pkg v2.0.0
      `.trim();
      const filePath = path.join(tmpDir, "go.mod");
      await writeFile(filePath, content);

      const deps = await goParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(0);
    });

    it("skips block-replaced modules", async () => {
      const content = `
module example.com/myapp

go 1.21

require (
	github.com/old/a v1.0.0
	github.com/good/b v2.0.0
)

replace (
	github.com/old/a => github.com/new/a v1.1.0
)
      `.trim();
      const filePath = path.join(tmpDir, "go.mod");
      await writeFile(filePath, content);

      const deps = await goParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("github.com/good/b");
    });

    it("resolves versions from go.sum", async () => {
      const goMod = `
module example.com/myapp

go 1.21

require github.com/gin-gonic/gin v1.9.1
      `.trim();
      const goSum =
        "github.com/gin-gonic/gin v1.9.1 h1:abc=\ngithub.com/gin-gonic/gin v1.9.1/go.mod h1:def=\n";

      await writeFile(path.join(tmpDir, "go.mod"), goMod);
      await writeFile(path.join(tmpDir, "go.sum"), goSum);

      const deps = await goParser.parseDependencies([
        path.join(tmpDir, "go.mod"),
      ]);
      expect(deps[0]?.resolvedVersion).toBe("1.9.1");
    });

    it("handles empty go.mod", async () => {
      const filePath = path.join(tmpDir, "go.mod");
      await writeFile(filePath, "module example.com/myapp\n\ngo 1.21\n");

      const deps = await goParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(0);
    });
  });

  describe("getImportPatterns", () => {
    it("matches Go import statements", () => {
      const deps = [
        {
          name: "github.com/gin-gonic/gin",
          currentVersion: "1.9.1",
          ecosystem: "go" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = goParser.getImportPatterns(deps);
      const regex = patterns.get("github.com/gin-gonic/gin")!;

      expect(regex.test('"github.com/gin-gonic/gin"')).toBe(true);
      expect(regex.test('"github.com/gin-gonic/gin/render"')).toBe(true);
    });
  });
});
