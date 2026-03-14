import path from "path";
import type {
  Dependency,
  Ecosystem,
  IndexedUsageFile,
  UsageLocation,
} from "../types";
import { mapWithConcurrency } from "../utils/concurrency";
import { readTextFile, walkFiles } from "../utils/fs";
import { ECOSYSTEM_EXTENSIONS } from "./patterns";

const selectUsageFilesFromIndex = (
  rootPath: string,
  ecosystem: Ecosystem,
  indexedUsageFiles: readonly IndexedUsageFile[],
): string[] => {
  const allowedExtensions = new Set(ECOSYSTEM_EXTENSIONS[ecosystem]);
  return indexedUsageFiles
    .filter((file) => allowedExtensions.has(file.ext))
    .map((file) =>
      path.isAbsolute(file.path) ? file.path : path.join(rootPath, file.path),
    )
    .sort((left, right) => left.localeCompare(right));
};

const collectUsageFilesFromFs = async (
  rootPath: string,
  ecosystem: Ecosystem,
): Promise<string[]> => {
  const extensions = new Set(ECOSYSTEM_EXTENSIONS[ecosystem]);
  const files: string[] = [];
  for await (const filePath of walkFiles(rootPath, extensions)) {
    files.push(filePath);
  }
  return files.sort((left, right) => left.localeCompare(right));
};

/**
 * Scan the project for import usages of the given dependencies.
 * Returns a map of dependency name -> usage locations.
 */
export const scanUsages = async (
  rootPath: string,
  ecosystem: Ecosystem,
  _dependencies: readonly Dependency[],
  importPatterns: Map<string, RegExp>,
  concurrency: number,
  indexedUsageFiles?: readonly IndexedUsageFile[],
  indexedFileContent?: ReadonlyMap<string, string>,
): Promise<Map<string, UsageLocation[]>> => {
  const results = new Map<string, UsageLocation[]>();

  if (importPatterns.size === 0) return results;

  const files = indexedUsageFiles
    ? selectUsageFilesFromIndex(rootPath, ecosystem, indexedUsageFiles)
    : await collectUsageFilesFromFs(rootPath, ecosystem);

  await mapWithConcurrency(files, concurrency, async (filePath) => {
    const content =
      indexedFileContent?.get(filePath) ?? (await readTextFile(filePath));
    if (!content) return;

    const lines = content.split("\n");

    for (const [depName, pattern] of importPatterns) {
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex]!;
        if (pattern.test(line)) {
          const usages = results.get(depName) ?? [];
          usages.push({
            filePath,
            line: lineIndex + 1,
            importStatement: line.trim(),
          });
          results.set(depName, usages);
        }
      }
    }
  });

  return results;
};
