import type { DeadExport } from "../../types";
import { mapWithConcurrency } from "../../utils/concurrency";
import { isGeneratedFile, isTestFile } from "../../utils/file-filters";
import type { FileIndex, IndexedFile } from "../../utils/file-index";
import { isSecondaryPath } from "../../utils/file-index";
import { readText } from "../../utils/fs";
import { EXT_TO_LANGUAGE } from "../language-extensions";
import { registerDetector } from "../registry";
import type { DetectorResult, Finding } from "../types";
import {
  extractCSharpExports,
  extractDartExports,
  extractElixirExports,
  extractFSharpExports,
  extractGoExports,
  extractJavaExports,
  extractPhpExports,
  extractPythonExports,
  extractRubyExports,
  extractRustExports,
  extractScalaExports,
  extractSwiftExports,
  extractTsExports,
  extractVbNetExports,
  type RawExport,
} from "./export-extractors";
import {
  extractDartImportedSymbols,
  extractDotNetImportedSymbols,
  extractElixirReferencedSymbols,
  extractGoReferencedSymbols,
  extractJavaImportedSymbols,
  extractPhpImportedSymbols,
  extractPythonImportedSymbols,
  extractRubyReferencedSymbols,
  extractRustImportedSymbols,
  extractScalaImportedSymbols,
  extractSwiftReferencedSymbols,
  extractTsImportedSymbols,
} from "./import-extractors";

const SCAN_CONCURRENCY = 64;
const MAX_DEAD_EXPORTS = 200;

/** Entry point filenames whose exports are excluded (public API surfaces). */
const ENTRY_POINTS = new Set([
  "index.ts",
  "index.js",
  "index.tsx",
  "index.jsx",
  "index.mjs",
  "main.ts",
  "main.js",
  "main.go",
  "lib.rs",
  "mod.rs",
  "__init__.py",
  "main.dart",
  "main.swift",
]);

type ExportExtractor = (lines: readonly string[]) => RawExport[];
type ImportExtractor =
  | { mode: "lines"; extract: (lines: readonly string[]) => Set<string> }
  | { mode: "content"; extract: (content: string) => Set<string> };

const EXPORT_EXTRACTORS: Record<string, ExportExtractor> = {
  ".ts": extractTsExports,
  ".tsx": extractTsExports,
  ".js": extractTsExports,
  ".jsx": extractTsExports,
  ".mjs": extractTsExports,
  ".cjs": extractTsExports,
  ".go": extractGoExports,
  ".rs": extractRustExports,
  ".py": extractPythonExports,
  ".java": extractJavaExports,
  ".kt": extractJavaExports,
  ".rb": extractRubyExports,
  ".cs": extractCSharpExports,
  ".fs": extractFSharpExports,
  ".fsx": extractFSharpExports,
  ".vb": extractVbNetExports,
  ".php": extractPhpExports,
  ".swift": extractSwiftExports,
  ".scala": extractScalaExports,
  ".dart": extractDartExports,
  ".ex": extractElixirExports,
  ".exs": extractElixirExports,
};

const IMPORT_EXTRACTORS: Record<string, ImportExtractor> = {
  ".ts": { mode: "lines", extract: extractTsImportedSymbols },
  ".tsx": { mode: "lines", extract: extractTsImportedSymbols },
  ".js": { mode: "lines", extract: extractTsImportedSymbols },
  ".jsx": { mode: "lines", extract: extractTsImportedSymbols },
  ".mjs": { mode: "lines", extract: extractTsImportedSymbols },
  ".cjs": { mode: "lines", extract: extractTsImportedSymbols },
  ".go": { mode: "content", extract: extractGoReferencedSymbols },
  ".rs": { mode: "lines", extract: extractRustImportedSymbols },
  ".py": { mode: "lines", extract: extractPythonImportedSymbols },
  ".java": { mode: "lines", extract: extractJavaImportedSymbols },
  ".kt": { mode: "lines", extract: extractJavaImportedSymbols },
  ".rb": { mode: "content", extract: extractRubyReferencedSymbols },
  ".cs": { mode: "lines", extract: extractDotNetImportedSymbols },
  ".fs": { mode: "lines", extract: extractDotNetImportedSymbols },
  ".fsx": { mode: "lines", extract: extractDotNetImportedSymbols },
  ".vb": { mode: "lines", extract: extractDotNetImportedSymbols },
  ".php": { mode: "lines", extract: extractPhpImportedSymbols },
  ".swift": { mode: "content", extract: extractSwiftReferencedSymbols },
  ".scala": { mode: "lines", extract: extractScalaImportedSymbols },
  ".dart": { mode: "lines", extract: extractDartImportedSymbols },
  ".ex": { mode: "content", extract: extractElixirReferencedSymbols },
  ".exs": { mode: "content", extract: extractElixirReferencedSymbols },
};

interface FileExport {
  file: IndexedFile;
  exports: RawExport[];
  language: string;
}

registerDetector({
  id: "dead-export",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const codeFiles = index.all().filter((f) => EXT_TO_LANGUAGE.has(f.ext));

    // Pass 1: Collect exports from non-test, non-entry-point, non-generated, non-example files
    const exportFiles = codeFiles.filter(
      (f) =>
        !isTestFile(f.name, f.relativePath) &&
        !ENTRY_POINTS.has(f.name) &&
        !isGeneratedFile(f.name, f.relativePath) &&
        !isSecondaryPath(f.relativePath),
    );

    const fileExports = await mapWithConcurrency(
      exportFiles,
      SCAN_CONCURRENCY,
      async (file): Promise<FileExport | null> => {
        const extractor = EXPORT_EXTRACTORS[file.ext];
        if (!extractor) return null;

        const content = await readText(file.path);
        if (!content) return null;

        const lines = content.split("\n");
        const exports = extractor(lines);
        if (exports.length === 0) return null;

        return {
          file,
          exports,
          language: EXT_TO_LANGUAGE.get(file.ext)!,
        };
      },
    );

    const validExports = fileExports.filter((e): e is FileExport => e !== null);

    if (validExports.length === 0) {
      return {
        detectorId: "dead-export",
        findings: [],
        metadata: { deadExports: [] },
      };
    }

    // Pass 2: Collect imported/referenced symbols per file across ALL code files (including tests)
    // We track per-file to exclude self-references for content-based scanners (Go, Ruby)
    const symbolToFiles = new Map<string, Set<string>>();

    await mapWithConcurrency(codeFiles, SCAN_CONCURRENCY, async (file) => {
      const extractor = IMPORT_EXTRACTORS[file.ext];
      if (!extractor) return;

      const content = await readText(file.path);
      if (!content) return;

      let symbols: Set<string>;
      if (extractor.mode === "lines") {
        symbols = extractor.extract(content.split("\n"));
      } else {
        symbols = extractor.extract(content);
      }

      for (const s of symbols) {
        let files = symbolToFiles.get(s);
        if (!files) {
          files = new Set();
          symbolToFiles.set(s, files);
        }
        files.add(file.relativePath);
      }
    });

    // Pass 3: Find dead exports (exported but never imported/referenced from another file)
    const deadExports: DeadExport[] = [];
    for (const fe of validExports) {
      for (const exp of fe.exports) {
        const referencingFiles = symbolToFiles.get(exp.symbol);
        // Symbol is used if referenced from any file OTHER than the defining file
        const usedElsewhere = referencingFiles
          ? [...referencingFiles].some((f) => f !== fe.file.relativePath)
          : false;

        if (!usedElsewhere) {
          deadExports.push({
            symbol: exp.symbol,
            file: fe.file.relativePath,
            line: exp.line,
            language: fe.language,
            exportType: exp.exportType,
          });
        }
      }
    }

    // Sort by file then line, cap at MAX
    deadExports.sort((a, b) =>
      a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line,
    );
    const capped = deadExports.slice(0, MAX_DEAD_EXPORTS);

    const findings: Finding[] =
      capped.length > 0
        ? [
            {
              value: "dead-exports",
              confidence: 0.6,
              evidence: [
                `${capped.length} exported symbol${capped.length > 1 ? "s" : ""} with no detected imports (heuristic)`,
              ],
            },
          ]
        : [];

    return {
      detectorId: "dead-export",
      findings,
      metadata: { deadExports: capped },
    };
  },
});
