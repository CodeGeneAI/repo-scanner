import { classifyCase } from "../detectors/naming-convention/case-classifier";
import type { DiffScanResult, RepoScanResult } from "../types";

const CONVENTION_CONFIDENCE_THRESHOLD = 60;
const DEFAULT_IGNORED_PATH_SEGMENTS = [
  "apps",
  "packages",
  "services",
  "src",
  "lib",
  "test",
  "tests",
] as const;

type ConventionBaseline = {
  readonly fileStyle?: string;
  readonly directoryStyle?: string;
};

export interface ComponentHistoryConventionBaseline {
  readonly componentPath: string;
  readonly fileStyleByLanguage: Readonly<Record<string, string>>;
  readonly directoryStyleByLanguage: Readonly<Record<string, string>>;
  readonly sampleSizeByLanguage: Readonly<Record<string, number>>;
}

export interface DiffConventionOptions {
  readonly ignoredPathSegments: readonly string[];
  readonly usePerComponentBaselines: boolean;
  readonly useLanguageProfiles: boolean;
  readonly softMatchStyles: Readonly<Record<string, readonly string[]>>;
}

const DEFAULT_DIFF_CONVENTION_OPTIONS: DiffConventionOptions = {
  ignoredPathSegments: DEFAULT_IGNORED_PATH_SEGMENTS,
  usePerComponentBaselines: true,
  useLanguageProfiles: true,
  softMatchStyles: {
    camelCase: ["flatcase"],
  },
};

let diffConventionOptions: DiffConventionOptions =
  DEFAULT_DIFF_CONVENTION_OPTIONS;

export const setDiffConventionOptions = (
  options: Partial<DiffConventionOptions>,
): void => {
  diffConventionOptions = {
    ignoredPathSegments:
      options.ignoredPathSegments ?? diffConventionOptions.ignoredPathSegments,
    usePerComponentBaselines:
      options.usePerComponentBaselines ??
      diffConventionOptions.usePerComponentBaselines,
    useLanguageProfiles:
      options.useLanguageProfiles ?? diffConventionOptions.useLanguageProfiles,
    softMatchStyles:
      options.softMatchStyles ?? diffConventionOptions.softMatchStyles,
  };
};

export const resetDiffConventionOptions = (): void => {
  diffConventionOptions = DEFAULT_DIFF_CONVENTION_OPTIONS;
};

const TEST_FILE_PATTERNS = [
  ".unit.spec.",
  ".int.spec.",
  ".e2e.spec.",
  ".test.",
];

const isLikelyTestFile = (filePath: string): boolean => {
  return TEST_FILE_PATTERNS.some((pattern) => filePath.includes(pattern));
};

const deriveCandidateTests = (
  changedFiles: readonly string[],
  allKnownFiles: readonly string[],
): string[] => {
  const candidates = new Set<string>();

  for (const changedFile of changedFiles) {
    if (isLikelyTestFile(changedFile)) {
      candidates.add(changedFile);
      continue;
    }

    const basename = changedFile
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "");
    if (!basename) continue;

    for (const file of allKnownFiles) {
      if (!isLikelyTestFile(file)) continue;
      if (file.includes(basename)) {
        candidates.add(file);
      }
    }
  }

  return [...candidates].sort();
};

const extensionToLanguageProfile = (filePath: string): string => {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
      return "typescript";
    case "py":
      return "python";
    case "go":
      return "go";
    case "rs":
      return "rust";
    case "java":
      return "java";
    case "cs":
      return "csharp";
    default:
      return "unknown";
  }
};

const buildConventionViolations = (
  result: RepoScanResult,
  changedFiles: readonly string[],
  historyBaselines?: Readonly<
    Record<string, ComponentHistoryConventionBaseline>
  >,
): DiffScanResult["conventionViolations"] => {
  const namingConventions = result.inventory.namingConventions ?? [];

  const repoBaseline: ConventionBaseline = {
    fileStyle: namingConventions.find(
      (entry) =>
        entry.category === "file" &&
        entry.percentage >= CONVENTION_CONFIDENCE_THRESHOLD,
    )?.dominantStyle,
    directoryStyle: namingConventions.find(
      (entry) =>
        entry.category === "directory" &&
        entry.percentage >= CONVENTION_CONFIDENCE_THRESHOLD,
    )?.dominantStyle,
  };

  if (!repoBaseline.fileStyle && !repoBaseline.directoryStyle) {
    return [];
  }

  type ConventionViolation = DiffScanResult["conventionViolations"][number];
  const violations: ConventionViolation[] = [];
  const seen = new Set<string>();
  const ignoredSegments = new Set(diffConventionOptions.ignoredPathSegments);

  const componentBaselines = new Map<string, ConventionBaseline>();
  if (diffConventionOptions.usePerComponentBaselines) {
    for (const component of result.architecture.components) {
      const localNaming = component.metadata?.namingConventions;
      if (!localNaming) continue;
      componentBaselines.set(component.path, {
        fileStyle: localNaming.file?.dominantStyle,
        directoryStyle: localNaming.directory?.dominantStyle,
      });
    }
  }

  for (const filePath of changedFiles) {
    const component = result.architecture.components.find(
      (candidate) =>
        filePath === candidate.path ||
        filePath.startsWith(`${candidate.path}/`),
    );
    const componentBaseline = component
      ? componentBaselines.get(component.path)
      : undefined;
    const dominantFileStyle =
      componentBaseline?.fileStyle ?? repoBaseline.fileStyle;
    const dominantDirectoryStyle =
      componentBaseline?.directoryStyle ?? repoBaseline.directoryStyle;
    const languageProfile = extensionToLanguageProfile(filePath);
    const historyBaseline = component
      ? historyBaselines?.[component.path]
      : undefined;
    const historyFileStyle = diffConventionOptions.useLanguageProfiles
      ? historyBaseline?.fileStyleByLanguage[languageProfile]
      : undefined;
    const historyDirectoryStyle = diffConventionOptions.useLanguageProfiles
      ? historyBaseline?.directoryStyleByLanguage[languageProfile]
      : undefined;
    const effectiveFileStyle = historyFileStyle ?? dominantFileStyle;
    const effectiveDirectoryStyle =
      historyDirectoryStyle ?? dominantDirectoryStyle;

    if (effectiveFileStyle) {
      const fileName = filePath.split("/").pop() ?? "";
      const fileStyle = classifyCase(fileName);
      const softMatches =
        diffConventionOptions.softMatchStyles[effectiveFileStyle];
      const fileStyleIsSoftMatch = Boolean(
        fileStyle && softMatches?.includes(fileStyle),
      );

      if (
        fileStyle &&
        fileStyle !== "mixed" &&
        fileStyle !== effectiveFileStyle &&
        !fileStyleIsSoftMatch
      ) {
        const message = `file naming style ${fileStyle} differs from dominant ${effectiveFileStyle}`;
        const key = `${filePath}:${message}`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({ file: filePath, violation: message });
        }
      }
    }

    if (effectiveDirectoryStyle) {
      const directorySegments = filePath.split("/").slice(0, -1);
      for (const segment of directorySegments) {
        if (ignoredSegments.has(segment) || segment.length < 2) {
          continue;
        }
        const dirStyle = classifyCase(segment);
        if (
          !dirStyle ||
          dirStyle === "mixed" ||
          dirStyle === effectiveDirectoryStyle
        ) {
          continue;
        }

        const message = `directory segment "${segment}" uses ${dirStyle} instead of dominant ${effectiveDirectoryStyle}`;
        const key = `${filePath}:${message}`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({ file: filePath, violation: message });
        }
      }
    }
  }

  return violations.sort((a: ConventionViolation, b: ConventionViolation) => {
    if (a.file === b.file) return a.violation.localeCompare(b.violation);
    return a.file.localeCompare(b.file);
  });
};

export const buildDiffScanResult = (
  result: RepoScanResult,
  changedFiles: readonly string[],
  options?: {
    readonly historyBaselines?: Readonly<
      Record<string, ComponentHistoryConventionBaseline>
    >;
  },
): DiffScanResult => {
  const dependencyGraph = result.architecture.crossPackageDeps;
  const affectedComponents = result.architecture.components
    .filter((component) =>
      changedFiles.some(
        (file) =>
          file.startsWith(`${component.path}/`) || file === component.path,
      ),
    )
    .map((component) => component.name)
    .sort();

  const blastRadius = result.architecture.components
    .filter(
      (component) =>
        affectedComponents.includes(component.name) && component.blastRadius,
    )
    .map((component) => {
      const directDependents = dependencyGraph
        ? dependencyGraph.edges
            .filter((edge) => edge.toName === component.name)
            .map((edge) => edge.fromName)
        : [];
      return {
        component: component.name,
        score: component.blastRadius?.score ?? 0,
        dependents: [...new Set(directDependents)].sort(),
      };
    })
    .sort((a, b) => b.score - a.score);

  const todoAnnotations = result.inventory.todoAnnotations ?? [];
  const deadExports = result.inventory.deadExports ?? [];
  const allKnownFiles = [
    ...new Set([
      ...todoAnnotations.map((todo) => todo.file),
      ...deadExports.map((deadExport) => deadExport.file),
      ...changedFiles,
    ]),
  ];

  const newTodos = todoAnnotations.filter((todo) =>
    changedFiles.includes(todo.file),
  );
  const newDeadExports = deadExports.filter((deadExport) =>
    changedFiles.includes(deadExport.file),
  );

  const testFilesToUpdate = deriveCandidateTests(changedFiles, allKnownFiles);
  const conventionViolations = buildConventionViolations(
    result,
    changedFiles,
    options?.historyBaselines,
  );

  const suggestedReviewFocus = [
    ...new Set([...changedFiles, ...testFilesToUpdate]),
  ];

  return {
    changedFiles: [...changedFiles].sort(),
    affectedComponents,
    blastRadius,
    testFilesToUpdate,
    conventionViolations,
    newTodos,
    newDeadExports,
    suggestedReviewFocus,
  };
};
