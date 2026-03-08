import type { DetectorResult } from "../detectors/types";
import type { Component, RepoScanResult } from "../types";
import { classifyComponent } from "./component-classifier";

/** Merge all detector results into a single RepoScanResult. */
export const aggregate = (
  scanPath: string,
  durationMs: number,
  results: readonly DetectorResult[],
): RepoScanResult => {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const datastores = new Set<string>();
  const dependencyManagers = new Set<string>();
  const repoTools = new Set<string>();
  const ciSystems = new Set<string>();
  const buildCommands = new Set<string>();
  const testCommands = new Set<string>();
  const lintCommands = new Set<string>();

  const signals = {
    hasReadme: false,
    hasCi: false,
    hasContainerization: false,
    hasIaC: false,
    hasTests: false,
    hasTypedContracts: false,
  };

  const componentMap = new Map<string, Component>();
  let isMonorepo = false;

  const categoryMap: Record<string, Set<string>> = {
    language: languages,
    framework: frameworks,
    datastore: datastores,
    "dependency-manager": dependencyManagers,
    "repo-tools": repoTools,
    ci: ciSystems,
    linting: repoTools,
    containerization: repoTools,
    iac: repoTools,
    testing: repoTools,
    build: repoTools,
  };

  /** Minimum confidence threshold for language findings. */
  const LANGUAGE_CONFIDENCE_THRESHOLD = 0.7;

  for (const result of results) {
    const targetSet = categoryMap[result.detectorId];

    for (const finding of result.findings) {
      if (targetSet) {
        // Filter out low-confidence languages (single-file detections)
        if (
          result.detectorId === "language" &&
          finding.confidence < LANGUAGE_CONFIDENCE_THRESHOLD
        ) {
          continue;
        }
        targetSet.add(finding.value);
      }
    }

    // Commands
    if (result.commands) {
      for (const cmd of result.commands.build ?? []) buildCommands.add(cmd);
      for (const cmd of result.commands.test ?? []) testCommands.add(cmd);
      for (const cmd of result.commands.lint ?? []) lintCommands.add(cmd);
    }

    // Signals (OR semantics)
    if (result.signals) {
      for (const [key, value] of Object.entries(result.signals)) {
        if (value) (signals as Record<string, boolean>)[key] = true;
      }
    }

    // Component hints
    if (result.componentHints) {
      for (const hint of result.componentHints) {
        if (!componentMap.has(hint.path)) {
          const kind = classifyComponent(hint);
          componentMap.set(hint.path, {
            name: hint.name ?? hint.path.split("/").pop() ?? hint.path,
            path: hint.path,
            kind,
            description: hint.description ?? "",
            confidence: 0.8,
            evidence: [],
          });
        }
      }
    }

    // Special: monorepo detection
    if (result.detectorId === "monorepo") {
      isMonorepo = result.findings.length > 0;
    }
  }

  // Derive signals from detector presence
  if (ciSystems.size > 0) signals.hasCi = true;

  const components = [...componentMap.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );

  return {
    inventory: {
      languages: sorted(languages),
      frameworks: sorted(frameworks),
      datastores: sorted(datastores),
      dependencyManagers: sorted(dependencyManagers),
      repoTools: sorted(repoTools),
    },
    architecture: { monorepo: isMonorepo, components },
    buildAndTest: {
      buildCommands: sorted(buildCommands),
      testCommands: sorted(testCommands),
      lintCommands: sorted(lintCommands),
      ciSystems: sorted(ciSystems),
    },
    signals,
    scanPath,
    timestamp: new Date().toISOString(),
    durationMs,
  };
};

const sorted = (set: Set<string>): string[] => [...set].sort();
