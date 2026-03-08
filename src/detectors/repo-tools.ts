import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface RepoToolCheck {
  detect: (index: FileIndex) => boolean;
  name: string;
  evidence: string;
}

const REPO_TOOL_CHECKS: readonly RepoToolCheck[] = [
  {
    detect: (idx) => idx.getUnderPath(".husky").length > 0,
    name: "Husky",
    evidence: ".husky/ directory",
  },
  {
    detect: (idx) => idx.getUnderPath(".changeset").length > 0,
    name: "Changesets",
    evidence: ".changeset/ directory",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("renovate.json") ||
      idx.hasFilePrimary("renovate.json5"),
    name: "Renovate",
    evidence: "renovate.json / renovate.json5",
  },
  {
    detect: (idx) =>
      idx
        .getByName("dependabot.yml")
        .some((f) => f.relativePath.startsWith(".github/")),
    name: "Dependabot",
    evidence: ".github/dependabot.yml",
  },
  {
    detect: (idx) => idx.hasFilePrimary("CODEOWNERS"),
    name: "CODEOWNERS",
    evidence: "CODEOWNERS",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("LICENSE") ||
      idx.hasFilePrimary("LICENSE.md") ||
      idx.hasFilePrimary("LICENSE.txt"),
    name: "License",
    evidence: "LICENSE / LICENSE.md / LICENSE.txt",
  },
  {
    detect: (idx) => idx.hasFilePrimary(".nvmrc"),
    name: "nvm",
    evidence: ".nvmrc",
  },
  {
    detect: (idx) => idx.hasFilePrimary(".tool-versions"),
    name: "asdf",
    evidence: ".tool-versions",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("AGENTS.md") || idx.hasFilePrimary("CLAUDE.md"),
    name: "AI Agent Config",
    evidence: "AGENTS.md / CLAUDE.md",
  },
  {
    detect: (idx) => idx.getUnderPath(".vscode").length > 0,
    name: "VS Code Config",
    evidence: ".vscode/ directory",
  },
  {
    detect: (idx) => idx.getUnderPath(".idea").length > 0,
    name: "IntelliJ Config",
    evidence: ".idea/ directory",
  },
  {
    detect: (idx) => idx.hasFilePrimary("lefthook.yml"),
    name: "Lefthook",
    evidence: "lefthook.yml",
  },
  {
    detect: (idx) => idx.hasFilePrimary(".pre-commit-config.yaml"),
    name: "pre-commit",
    evidence: ".pre-commit-config.yaml",
  },
  {
    detect: (idx) => idx.hasFilePrimary("tox.ini"),
    name: "tox",
    evidence: "tox.ini",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("codecov.yml") || idx.hasFilePrimary(".codecov.yml"),
    name: "Codecov",
    evidence: "codecov.yml / .codecov.yml",
  },
  {
    detect: (idx) => idx.hasFilePrimary("mkdocs.yml"),
    name: "MkDocs",
    evidence: "mkdocs.yml",
  },
  {
    detect: (idx) => idx.hasFilePrimary("lerna.json"),
    name: "Lerna",
    evidence: "lerna.json",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("lint-staged.config.js") ||
      idx.hasFilePrimary("lint-staged.config.mjs") ||
      idx.hasFilePrimary(".lintstagedrc"),
    name: "lint-staged",
    evidence: "lint-staged config",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary(".goreleaser.yml") ||
      idx.hasFilePrimary(".goreleaser.yaml"),
    name: "GoReleaser",
    evidence: ".goreleaser.yml / .goreleaser.yaml",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("shell.nix") || idx.hasFilePrimary("flake.nix"),
    name: "Nix",
    evidence: "shell.nix / flake.nix",
  },
];

registerDetector({
  id: "repo-tools",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const findings: Finding[] = [];

    for (const check of REPO_TOOL_CHECKS) {
      if (check.detect(index)) {
        findings.push({
          value: check.name,
          confidence: 1.0,
          evidence: [check.evidence],
        });
      }
    }

    const hasReadme =
      index.hasFile("README.md") ||
      index.hasFile("README") ||
      index.hasFile("README.rst") ||
      index.hasFile("README.txt");
    const hasTypedContracts =
      index.getByExtensionPrimary(".proto").length > 0 ||
      index.getByExtensionPrimary(".graphql").length > 0 ||
      index.getByExtensionPrimary(".gql").length > 0 ||
      index.hasFilePrimary("openapi.json") ||
      index.hasFilePrimary("openapi.yaml") ||
      index.hasFilePrimary("openapi.yml") ||
      index.hasFilePrimary("swagger.json") ||
      index.hasFilePrimary("swagger.yaml");

    return {
      detectorId: "repo-tools",
      findings,
      signals: {
        ...(hasReadme ? { hasReadme: true } : {}),
        ...(hasTypedContracts ? { hasTypedContracts: true } : {}),
      },
    };
  },
});
