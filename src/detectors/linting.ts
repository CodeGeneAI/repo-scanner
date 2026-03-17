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
    detect: (idx) =>
      idx.hasFilePrimary("ruff.toml") || idx.hasFilePrimary(".ruff.toml"),
    name: "Ruff",
    evidence: "ruff.toml / .ruff.toml",
  },
  {
    detect: (idx) => idx.hasFilePrimary("pyproject.toml"),
    name: "Ruff",
    evidence: "pyproject.toml [tool.ruff]",
    asyncValidate: async (idx) => {
      for (const f of idx.getByNamePrimary("pyproject.toml")) {
        const content = await readText(f.path);
        if (content?.includes("[tool.ruff]")) return true;
      }
      return false;
    },
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary(".golangci.yml") ||
      idx.hasFilePrimary(".golangci.yaml"),
    name: "golangci-lint",
    evidence: ".golangci.yml / .golangci.yaml",
  },
  {
    detect: (idx) => idx.hasFilePrimary("rustfmt.toml"),
    name: "rustfmt",
    evidence: "rustfmt.toml",
  },
  {
    detect: (idx) => idx.hasFilePrimary(".clang-format"),
    name: "ClangFormat",
    evidence: ".clang-format",
  },
  {
    detect: (idx) => idx.hasFilePrimary(".editorconfig"),
    name: "EditorConfig",
    evidence: ".editorconfig",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            !isSecondaryPath(f.relativePath) &&
            f.name.startsWith(".stylelintrc"),
        ),
    name: "Stylelint",
    evidence: ".stylelintrc*",
  },

  // Python
  {
    detect: (idx) =>
      idx.hasFilePrimary(".flake8") ||
      idx.hasFilePrimary("setup.cfg") ||
      idx.hasFilePrimary("tox.ini"),
    name: "flake8",
    evidence: ".flake8 / setup.cfg / tox.ini",
    asyncValidate: async (idx) => {
      if (idx.hasFilePrimary(".flake8")) return true;
      for (const name of ["setup.cfg", "tox.ini"] as const) {
        for (const f of idx.getByNamePrimary(name)) {
          const content = await readText(f.path);
          if (content?.includes("[flake8]")) return true;
        }
      }
      return false;
    },
  },
  {
    detect: (idx) => idx.hasFilePrimary("pyproject.toml"),
    name: "black",
    evidence: "pyproject.toml [tool.black]",
    asyncValidate: async (idx) => {
      for (const f of idx.getByNamePrimary("pyproject.toml")) {
        const content = await readText(f.path);
        if (content?.includes("[tool.black]")) return true;
      }
      return false;
    },
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary(".pylintrc") || idx.hasFilePrimary("pyproject.toml"),
    name: "Pylint",
    evidence: ".pylintrc / pyproject.toml [tool.pylint]",
    asyncValidate: async (idx) => {
      if (idx.hasFilePrimary(".pylintrc")) return true;
      for (const f of idx.getByNamePrimary("pyproject.toml")) {
        const content = await readText(f.path);
        if (content?.includes("[tool.pylint]")) return true;
      }
      return false;
    },
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("mypy.ini") ||
      idx.hasFilePrimary(".mypy.ini") ||
      idx.hasFilePrimary("pyproject.toml"),
    name: "mypy",
    evidence: "mypy.ini / .mypy.ini / pyproject.toml [tool.mypy]",
    asyncValidate: async (idx) => {
      if (idx.hasFilePrimary("mypy.ini") || idx.hasFilePrimary(".mypy.ini"))
        return true;
      for (const f of idx.getByNamePrimary("pyproject.toml")) {
        const content = await readText(f.path);
        if (content?.includes("[tool.mypy]")) return true;
      }
      return false;
    },
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("pyrightconfig.json") ||
      idx.hasFilePrimary("pyproject.toml"),
    name: "Pyright",
    evidence: "pyrightconfig.json / pyproject.toml [tool.pyright]",
    asyncValidate: async (idx) => {
      if (idx.hasFilePrimary("pyrightconfig.json")) return true;
      for (const f of idx.getByNamePrimary("pyproject.toml")) {
        const content = await readText(f.path);
        if (content?.includes("[tool.pyright]")) return true;
      }
      return false;
    },
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("pyproject.toml") || idx.hasFilePrimary("setup.cfg"),
    name: "isort",
    evidence: "pyproject.toml [tool.isort] / setup.cfg [isort]",
    asyncValidate: async (idx) => {
      for (const f of idx.getByNamePrimary("pyproject.toml")) {
        const content = await readText(f.path);
        if (content?.includes("[tool.isort]")) return true;
      }
      for (const f of idx.getByNamePrimary("setup.cfg")) {
        const content = await readText(f.path);
        if (content?.includes("[isort]")) return true;
      }
      return false;
    },
  },

  // Java / Kotlin
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            !isSecondaryPath(f.relativePath) &&
            (f.name === "checkstyle.xml" ||
              f.name.startsWith("checkstyle-") ||
              f.name === ".checkstyle"),
        ),
    name: "Checkstyle",
    evidence: "checkstyle.xml / checkstyle-*.xml",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            !isSecondaryPath(f.relativePath) &&
            (f.name === "spotbugs-exclude.xml" ||
              f.name === "spotbugsExclude.xml"),
        ),
    name: "SpotBugs",
    evidence: "spotbugs-exclude.xml",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            !isSecondaryPath(f.relativePath) &&
            f.name.startsWith("pmd") &&
            f.ext === ".xml",
        ),
    name: "PMD",
    evidence: "pmd*.xml",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("detekt.yml") || idx.hasFilePrimary(".detekt.yml"),
    name: "Detekt",
    evidence: "detekt.yml / .detekt.yml",
  },

  // Ruby
  {
    detect: (idx) => idx.hasFilePrimary(".rubocop.yml"),
    name: "RuboCop",
    evidence: ".rubocop.yml",
  },

  // PHP
  {
    detect: (idx) =>
      idx.hasFilePrimary(".php-cs-fixer.php") ||
      idx.hasFilePrimary(".php-cs-fixer.dist.php"),
    name: "PHP-CS-Fixer",
    evidence: ".php-cs-fixer.php / .php-cs-fixer.dist.php",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("phpstan.neon") ||
      idx.hasFilePrimary("phpstan.neon.dist"),
    name: "PHPStan",
    evidence: "phpstan.neon / phpstan.neon.dist",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("psalm.xml") || idx.hasFilePrimary("psalm.xml.dist"),
    name: "Psalm",
    evidence: "psalm.xml / psalm.xml.dist",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("phpcs.xml") ||
      idx.hasFilePrimary("phpcs.xml.dist") ||
      idx.hasFilePrimary(".phpcs.xml"),
    name: "PHP CodeSniffer",
    evidence: "phpcs.xml / .phpcs.xml",
  },

  // Rust
  {
    detect: (idx) =>
      idx.hasFilePrimary("clippy.toml") || idx.hasFilePrimary(".clippy.toml"),
    name: "Clippy",
    evidence: "clippy.toml / .clippy.toml",
  },

  // Shell
  {
    detect: (idx) => idx.hasFilePrimary(".shellcheckrc"),
    name: "ShellCheck",
    evidence: ".shellcheckrc",
  },

  // Elixir
  {
    detect: (idx) => idx.hasFilePrimary(".credo.exs"),
    name: "Credo",
    evidence: ".credo.exs",
  },

  // Swift
  {
    detect: (idx) =>
      idx.hasFilePrimary(".swiftlint.yml") ||
      idx.hasFilePrimary(".swiftlint.yaml"),
    name: "SwiftLint",
    evidence: ".swiftlint.yml / .swiftlint.yaml",
  },

  // .NET
  {
    detect: (idx) =>
      idx.hasFilePrimary(".globalconfig") ||
      idx.hasFilePrimary(".editorconfig"),
    name: ".NET Analyzers",
    evidence: ".globalconfig / .editorconfig (dotnet_diagnostic rules)",
    asyncValidate: async (idx) => {
      for (const f of idx.getByNamePrimary(".globalconfig")) {
        const content = await readText(f.path);
        if (content?.includes("dotnet_diagnostic")) return true;
      }
      for (const f of idx.getByNamePrimary(".editorconfig")) {
        const content = await readText(f.path);
        if (content?.includes("dotnet_diagnostic")) return true;
      }
      return false;
    },
  },

  // Markdown / YAML
  {
    detect: (idx) =>
      idx.hasFilePrimary(".markdownlint.json") ||
      idx.hasFilePrimary(".markdownlint.yaml") ||
      idx.hasFilePrimary(".markdownlint.yml") ||
      idx.hasFilePrimary(".markdownlintrc"),
    name: "markdownlint",
    evidence: ".markdownlint.json / .markdownlint.yaml / .markdownlintrc",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary(".yamllint") ||
      idx.hasFilePrimary(".yamllint.yml") ||
      idx.hasFilePrimary(".yamllint.yaml"),
    name: "yamllint",
    evidence: ".yamllint / .yamllint.yml",
  },

  // Go
  {
    detect: (idx) =>
      idx.hasFilePrimary("revive.toml") || idx.hasFilePrimary(".revive.toml"),
    name: "Revive",
    evidence: "revive.toml / .revive.toml",
  },

  // Scala
  {
    detect: (idx) => idx.hasFilePrimary(".scalafmt.conf"),
    name: "Scalafmt",
    evidence: ".scalafmt.conf",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("scalastyle-config.xml") ||
      idx.hasFilePrimary("scalastyle_config.xml"),
    name: "Scalastyle",
    evidence: "scalastyle-config.xml",
  },

  // Dart
  {
    detect: (idx) =>
      idx.hasFilePrimary("analysis_options.yaml") ||
      idx.hasFilePrimary("analysis_options.yml"),
    name: "Dart Analyzer",
    evidence: "analysis_options.yaml",
  },

  // C/C++ (additional)
  {
    detect: (idx) => idx.hasFilePrimary(".clang-tidy"),
    name: "clang-tidy",
    evidence: ".clang-tidy",
  },
  {
    detect: (idx) => idx.hasFilePrimary(".cppcheck"),
    name: "cppcheck",
    evidence: ".cppcheck",
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
