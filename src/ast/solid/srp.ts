import type { FileAnalysis } from "../queries/types";
import { computeScore } from "./scorer";
import type { PrincipleResult, Violation } from "./types";

const WMC_ERROR = 20;
const METHOD_COUNT_WARNING = 15;
const IMPORT_FANOUT_WARNING = 10;
const CLASS_LOC_WARNING = 300;

export const analyzeSrp = (
  fileResults: ReadonlyMap<string, FileAnalysis>,
): PrincipleResult => {
  const violations: Violation[] = [];

  for (const [file, analysis] of fileResults) {
    // Import fan-out per file
    const uniqueImportSources = new Set(analysis.imports.map((i) => i.source));
    if (uniqueImportSources.size > IMPORT_FANOUT_WARNING) {
      violations.push({
        principle: "SRP",
        file,
        line: 1,
        entity: file.split("/").pop() ?? file,
        severity: "warning",
        message: `${uniqueImportSources.size} import sources (threshold: ${IMPORT_FANOUT_WARNING})`,
        metric: {
          name: "importFanOut",
          value: uniqueImportSources.size,
          threshold: IMPORT_FANOUT_WARNING,
        },
      });
    }

    // Per-class metrics
    for (const cls of analysis.classes) {
      const wmc = cls.methods.reduce((sum, m) => sum + m.complexity, 0);

      if (wmc > WMC_ERROR) {
        violations.push({
          principle: "SRP",
          file,
          line: cls.line,
          entity: cls.name,
          severity: "error",
          message: `WMC ${wmc} (threshold: ${WMC_ERROR})`,
          metric: { name: "WMC", value: wmc, threshold: WMC_ERROR },
        });
      }

      if (cls.methods.length > METHOD_COUNT_WARNING) {
        violations.push({
          principle: "SRP",
          file,
          line: cls.line,
          entity: cls.name,
          severity: "warning",
          message: `${cls.methods.length} methods (threshold: ${METHOD_COUNT_WARNING})`,
          metric: {
            name: "methodCount",
            value: cls.methods.length,
            threshold: METHOD_COUNT_WARNING,
          },
        });
      }

      if (cls.loc > CLASS_LOC_WARNING) {
        violations.push({
          principle: "SRP",
          file,
          line: cls.line,
          entity: cls.name,
          severity: "warning",
          message: `${cls.loc} lines (threshold: ${CLASS_LOC_WARNING})`,
          metric: {
            name: "classLOC",
            value: cls.loc,
            threshold: CLASS_LOC_WARNING,
          },
        });
      }
    }
  }

  const score = computeScore(violations);
  const summary =
    violations.length === 0
      ? "No SRP violations detected"
      : `${violations.length} violation${violations.length > 1 ? "s" : ""}: ${summarizeViolations(violations)}`;

  return { score, confidence: 0.9, violations, summary };
};

const summarizeViolations = (violations: readonly Violation[]): string => {
  const errors = violations.filter((v) => v.severity === "error").length;
  const warnings = violations.filter((v) => v.severity === "warning").length;
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors > 1 ? "s" : ""}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? "s" : ""}`);
  return parts.join(", ");
};
