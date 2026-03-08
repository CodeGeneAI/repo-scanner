import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface CiCheck {
  detect: (index: FileIndex) => boolean;
  name: string;
  evidence: string;
}

const CI_CHECKS: readonly CiCheck[] = [
  {
    detect: (idx) =>
      idx
        .getUnderPath(".github/workflows")
        .some((f) => f.ext === ".yml" || f.ext === ".yaml"),
    name: "GitHub Actions",
    evidence: ".github/workflows/ YAML files",
  },
  {
    detect: (idx) => idx.hasFile(".gitlab-ci.yml"),
    name: "GitLab CI",
    evidence: ".gitlab-ci.yml",
  },
  {
    detect: (idx) => idx.hasFile("Jenkinsfile"),
    name: "Jenkins",
    evidence: "Jenkinsfile",
  },
  {
    detect: (idx) =>
      idx
        .getByName("config.yml")
        .some((f) => f.relativePath.startsWith(".circleci/")),
    name: "CircleCI",
    evidence: ".circleci/config.yml",
  },
  {
    detect: (idx) => idx.hasFile(".travis.yml"),
    name: "Travis CI",
    evidence: ".travis.yml",
  },
  {
    detect: (idx) =>
      idx.hasFile("azure-pipelines.yml") ||
      idx
        .getUnderPath(".azure/pipelines")
        .some((f) => f.ext === ".yml" || f.ext === ".yaml"),
    name: "Azure DevOps",
    evidence: "azure-pipelines.yml / .azure/pipelines/",
  },
  {
    detect: (idx) => idx.hasFile("bitbucket-pipelines.yml"),
    name: "Bitbucket Pipelines",
    evidence: "bitbucket-pipelines.yml",
  },
  {
    detect: (idx) => idx.getUnderPath(".buildkite").length > 0,
    name: "Buildkite",
    evidence: ".buildkite/ directory",
  },
  {
    detect: (idx) => idx.hasFile(".drone.yml"),
    name: "Drone",
    evidence: ".drone.yml",
  },
];

registerDetector({
  id: "ci",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const findings: Finding[] = [];

    for (const check of CI_CHECKS) {
      if (check.detect(index)) {
        findings.push({
          value: check.name,
          confidence: 1.0,
          evidence: [check.evidence],
        });
      }
    }

    return {
      detectorId: "ci",
      findings,
      signals: { hasCi: findings.length > 0 },
    };
  },
});
