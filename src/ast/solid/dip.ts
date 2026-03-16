import type { FileAnalysis } from "../queries/types";
import type { PrincipleResult, Violation } from "./types";

const INSTANTIATION_WARNING = 5;
const INSTANTIATION_ERROR = 10;

export const analyzeDip = (
  fileResults: ReadonlyMap<string, FileAnalysis>,
): PrincipleResult => {
  const violations: Violation[] = [];

  for (const [file, analysis] of fileResults) {
    const count = analysis.instantiations.length;

    if (count >= INSTANTIATION_ERROR) {
      violations.push({
        principle: "DIP",
        file,
        line: analysis.instantiations[0]?.line ?? 1,
        entity: file.split("/").pop() ?? file,
        severity: "error",
        message: `${count} concrete instantiations (threshold: ${INSTANTIATION_ERROR})`,
        metric: {
          name: "concreteInstantiations",
          value: count,
          threshold: INSTANTIATION_ERROR,
        },
      });
    } else if (count >= INSTANTIATION_WARNING) {
      violations.push({
        principle: "DIP",
        file,
        line: analysis.instantiations[0]?.line ?? 1,
        entity: file.split("/").pop() ?? file,
        severity: "warning",
        message: `${count} concrete instantiations (threshold: ${INSTANTIATION_WARNING})`,
        metric: {
          name: "concreteInstantiations",
          value: count,
          threshold: INSTANTIATION_WARNING,
        },
      });
    }
  }

  const score = computeScore(violations);
  const summary =
    violations.length === 0
      ? "No DIP violations detected"
      : `${violations.length} file${violations.length > 1 ? "s" : ""} with excessive concrete dependencies`;

  return { score, confidence: 0.85, violations, summary };
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
