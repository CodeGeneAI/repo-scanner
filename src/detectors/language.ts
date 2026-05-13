import { mapWithConcurrency } from "../utils/concurrency";
import type { FileIndex, IndexedFile } from "../utils/file-index";
import { countLines } from "../utils/fs";
import { EXT_TO_LANGUAGE } from "./language-extensions";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

/** Confidence based on file count. */
const fileCountConfidence = (count: number): number => {
  if (count >= 10) return 1.0;
  if (count >= 3) return 0.8;
  if (count >= 1) return 0.5;
  return 0;
};

/** Manifest files that confirm a language with high confidence. */
const MANIFEST_CONFIRMS: ReadonlyMap<string, string> = new Map([
  ["tsconfig.json", "TypeScript"],
  ["jsconfig.json", "JavaScript"],
  ["go.mod", "Go"],
  ["Cargo.toml", "Rust"],
  ["pyproject.toml", "Python"],
  ["setup.py", "Python"],
  ["requirements.txt", "Python"],
  ["Gemfile", "Ruby"],
  ["composer.json", "PHP"],
  ["pom.xml", "Java"],
  ["build.gradle", "Java"],
  ["build.gradle.kts", "Kotlin"],
  ["Package.swift", "Swift"],
  ["pubspec.yaml", "Dart"],
  ["mix.exs", "Elixir"],
  ["CMakeLists.txt", "C++"],
  ["build.zig", "Zig"],
]);

/** Extension-based manifest confirms (not exact filenames). */
const EXT_MANIFEST_CONFIRMS: ReadonlyMap<string, string> = new Map([
  [".csproj", "C#"],
  [".fsproj", "F#"],
]);

/** Max concurrent file reads for LoC counting. */
const LOC_CONCURRENCY = 64;

registerDetector({
  id: "language",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const counts = new Map<string, number>();
    const filesByLang = new Map<string, IndexedFile[]>();

    for (const file of index.all()) {
      const lang = EXT_TO_LANGUAGE.get(file.ext);
      if (lang) {
        counts.set(lang, (counts.get(lang) ?? 0) + 1);
        const list = filesByLang.get(lang);
        if (list) list.push(file);
        else filesByLang.set(lang, [file]);
      }
    }

    const findings: Finding[] = [];

    for (const [lang, count] of counts) {
      findings.push({
        value: lang,
        confidence: fileCountConfidence(count),
        evidence: [`${count} file(s) with matching extensions`],
      });
    }

    // Boost confidence for languages confirmed by manifest files
    for (const [manifestName, lang] of MANIFEST_CONFIRMS) {
      if (index.hasFile(manifestName)) {
        const existing = findings.find((f) => f.value === lang);
        if (existing) {
          const idx = findings.indexOf(existing);
          findings[idx] = {
            ...existing,
            confidence: Math.max(existing.confidence, 1.0),
            evidence: [...existing.evidence, `confirmed by ${manifestName}`],
          };
        } else {
          findings.push({
            value: lang,
            confidence: 0.8,
            evidence: [`manifest file: ${manifestName}`],
          });
        }
      }
    }

    // Check extension-based manifest confirms (.csproj → C#, .fsproj → F#)
    for (const [ext, lang] of EXT_MANIFEST_CONFIRMS) {
      if (index.getByExtension(ext).length > 0) {
        const existing = findings.find((f) => f.value === lang);
        if (existing) {
          const idx = findings.indexOf(existing);
          findings[idx] = {
            ...existing,
            confidence: Math.max(existing.confidence, 1.0),
            evidence: [...existing.evidence, `confirmed by ${ext} files`],
          };
        } else {
          findings.push({
            value: lang,
            confidence: 0.8,
            evidence: [`${ext} files found`],
          });
        }
      }
    }

    // Count lines of code per language concurrently
    const allLangFiles = [...filesByLang.entries()].flatMap(([lang, files]) =>
      files.map((f) => ({ lang, path: f.path })),
    );
    const lineCounts = await mapWithConcurrency(
      allLangFiles,
      LOC_CONCURRENCY,
      async (item) => ({ lang: item.lang, lines: await countLines(item.path) }),
    );
    const locByLang = new Map<string, number>();
    for (const { lang, lines } of lineCounts) {
      locByLang.set(lang, (locByLang.get(lang) ?? 0) + lines);
    }

    // Compute language stats (file counts + percentages + LoC)
    const totalFiles = [...counts.values()].reduce((sum, n) => sum + n, 0);
    const totalLines = [...locByLang.values()].reduce((sum, n) => sum + n, 0);
    const perLanguage =
      totalFiles > 0
        ? [...counts.entries()]
            .map(([language, files]) => ({
              language,
              files,
              lines: locByLang.get(language) ?? 0,
              percentage: Math.round((files / totalFiles) * 1000) / 10,
            }))
            .sort((a, b) => b.percentage - a.percentage)
        : [];

    return {
      detectorId: "language",
      findings: findings.sort((a, b) => b.confidence - a.confidence),
      metadata: { perLanguage, totalFiles, totalLines },
    };
  },
});
