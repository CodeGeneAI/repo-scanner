import type { EnvVarInfo, EnvVarUsage } from "../../types";
import { isTestFile } from "../../utils/file-filters";
import type { FileIndex } from "../../utils/file-index";
import { readText } from "../../utils/fs";
import { registerDetector } from "../registry";
import type { DetectorResult, Finding } from "../types";
import {
  isDockerComposeFile,
  isDotenvFile,
  isGitHubActionsWorkflow,
  parseDockerCompose,
  parseDotenv,
  parseKubernetes,
} from "./config-parsers";
import { getExtractorForExtension, SUPPORTED_EXTENSIONS } from "./extractors";
import { detectFrameworkPrefix, inferType, isRequired } from "./inference";
import type { ExtractorMatch } from "./types";

let includeTestFiles = false;

/** Include env vars found in test files (disabled by default). */
export const setEnvIncludeTestFiles = (include: boolean): void => {
  includeTestFiles = include;
};

/** Matches with their source file path attached. */
interface FileMatch extends ExtractorMatch {
  readonly file: string;
}

/** Process source files using language extractors. */
const extractFromSourceFiles = async (
  index: FileIndex,
  includeTestFiles: boolean,
): Promise<FileMatch[]> => {
  const allMatches: FileMatch[] = [];
  const matcher = index.ignoreMatcher;

  for (const ext of SUPPORTED_EXTENSIONS) {
    const extractor = getExtractorForExtension(ext);
    if (!extractor) continue;

    const files = index.getByExtensionPrimary(ext);
    for (const file of files) {
      if (!includeTestFiles && isTestFile(file.name, file.relativePath))
        continue;
      // Check scoped .scanignore rules for env detector
      if (matcher?.ignores(file.relativePath, false, "env")) continue;

      const content = await readText(file.path);
      if (!content) continue;

      const lines = content.split("\n");
      const matches = extractor(lines, file.relativePath);
      for (const match of matches) {
        allMatches.push({ ...match, file: file.relativePath });
      }
    }
  }

  return allMatches;
};

/** Process config files (dotenv, docker-compose, k8s). */
const extractFromConfigFiles = async (
  index: FileIndex,
): Promise<FileMatch[]> => {
  const allMatches: FileMatch[] = [];

  // .env files (match by name starting with .env)
  for (const file of index.all()) {
    if (!isDotenvFile(file.name)) continue;

    const content = await readText(file.path);
    if (!content) continue;

    const matches = parseDotenv(content, file.relativePath);
    for (const match of matches) {
      allMatches.push({ ...match, file: file.relativePath });
    }
  }

  // docker-compose files
  const composeNames = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];
  for (const name of composeNames) {
    for (const file of index.getByNamePrimary(name)) {
      const content = await readText(file.path);
      if (!content) continue;

      const matches = parseDockerCompose(content, file.relativePath);
      for (const match of matches) {
        allMatches.push({ ...match, file: file.relativePath });
      }
    }
  }

  // Kubernetes manifests (.yml/.yaml files that contain kind: Deployment etc.)
  for (const ext of [".yml", ".yaml"]) {
    for (const file of index.getByExtensionPrimary(ext)) {
      // Skip files already handled as compose or GH Actions
      if (isDockerComposeFile(file.name)) continue;
      if (isGitHubActionsWorkflow(file.relativePath)) continue;

      const content = await readText(file.path);
      if (!content) continue;

      const matches = parseKubernetes(content, file.relativePath);
      if (matches.length > 0) {
        for (const match of matches) {
          allMatches.push({ ...match, file: file.relativePath });
        }
      }
    }
  }

  return allMatches;
};

/** Aggregate raw matches into deduplicated EnvVarInfo entries. */
const aggregateMatches = (matches: readonly FileMatch[]): EnvVarInfo[] => {
  // Group by varName
  const groups = new Map<string, FileMatch[]>();
  for (const match of matches) {
    // Skip dynamic matches
    if (match.isDynamic) continue;

    const existing = groups.get(match.varName);
    if (existing) {
      existing.push(match);
    } else {
      groups.set(match.varName, [match]);
    }
  }

  // Build EnvVarInfo for each group
  const results: EnvVarInfo[] = [];

  for (const [varName, groupMatches] of groups) {
    // Deduplicate usages by file:line
    const usageKeys = new Set<string>();
    const usages: EnvVarUsage[] = [];
    for (const match of groupMatches) {
      const key = `${match.file}:${match.line}`;
      if (usageKeys.has(key)) continue;
      usageKeys.add(key);
      usages.push({
        file: match.file,
        line: match.line,
        pattern: match.pattern,
        accessType: match.accessType,
      });
    }

    // Find the first explicit default value
    const defaultValue = groupMatches.find((m) => m.defaultValue)?.defaultValue;

    // Check if defined in any config file
    const definedInConfig = groupMatches.some((m) => m.isConfigFile);

    results.push({
      name: varName,
      usages,
      inferredType: inferType(varName, groupMatches),
      defaultValue,
      required: isRequired(groupMatches),
      definedInConfig,
      frameworkPrefix: detectFrameworkPrefix(varName),
    });
  }

  // Sort alphabetically
  results.sort((a, b) => a.name.localeCompare(b.name));

  return results;
};

// ─── Register Detector ───────────────────────────────────────────────

registerDetector({
  id: "env",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    // Extract from source files and config files concurrently
    const [sourceMatches, configMatches] = await Promise.all([
      extractFromSourceFiles(index, includeTestFiles),
      extractFromConfigFiles(index),
    ]);

    const allMatches = [...sourceMatches, ...configMatches];
    const envVarDetails = aggregateMatches(allMatches);

    // Create simple findings for the aggregator (var names)
    const findings: Finding[] = envVarDetails.map((v) => ({
      value: v.name,
      confidence: 1.0,
      evidence: v.usages.slice(0, 3).map((u) => `${u.file}:${u.line}`),
    }));

    return {
      detectorId: "env",
      findings,
      metadata: { envVarDetails },
    };
  },
});
