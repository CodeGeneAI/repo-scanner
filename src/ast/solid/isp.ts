import type { FileAnalysis } from "../queries/types";
import type { PrincipleResult, Violation } from "./types";

const FAT_INTERFACE_WARNING = 8;
const FAT_INTERFACE_ERROR = 12;

export const analyzeIsp = (
  fileResults: ReadonlyMap<string, FileAnalysis>,
): PrincipleResult => {
  const violations: Violation[] = [];

  for (const [file, analysis] of fileResults) {
    for (const iface of analysis.interfaces) {
      if (iface.methodCount >= FAT_INTERFACE_ERROR) {
        violations.push({
          principle: "ISP",
          file,
          line: iface.line,
          entity: iface.name,
          severity: "error",
          message: `${iface.methodCount} methods (threshold: ${FAT_INTERFACE_ERROR})`,
          metric: {
            name: "interfaceMethods",
            value: iface.methodCount,
            threshold: FAT_INTERFACE_ERROR,
          },
        });
      } else if (iface.methodCount >= FAT_INTERFACE_WARNING) {
        violations.push({
          principle: "ISP",
          file,
          line: iface.line,
          entity: iface.name,
          severity: "warning",
          message: `${iface.methodCount} methods (threshold: ${FAT_INTERFACE_WARNING})`,
          metric: {
            name: "interfaceMethods",
            value: iface.methodCount,
            threshold: FAT_INTERFACE_WARNING,
          },
        });
      }
    }
  }

  const score = computeScore(violations);
  const summary =
    violations.length === 0
      ? "No ISP violations detected"
      : `${violations.length} fat interface${violations.length > 1 ? "s" : ""}`;

  return { score, confidence: 0.7, violations, summary };
};

const computeScore = (violations: readonly Violation[]): number => {
  let penalty = 0;
  for (const v of violations) {
    if (v.severity === "error") penalty += 15;
    else if (v.severity === "warning") penalty += 8;
    else penalty += 3;
  }
  return Math.max(0, 100 - penalty);
};
