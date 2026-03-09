import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LanguageStats } from "../types";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";
import type { Detector, DetectorResult } from "./types";

function findDetector(id: string): Detector {
  const detector = getDetectors().find((d) => d.id === id);
  if (!detector) throw new Error(`Detector "${id}" not found in registry`);
  return detector;
}

describe("language detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-lang-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects TypeScript from .ts files", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    await writeFile(path.join(tmpDir, "src", "app.ts"), "");
    await writeFile(path.join(tmpDir, "src", "utils.ts"), "");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const ts = result.findings.find((f) => f.value === "TypeScript");

    expect(ts).toBeDefined();
    expect(ts!.confidence).toBeGreaterThan(0);
    expect(ts!.evidence[0]).toContain("file(s)");
  });

  it("detects multiple languages", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    await writeFile(path.join(tmpDir, "src", "app.ts"), "");
    await writeFile(path.join(tmpDir, "main.py"), "");
    await writeFile(path.join(tmpDir, "script.sh"), "");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const values = result.findings.map((f) => f.value);

    expect(values).toContain("TypeScript");
    expect(values).toContain("Python");
    expect(values).toContain("Shell");
  });

  it("boosts confidence from manifest (tsconfig.json)", async () => {
    await writeFile(path.join(tmpDir, "index.ts"), "");
    await writeFile(path.join(tmpDir, "tsconfig.json"), "{}");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const ts = result.findings.find((f) => f.value === "TypeScript");

    expect(ts).toBeDefined();
    expect(ts!.confidence).toBe(1.0);
    expect(ts!.evidence).toContain("confirmed by tsconfig.json");
  });

  it("adds language from manifest even without source files", async () => {
    await writeFile(path.join(tmpDir, "tsconfig.json"), "{}");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const ts = result.findings.find((f) => f.value === "TypeScript");

    expect(ts).toBeDefined();
    expect(ts!.confidence).toBe(0.8);
    expect(ts!.evidence[0]).toContain("manifest file");
  });

  it("assigns higher confidence for more files", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    // 10+ files should get confidence 1.0
    for (let i = 0; i < 10; i++) {
      await writeFile(path.join(tmpDir, "src", `file${i}.ts`), "");
    }

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    const ts = result.findings.find((f) => f.value === "TypeScript");

    expect(ts).toBeDefined();
    expect(ts!.confidence).toBe(1.0);
  });

  it("sorts findings by confidence descending", async () => {
    await mkdir(path.join(tmpDir, "src"), { recursive: true });
    // Many TS files => high confidence
    for (let i = 0; i < 10; i++) {
      await writeFile(path.join(tmpDir, "src", `file${i}.ts`), "");
    }
    // One Python file => low confidence
    await writeFile(path.join(tmpDir, "main.py"), "");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < result.findings.length; i++) {
      expect(result.findings[i - 1]!.confidence).toBeGreaterThanOrEqual(
        result.findings[i]!.confidence,
      );
    }
  });

  it("returns detectorId 'language'", async () => {
    await writeFile(path.join(tmpDir, "main.py"), "");

    const detector = findDetector("language");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.detectorId).toBe("language");
  });

  describe("language stats", () => {
    function getStats(result: DetectorResult): LanguageStats[] {
      return (result.metadata?.languageStats as LanguageStats[]) ?? [];
    }

    it("includes correct file counts per language", async () => {
      await mkdir(path.join(tmpDir, "src"), { recursive: true });
      await writeFile(path.join(tmpDir, "src", "a.ts"), "");
      await writeFile(path.join(tmpDir, "src", "b.ts"), "");
      await writeFile(path.join(tmpDir, "src", "c.ts"), "");
      await writeFile(path.join(tmpDir, "main.py"), "");

      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);
      const stats = getStats(result);

      const ts = stats.find((s) => s.name === "TypeScript");
      const py = stats.find((s) => s.name === "Python");

      expect(ts).toBeDefined();
      expect(ts!.fileCount).toBe(3);
      expect(py).toBeDefined();
      expect(py!.fileCount).toBe(1);
    });

    it("percentages sum to approximately 100", async () => {
      await mkdir(path.join(tmpDir, "src"), { recursive: true });
      for (let i = 0; i < 5; i++) {
        await writeFile(path.join(tmpDir, "src", `f${i}.ts`), "");
      }
      for (let i = 0; i < 3; i++) {
        await writeFile(path.join(tmpDir, `s${i}.py`), "");
      }
      await writeFile(path.join(tmpDir, "main.go"), "");
      await writeFile(path.join(tmpDir, "run.sh"), "");

      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);
      const stats = getStats(result);

      const total = stats.reduce((sum, s) => sum + s.percentage, 0);
      expect(total).toBeCloseTo(100, 0);
    });

    it("stats are sorted by percentage descending", async () => {
      await mkdir(path.join(tmpDir, "src"), { recursive: true });
      for (let i = 0; i < 10; i++) {
        await writeFile(path.join(tmpDir, "src", `f${i}.ts`), "");
      }
      for (let i = 0; i < 3; i++) {
        await writeFile(path.join(tmpDir, `s${i}.py`), "");
      }
      await writeFile(path.join(tmpDir, "run.sh"), "");

      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);
      const stats = getStats(result);

      for (let i = 1; i < stats.length; i++) {
        expect(stats[i - 1]!.percentage).toBeGreaterThanOrEqual(
          stats[i]!.percentage,
        );
      }
    });

    it("merges multi-extension languages (.ts + .tsx)", async () => {
      await writeFile(path.join(tmpDir, "app.ts"), "");
      await writeFile(path.join(tmpDir, "component.tsx"), "");
      await writeFile(path.join(tmpDir, "main.py"), "");

      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);
      const stats = getStats(result);

      const ts = stats.find((s) => s.name === "TypeScript");
      expect(ts).toBeDefined();
      expect(ts!.fileCount).toBe(2);
    });

    it("returns empty stats for empty repo", async () => {
      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);
      const stats = getStats(result);

      expect(stats).toEqual([]);
    });

    it("only counts recognized-language files in stats", async () => {
      await writeFile(path.join(tmpDir, "app.ts"), "");
      await writeFile(path.join(tmpDir, "data.json"), "{}");
      await writeFile(path.join(tmpDir, "README.md"), "");
      await writeFile(path.join(tmpDir, "style.css"), "");

      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);
      const stats = getStats(result);

      expect(stats).toHaveLength(1);
      expect(stats[0]!.name).toBe("TypeScript");
      expect(stats[0]!.fileCount).toBe(1);
      expect(stats[0]!.percentage).toBe(100);
    });

    it("counts lines of code per language", async () => {
      await writeFile(
        path.join(tmpDir, "app.ts"),
        "const a = 1;\nconst b = 2;\nconst c = 3;\n",
      );
      await writeFile(path.join(tmpDir, "main.py"), "x = 1\ny = 2\n");

      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);
      const stats = getStats(result);

      const ts = stats.find((s) => s.name === "TypeScript");
      const py = stats.find((s) => s.name === "Python");

      expect(ts).toBeDefined();
      expect(ts!.linesOfCode).toBe(3);
      expect(py).toBeDefined();
      expect(py!.linesOfCode).toBe(2);
    });

    it("reports totalFiles and totalLinesOfCode in metadata", async () => {
      await writeFile(path.join(tmpDir, "a.ts"), "line1\nline2\n");
      await writeFile(path.join(tmpDir, "b.ts"), "line1\n");
      await writeFile(path.join(tmpDir, "c.py"), "line1\nline2\nline3\n");

      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);

      expect(result.metadata?.totalFiles).toBe(3);
      expect(result.metadata?.totalLinesOfCode).toBe(6);
    });

    it("counts lines correctly for files without trailing newline", async () => {
      await writeFile(path.join(tmpDir, "app.ts"), "line1\nline2");

      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);
      const stats = getStats(result);

      expect(stats[0]!.linesOfCode).toBe(2);
    });

    it("reports 0 lines for empty files", async () => {
      await writeFile(path.join(tmpDir, "empty.ts"), "");

      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);
      const stats = getStats(result);

      expect(stats[0]!.linesOfCode).toBe(0);
    });

    it("sums LoC across multi-extension languages", async () => {
      await writeFile(path.join(tmpDir, "app.ts"), "a\nb\n");
      await writeFile(path.join(tmpDir, "comp.tsx"), "c\nd\ne\n");

      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);
      const stats = getStats(result);

      const ts = stats.find((s) => s.name === "TypeScript");
      expect(ts!.linesOfCode).toBe(5);
    });

    it("returns 0 totals for empty repo", async () => {
      const detector = findDetector("language");
      const index = await FileIndex.build(tmpDir);
      const result = await detector.detect(tmpDir, index);

      expect(result.metadata?.totalFiles).toBe(0);
      expect(result.metadata?.totalLinesOfCode).toBe(0);
    });
  });
});
