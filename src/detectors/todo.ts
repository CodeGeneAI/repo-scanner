import type { TodoAnnotation } from "../types";
import { mapWithConcurrency } from "../utils/concurrency";
import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { EXT_TO_LANGUAGE } from "./language-extensions";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

const SCAN_CONCURRENCY = 64;
const MAX_ANNOTATIONS = 500;

const TODO_REGEX = /\b(TODO|FIXME|HACK|BUG|XXX)(?:\(([^)]*)\))?[:\s]+(.+)/i;

const VALID_TAGS = new Set(["TODO", "FIXME", "HACK", "BUG", "XXX"]);

registerDetector({
  id: "todo",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const codeFiles = index.all().filter((f) => EXT_TO_LANGUAGE.has(f.ext));

    const allAnnotations: TodoAnnotation[] = [];

    const fileResults = await mapWithConcurrency(
      codeFiles,
      SCAN_CONCURRENCY,
      async (file) => {
        const content = await readText(file.path);
        if (!content) return [];

        const annotations: TodoAnnotation[] = [];
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const match = TODO_REGEX.exec(lines[i]!);
          if (!match) continue;

          const rawTag = match[1]!.toUpperCase();
          if (!VALID_TAGS.has(rawTag)) continue;

          annotations.push({
            tag: rawTag as TodoAnnotation["tag"],
            text: match[3]!.trim(),
            file: file.relativePath,
            line: i + 1,
            author: match[2]?.trim() || undefined,
          });
        }

        return annotations;
      },
    );

    for (const annotations of fileResults) {
      allAnnotations.push(...annotations);
    }

    // Sort by file then line
    allAnnotations.sort((a, b) =>
      a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line,
    );

    // Cap at MAX_ANNOTATIONS
    const capped = allAnnotations.slice(0, MAX_ANNOTATIONS);

    // Build findings: one per tag type with count
    const tagCounts = new Map<string, number>();
    for (const a of capped) {
      tagCounts.set(a.tag, (tagCounts.get(a.tag) ?? 0) + 1);
    }

    const findings: Finding[] = [...tagCounts.entries()].map(
      ([tag, count]) => ({
        value: tag,
        confidence: 1.0,
        evidence: [`found ${count} ${tag} annotation${count > 1 ? "s" : ""}`],
      }),
    );

    return {
      detectorId: "todo",
      findings,
      metadata: { todoAnnotations: capped },
    };
  },
});
