import type { LargeFileInfo } from "../types";
import { mapWithConcurrency } from "../utils/concurrency";
import type { FileIndex } from "../utils/file-index";
import { countLines } from "../utils/fs";
import { EXT_TO_LANGUAGE } from "./language-extensions";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

const DEFAULT_THRESHOLD_LINES = 500;
const LOC_CONCURRENCY = 64;

/** Returns true if the filename looks like a test/spec file. */
const isTestFile = (name: string): boolean =>
  name.includes(".test.") ||
  name.includes(".spec.") ||
  name.endsWith("_test.go") ||
  name.startsWith("test_") ||
  name.endsWith("_test.py");

let thresholdLines = DEFAULT_THRESHOLD_LINES;

/** Configure the line-count threshold for large file detection. */
export const setLargeFileThreshold = (lines: number): void => {
  thresholdLines = lines;
};

registerDetector({
  id: "large-file",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    // Only consider recognized source code files, excluding tests
    const codeFiles = index
      .all()
      .filter((f) => EXT_TO_LANGUAGE.has(f.ext) && !isTestFile(f.name));

    const counted = await mapWithConcurrency(
      codeFiles,
      LOC_CONCURRENCY,
      async (file) => ({
        file,
        lines: await countLines(file.path),
        language: EXT_TO_LANGUAGE.get(file.ext)!,
      }),
    );

    const largeFiles: LargeFileInfo[] = counted
      .filter((r) => r.lines >= thresholdLines)
      .sort((a, b) => b.lines - a.lines)
      .map((r) => ({
        relativePath: r.file.relativePath,
        lineCount: r.lines,
        language: r.language,
      }));

    const findings: Finding[] = largeFiles.map((lf) => ({
      value: lf.relativePath,
      confidence: 1.0,
      evidence: [
        `${lf.lineCount.toLocaleString()} lines (threshold: ${thresholdLines.toLocaleString()})`,
      ],
    }));

    return {
      detectorId: "large-file",
      findings,
      metadata: { largeFiles },
    };
  },
});
