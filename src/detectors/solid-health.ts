import { analyzeSolid } from "../ast/solid/analyzer";
import type { SolidScanOptions } from "../ast/solid/types";
import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import type { DetectorResult } from "./types";

let options: SolidScanOptions = {};

/** Configure SOLID analysis options (called from CLI). */
export const setSolidOptions = (opts: SolidScanOptions): void => {
  options = opts;
};

registerDetector({
  id: "solid-health",
  async detect(rootPath: string, index: FileIndex): Promise<DetectorResult> {
    // No-op when --solid flag is not set
    if (!options.enabled) {
      return { detectorId: "solid-health", findings: [] };
    }

    const result = await analyzeSolid(rootPath, index);

    return {
      detectorId: "solid-health",
      findings: [
        {
          value: `SOLID score: ${result.score}/100`,
          confidence: 0.8,
          evidence: [
            `SRP: ${result.principles.srp.score}, OCP: ${result.principles.ocp.score}, LSP: ${result.principles.lsp.score}, ISP: ${result.principles.isp.score}, DIP: ${result.principles.dip.score}`,
          ],
        },
      ],
      metadata: { solidHealth: result },
    };
  },
});
