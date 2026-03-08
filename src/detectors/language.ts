import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

/** Extension → language name mapping. */
const EXT_TO_LANGUAGE: ReadonlyMap<string, string> = new Map([
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".mjs", "JavaScript"],
  [".cjs", "JavaScript"],
  [".py", "Python"],
  [".go", "Go"],
  [".rs", "Rust"],
  [".java", "Java"],
  [".cs", "C#"],
  [".rb", "Ruby"],
  [".php", "PHP"],
  [".swift", "Swift"],
  [".dart", "Dart"],
  [".c", "C"],
  [".h", "C"],
  [".cpp", "C++"],
  [".cc", "C++"],
  [".cxx", "C++"],
  [".hpp", "C++"],
  [".kt", "Kotlin"],
  [".scala", "Scala"],
  [".ex", "Elixir"],
  [".exs", "Elixir"],
  [".zig", "Zig"],
  [".lua", "Lua"],
  [".r", "R"],
  [".R", "R"],
  [".pl", "Perl"],
  [".sh", "Shell"],
  [".bash", "Shell"],
  [".zsh", "Shell"],
  [".tcl", "Tcl"],
  [".fs", "F#"],
  [".fsx", "F#"],
]);

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

registerDetector({
  id: "language",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const counts = new Map<string, number>();

    for (const file of index.all()) {
      const lang = EXT_TO_LANGUAGE.get(file.ext);
      if (lang) {
        counts.set(lang, (counts.get(lang) ?? 0) + 1);
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

    return {
      detectorId: "language",
      findings: findings.sort((a, b) => b.confidence - a.confidence),
    };
  },
});
