import type { FileAnalysis } from "../queries/types";
import { computeScore } from "./scorer";
import type { PrincipleResult, Violation } from "./types";

export const analyzeLsp = (
  fileResults: ReadonlyMap<string, FileAnalysis>,
): PrincipleResult => {
  const violations: Violation[] = [];

  for (const [file, analysis] of fileResults) {
    for (const cls of analysis.classes) {
      for (const method of cls.methods) {
        if (!method.isOverride) continue;

        if (method.throwsNotImplemented) {
          violations.push({
            principle: "LSP",
            file,
            line: method.line,
            entity: `${cls.name}.${method.name}`,
            severity: "error",
            message: "Override throws NotImplementedError",
          });
        } else if (method.isEmpty) {
          violations.push({
            principle: "LSP",
            file,
            line: method.line,
            entity: `${cls.name}.${method.name}`,
            severity: "warning",
            message: "Override has empty body (no-op)",
          });
        }
      }
    }
  }

  const score = computeScore(violations);
  const summary =
    violations.length === 0
      ? "No LSP violations detected"
      : `${violations.length} suspicious override${violations.length > 1 ? "s" : ""}`;

  return { score, confidence: 0.5, violations, summary };
};
