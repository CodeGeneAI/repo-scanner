import type {
  FileScore,
  PrincipleResult,
  SolidHealthResult,
  Violation,
} from "./types";

const WEIGHTS = {
  srp: 0.3,
  ocp: 0.2,
  lsp: 0.1,
  isp: 0.15,
  dip: 0.25,
} as const;

const MAX_WORST_FILES = 20;

/** Penalty points per violation severity. */
const SEVERITY_PENALTY = { error: 15, warning: 8, info: 3 } as const;

/** Compute a 0-100 score from violations using standard penalty weights. */
export const computeScore = (violations: readonly Violation[]): number => {
  let penalty = 0;
  for (const v of violations) {
    penalty += SEVERITY_PENALTY[v.severity];
  }
  return Math.max(0, 100 - penalty);
};

/** Compute composite SOLID score from principle results. */
export const computeCompositeScore = (principles: {
  srp: PrincipleResult;
  ocp: PrincipleResult;
  lsp: PrincipleResult;
  isp: PrincipleResult;
  dip: PrincipleResult;
}): number => {
  return Math.round(
    principles.srp.score * WEIGHTS.srp +
      principles.ocp.score * WEIGHTS.ocp +
      principles.lsp.score * WEIGHTS.lsp +
      principles.isp.score * WEIGHTS.isp +
      principles.dip.score * WEIGHTS.dip,
  );
};

/** Compute per-file scores and find the worst files. */
export const computeWorstFiles = (
  principles: {
    srp: PrincipleResult;
    ocp: PrincipleResult;
    lsp: PrincipleResult;
    isp: PrincipleResult;
    dip: PrincipleResult;
  },
  fileLanguages: ReadonlyMap<string, string>,
): readonly FileScore[] => {
  const allViolations = [
    ...principles.srp.violations,
    ...principles.ocp.violations,
    ...principles.lsp.violations,
    ...principles.isp.violations,
    ...principles.dip.violations,
  ];

  // Group violations by file
  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const existing = byFile.get(v.file);
    if (existing) existing.push(v);
    else byFile.set(v.file, [v]);
  }

  // Score each file
  const fileScores: FileScore[] = [];
  for (const [file, violations] of byFile) {
    fileScores.push({
      file,
      score: computeScore(violations),
      violations: violations.length,
      language: fileLanguages.get(file) ?? "unknown",
    });
  }

  return fileScores.sort((a, b) => a.score - b.score).slice(0, MAX_WORST_FILES);
};

/** Build the final SolidHealthResult. */
export const buildResult = (
  principles: {
    srp: PrincipleResult;
    ocp: PrincipleResult;
    lsp: PrincipleResult;
    isp: PrincipleResult;
    dip: PrincipleResult;
  },
  fileLanguages: ReadonlyMap<string, string>,
  analyzedFiles: number,
  analyzedClasses: number,
): SolidHealthResult => {
  return {
    score: computeCompositeScore(principles),
    principles,
    worstFiles: computeWorstFiles(principles, fileLanguages),
    analyzedFiles,
    analyzedClasses,
  };
};
