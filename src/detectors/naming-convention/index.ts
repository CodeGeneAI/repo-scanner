import type { FileIndex } from "../../utils/file-index";
import { registerDetector } from "../registry";
import type { DetectorResult, Finding } from "../types";
import { analyzeCodeNaming } from "./code-analyzer";
import { analyzeFileNaming } from "./file-analyzer";
import type { NamingPattern } from "./types";

/** Map consistency percentage (0–100) to a confidence score (0.3–1.0) with smooth scaling. */
const consistencyToConfidence = (percentage: number): number => {
  if (percentage >= 95) return 1.0;
  if (percentage <= 40) return 0.3;
  // Linear interpolation: 40% → 0.3, 95% → 1.0
  return Math.round((0.3 + ((percentage - 40) / 55) * 0.7) * 100) / 100;
};

registerDetector({
  id: "naming-convention",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const filePatterns = analyzeFileNaming(index);
    const codePatterns = await analyzeCodeNaming(_rootPath, index);
    const allPatterns: NamingPattern[] = [...filePatterns, ...codePatterns];

    const findings: Finding[] = allPatterns.map((p) => ({
      value: `${p.category}: ${p.dominantStyle}`,
      confidence: consistencyToConfidence(p.percentage),
      evidence: [
        `${p.sampleSize} samples, ${p.percentage.toFixed(0)}% ${p.dominantStyle}`,
      ],
    }));

    return {
      detectorId: "naming-convention",
      findings,
      metadata: { namingPatterns: allPatterns },
    };
  },
});
