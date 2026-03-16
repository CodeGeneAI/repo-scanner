import type { FileAnalysis, TypeCheckInfo } from "../queries/types";
import { computeScore } from "./scorer";
import type { PrincipleResult, Violation } from "./types";

const TYPE_CHECK_WARNING = 3;
const TYPE_CHECK_ERROR = 5;

export const analyzeOcp = (
  fileResults: ReadonlyMap<string, FileAnalysis>,
): PrincipleResult => {
  const violations: Violation[] = [];

  for (const [file, analysis] of fileResults) {
    // Group type checks by enclosing function
    const byFunction = new Map<string, TypeCheckInfo[]>();
    for (const tc of analysis.typeChecks) {
      const existing = byFunction.get(tc.inFunction);
      if (existing) existing.push(tc);
      else byFunction.set(tc.inFunction, [tc]);
    }

    for (const [funcName, checks] of byFunction) {
      if (checks.length >= TYPE_CHECK_ERROR) {
        violations.push({
          principle: "OCP",
          file,
          line: checks[0]!.line,
          entity: funcName,
          severity: "error",
          message: `${checks.length} type checks (${checks.map((c) => c.checkedType).join(", ")})`,
          metric: {
            name: "typeChecks",
            value: checks.length,
            threshold: TYPE_CHECK_ERROR,
          },
        });
      } else if (checks.length >= TYPE_CHECK_WARNING) {
        violations.push({
          principle: "OCP",
          file,
          line: checks[0]!.line,
          entity: funcName,
          severity: "warning",
          message: `${checks.length} type checks (${checks.map((c) => c.checkedType).join(", ")})`,
          metric: {
            name: "typeChecks",
            value: checks.length,
            threshold: TYPE_CHECK_WARNING,
          },
        });
      }
    }
  }

  const score = computeScore(violations);
  const summary =
    violations.length === 0
      ? "No OCP violations detected"
      : `${violations.length} function${violations.length > 1 ? "s" : ""} with type-dispatch chains`;

  return { score, confidence: 0.7, violations, summary };
};
