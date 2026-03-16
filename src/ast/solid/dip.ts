import type { FileAnalysis } from "../queries/types";
import { computeScore } from "./scorer";
import type { PrincipleResult, Violation } from "./types";

const INSTANTIATION_WARNING = 15;
const INSTANTIATION_ERROR = 30;

/** Test file patterns to exclude from DIP analysis. */
const isTestFile = (file: string): boolean =>
  file.includes(".test.") ||
  file.includes(".spec.") ||
  file.includes("_test.") ||
  file.includes("test_") ||
  file.includes("__tests__/") ||
  file.includes("/tests/") ||
  file.includes("/test/");

export const analyzeDip = (
  fileResults: ReadonlyMap<string, FileAnalysis>,
): PrincipleResult => {
  const violations: Violation[] = [];

  for (const [file, analysis] of fileResults) {
    // Skip test files — they naturally have many concrete instantiations
    if (isTestFile(file)) continue;

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
