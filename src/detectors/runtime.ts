import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

const SINGLE_VERSION_FILES: ReadonlyMap<string, string> = new Map([
  [".nvmrc", "Node"],
  [".node-version", "Node"],
  [".python-version", "Python"],
  [".ruby-version", "Ruby"],
  [".terraform-version", "Terraform"],
  [".crystal-version", "Crystal"],
]);

registerDetector({
  id: "runtime",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const findings: Finding[] = [];
    const seenKeys = new Set<string>();

    const emit = (info: {
      language: string;
      version: string;
      source: string;
      filePath: string;
    }) => {
      const v = info.version.trim();
      if (!v) return;
      const key = `${info.language}::${v}::${info.filePath}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      findings.push({
        value: JSON.stringify({
          language: info.language,
          version: v,
          source: info.source,
        }),
        confidence: 1.0,
        evidence: [info.source],
        filePath: info.filePath,
      });
    };

    // 1. Single-version files
    for (const [fileName, language] of SINGLE_VERSION_FILES) {
      for (const file of index.getByNamePrimary(fileName)) {
        const content = await readText(file.path);
        if (!content) continue;
        const version = content.split("\n")[0]?.trim();
        if (version) {
          emit({
            language,
            version,
            source: fileName,
            filePath: file.relativePath,
          });
        }
      }
    }

    // 2. go.mod `go` directive
    for (const file of index.getByNamePrimary("go.mod")) {
      const content = await readText(file.path);
      if (!content) continue;
      const m = content.match(/^go\s+([0-9.]+)/m);
      if (m?.[1]) {
        emit({
          language: "Go",
          version: m[1],
          source: "go.mod",
          filePath: file.relativePath,
        });
      }
    }

    // 3. Gemfile `ruby` directive
    for (const file of index.getByNamePrimary("Gemfile")) {
      const content = await readText(file.path);
      if (!content) continue;
      const m = content.match(/^\s*ruby\s+['"]([^'"]+)['"]/m);
      if (m?.[1]) {
        emit({
          language: "Ruby",
          version: m[1],
          source: "Gemfile#ruby",
          filePath: file.relativePath,
        });
      }
    }

    return { detectorId: "runtime", findings };
  },
});
