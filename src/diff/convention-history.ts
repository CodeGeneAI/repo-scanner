import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import { classifyCase } from "../detectors/naming-convention/case-classifier";
import type { Component } from "../types";
import type { ComponentHistoryConventionBaseline } from "./scan-diff";

const execFileAsync = promisify(execFile);

const extensionToLanguageProfile = (relativePath: string): string => {
  const ext = path.extname(relativePath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
      return "typescript";
    case ".py":
      return "python";
    case ".go":
      return "go";
    case ".rs":
      return "rust";
    case ".java":
      return "java";
    case ".cs":
      return "csharp";
    default:
      return "unknown";
  }
};

const selectDominantStyle = (
  counts: Map<string, number>,
): string | undefined => {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0];
};

const collectStyle = (
  counter: Map<string, number>,
  candidate: string | undefined,
): void => {
  if (!candidate || candidate === "mixed") return;
  counter.set(candidate, (counter.get(candidate) ?? 0) + 1);
};

export const learnComponentConventionBaselinesFromGit = async (
  rootPath: string,
  components: readonly Component[],
  maxCommits = 200,
): Promise<Readonly<Record<string, ComponentHistoryConventionBaseline>>> => {
  const result: Record<string, ComponentHistoryConventionBaseline> = {};

  for (const component of components) {
    const languageFileCounters = new Map<string, Map<string, number>>();
    const languageDirectoryCounters = new Map<string, Map<string, number>>();
    const sampleSizeByLanguage: Record<string, number> = {};
    const args = [
      "log",
      `--max-count=${String(maxCommits)}`,
      "--name-only",
      "--pretty=format:",
      "--",
      component.path,
    ];

    let stdout = "";
    try {
      const response = await execFileAsync("git", args, { cwd: rootPath });
      stdout = response.stdout;
    } catch {
      continue;
    }

    const files = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.endsWith("/"));

    for (const file of files) {
      const language = extensionToLanguageProfile(file);
      const fileName = file.split("/").pop() ?? "";
      const directories = file.split("/").slice(0, -1);

      const fileCounter = languageFileCounters.get(language) ?? new Map();
      collectStyle(fileCounter, classifyCase(fileName));
      languageFileCounters.set(language, fileCounter);

      const dirCounter = languageDirectoryCounters.get(language) ?? new Map();
      for (const segment of directories) {
        collectStyle(dirCounter, classifyCase(segment));
      }
      languageDirectoryCounters.set(language, dirCounter);

      sampleSizeByLanguage[language] =
        (sampleSizeByLanguage[language] ?? 0) + 1;
    }

    const fileStyleByLanguage: Record<string, string> = {};
    const directoryStyleByLanguage: Record<string, string> = {};

    for (const [language, counter] of languageFileCounters.entries()) {
      const style = selectDominantStyle(counter);
      if (style) fileStyleByLanguage[language] = style;
    }
    for (const [language, counter] of languageDirectoryCounters.entries()) {
      const style = selectDominantStyle(counter);
      if (style) directoryStyleByLanguage[language] = style;
    }

    result[component.path] = {
      componentPath: component.path,
      fileStyleByLanguage,
      directoryStyleByLanguage,
      sampleSizeByLanguage,
    };
  }

  return result;
};
