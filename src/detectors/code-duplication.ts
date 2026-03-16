import {
  type DuplicationScanOptions,
  scanForDuplicates,
} from "../code-duplication/scanner";
import type { CodeDuplicationResult } from "../types";
import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

const MAX_GROUPS = 100;

let scanOptions: DuplicationScanOptions = {};

/** Configure duplication scan options (called from CLI). */
export const setDuplicationOptions = (opts: DuplicationScanOptions): void => {
  scanOptions = opts;
};

registerDetector({
  id: "code-duplication",
  async detect(rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const result = await scanForDuplicates(rootPath, index, scanOptions);

    const cappedGroups = result.groups.slice(0, MAX_GROUPS);

    const codeDuplication: CodeDuplicationResult = {
      groups: cappedGroups.map((g) => ({
        id: g.id,
        instances: g.instances.map((inst) => ({
          file: inst.file,
          startLine: inst.startLine,
          endLine: inst.endLine,
        })),
        tokenCount: g.tokenCount,
        lineCount: g.lineCount,
      })),
      stats: result.stats,
    };

    const findings: Finding[] = [];

    if (result.stats.duplicateGroups > 0) {
      findings.push({
        value: `${result.stats.duplicationPercentage}% duplication`,
        confidence: 1.0,
        evidence: [
          `${result.stats.duplicateGroups} duplicate group(s), ${result.stats.duplicatedLines} duplicated lines`,
        ],
      });
    }

    return {
      detectorId: "code-duplication",
      findings,
      metadata: { codeDuplication },
    };
  },
});
