import type { FileIndex } from "../utils/file-index";
import { isSecondaryPath } from "../utils/file-index";
import { readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface LintCheck {
  detect: (index: FileIndex) => boolean;
  name: string;
  evidence: string;
  /** If set, requires additional async validation. */
  asyncValidate?: (index: FileIndex) => Promise<boolean>;
}

const LINT_CHECKS: readonly LintCheck[] = [
  {
    detect: (idx) =>
      idx.hasFilePrimary("biome.json") || idx.hasFilePrimary("biome.jsonc"),
    name: "Biome",
    evidence: "biome.json / biome.jsonc",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            !isSecondaryPath(f.relativePath) &&
            (f.name.startsWith(".eslintrc.") ||
              f.name.startsWith("eslint.config.")),
        ),
    name: "ESLint",
    evidence: ".eslintrc.* / eslint.config.*",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            !isSecondaryPath(f.relativePath) &&
            (f.name.startsWith(".prettierrc") ||
              f.name.startsWith("prettier.config.")),
        ),
    name: "Prettier",
    evidence: ".prettierrc* / prettier.config.*",
  },
  {
    detect: (idx) => idx.hasFile("ruff.toml") || idx.hasFile(".ruff.toml"),
    name: "Ruff",
    evidence: "ruff.toml / .ruff.toml",
  },
  {
    detect: (idx) => idx.hasFile("pyproject.toml"),
    name: "Ruff",
    evidence: "pyproject.toml [tool.ruff]",
    asyncValidate: async (idx) => {
      for (const f of idx.getByName("pyproject.toml")) {
        const content = await readText(f.path);
        if (content?.includes("[tool.ruff]")) return true;
      }
      return false;
    },
  },
  {
    detect: (idx) =>
      idx.hasFile(".golangci.yml") || idx.hasFile(".golangci.yaml"),
    name: "golangci-lint",
    evidence: ".golangci.yml / .golangci.yaml",
  },
  {
    detect: (idx) => idx.hasFile("rustfmt.toml"),
    name: "rustfmt",
    evidence: "rustfmt.toml",
  },
  {
    detect: (idx) => idx.hasFile(".clang-format"),
    name: "ClangFormat",
    evidence: ".clang-format",
  },
  {
    detect: (idx) => idx.hasFile(".editorconfig"),
    name: "EditorConfig",
    evidence: ".editorconfig",
  },
  {
    detect: (idx) => idx.all().some((f) => f.name.startsWith(".stylelintrc")),
    name: "Stylelint",
    evidence: ".stylelintrc*",
  },
];

registerDetector({
  id: "linting",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const seen = new Set<string>();
    const findings: Finding[] = [];

    for (const check of LINT_CHECKS) {
      if (seen.has(check.name)) continue;

      if (check.detect(index)) {
        if (check.asyncValidate) {
          const valid = await check.asyncValidate(index);
          if (!valid) continue;
        }

        seen.add(check.name);
        findings.push({
          value: check.name,
          confidence: 1.0,
          evidence: [check.evidence],
        });
      }
    }

    return { detectorId: "linting", findings };
  },
});
