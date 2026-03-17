import type { FileIndex } from "../utils/file-index";
import { isSecondaryPath } from "../utils/file-index";
import { readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface QualityCheck {
  detect: (index: FileIndex) => boolean;
  name: string;
  evidence: string;
  /** If set, requires additional async validation after the sync check passes. */
  asyncValidate?: (index: FileIndex) => Promise<boolean>;
}

// ── Quality-gate platforms (file-presence checks) ────────────────────────────

const PLATFORM_CHECKS: readonly QualityCheck[] = [
  {
    detect: (idx) =>
      idx.hasFile("sonar-project.properties") ||
      idx.hasFile("sonarcloud.properties"),
    name: "SonarQube",
    evidence: "sonar-project.properties / sonarcloud.properties",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary(".codeclimate.yml") ||
      idx.hasFilePrimary(".codeclimate.json"),
    name: "Code Climate",
    evidence: ".codeclimate.yml / .codeclimate.json",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary(".codacy.yml") || idx.hasFilePrimary(".codacy.yaml"),
    name: "Codacy",
    evidence: ".codacy.yml / .codacy.yaml",
  },
  {
    detect: (idx) => idx.hasFilePrimary(".deepsource.toml"),
    name: "DeepSource",
    evidence: ".deepsource.toml",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary(".semgrep.yml") || idx.hasFilePrimary(".semgrep.yaml"),
    name: "Semgrep",
    evidence: ".semgrep.yml / .semgrep.yaml",
  },
  {
    detect: (idx) => idx.hasFilePrimary(".snyk"),
    name: "Snyk",
    evidence: ".snyk",
  },
  {
    detect: (idx) => idx.hasFilePrimary("checkmarx.yml"),
    name: "Checkmarx",
    evidence: "checkmarx.yml",
  },
  {
    detect: (idx) => idx.hasFilePrimary(".coveralls.yml"),
    name: "Coveralls",
    evidence: ".coveralls.yml",
  },
];

// ── Coverage threshold checks (require content validation) ───────────────────

const COVERAGE_CHECKS: readonly QualityCheck[] = [
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            !isSecondaryPath(f.relativePath) &&
            f.name.startsWith("jest.config."),
        ),
    name: "Jest Coverage Thresholds",
    evidence: "jest.config.* with coverageThreshold",
    asyncValidate: async (idx) => {
      for (const f of idx.all()) {
        if (
          !isSecondaryPath(f.relativePath) &&
          f.name.startsWith("jest.config.")
        ) {
          const content = await readText(f.path);
          if (content?.includes("coverageThreshold")) return true;
        }
      }
      return false;
    },
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary(".nycrc") || idx.hasFilePrimary(".nycrc.json"),
    name: "nyc Coverage Thresholds",
    evidence: ".nycrc / .nycrc.json with threshold config",
    asyncValidate: async (idx) => {
      const names = [".nycrc", ".nycrc.json"];
      for (const name of names) {
        for (const f of idx.getByNamePrimary(name)) {
          const content = await readText(f.path);
          if (
            content &&
            (content.includes('"branches"') ||
              content.includes('"lines"') ||
              content.includes('"statements"') ||
              content.includes('"functions"'))
          )
            return true;
        }
      }
      return false;
    },
  },
  {
    detect: (idx) => idx.hasFile("pyproject.toml") || idx.hasFile("setup.cfg"),
    name: "pytest Coverage Thresholds",
    evidence: "pyproject.toml / setup.cfg with coverage fail_under",
    asyncValidate: async (idx) => {
      for (const f of [
        ...idx.getByName("pyproject.toml"),
        ...idx.getByName("setup.cfg"),
      ]) {
        const content = await readText(f.path);
        if (
          content &&
          (content.includes("--cov-fail-under") ||
            content.includes("fail_under"))
        )
          return true;
      }
      return false;
    },
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("codecov.yml") || idx.hasFilePrimary(".codecov.yml"),
    name: "Codecov Thresholds",
    evidence: "codecov.yml / .codecov.yml with threshold/target config",
    asyncValidate: async (idx) => {
      for (const f of [
        ...idx.getByNamePrimary("codecov.yml"),
        ...idx.getByNamePrimary(".codecov.yml"),
      ]) {
        const content = await readText(f.path);
        if (
          content &&
          (content.includes("threshold") || content.includes("target"))
        )
          return true;
      }
      return false;
    },
  },
  {
    detect: (idx) => idx.hasFilePrimary(".coveragerc"),
    name: "Coverage.py Thresholds",
    evidence: ".coveragerc with fail_under",
    asyncValidate: async (idx) => {
      for (const f of idx.getByNamePrimary(".coveragerc")) {
        const content = await readText(f.path);
        if (content?.includes("fail_under")) return true;
      }
      return false;
    },
  },
];

const ALL_CHECKS: readonly QualityCheck[] = [
  ...PLATFORM_CHECKS,
  ...COVERAGE_CHECKS,
];

registerDetector({
  id: "code-quality",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const seen = new Set<string>();
    const findings: Finding[] = [];

    for (const check of ALL_CHECKS) {
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

    return {
      detectorId: "code-quality",
      findings,
      signals: { hasQualityGates: findings.length > 0 },
    };
  },
});
