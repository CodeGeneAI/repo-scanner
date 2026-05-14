import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import { createFindingAdder } from "./shared";
import type { DetectorResult } from "./types";

/** Exact-filename rules: filename → provider display name. */
const CI_FILE_RULES: ReadonlyMap<string, string> = new Map([
  [".gitlab-ci.yml", "GitLab CI"],
  [".travis.yml", "Travis CI"],
  ["Jenkinsfile", "Jenkins"],
  ["azure-pipelines.yml", "Azure Pipelines"],
  ["bitbucket-pipelines.yml", "Bitbucket Pipelines"],
  ["appveyor.yml", "AppVeyor"],
  [".appveyor.yml", "AppVeyor"],
  [".drone.yml", "Drone CI"],
  ["cloudbuild.yaml", "Google Cloud Build"],
  ["cloudbuild.yml", "Google Cloud Build"],
  ["codemagic.yaml", "Codemagic"],
  ["bitrise.yml", "Bitrise"],
]);

/** Directory rules: any primary file under the prefix → provider. */
const CI_DIR_RULES: ReadonlyMap<string, string> = new Map([
  [".github/workflows", "GitHub Actions"],
  [".buildkite", "Buildkite"],
  [".teamcity", "TeamCity"],
  [".semaphore", "Semaphore"],
  [".circleci", "CircleCI"],
]);

registerDetector({
  id: "ciProvider",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const { findings, addFinding } = createFindingAdder();

    for (const [fileName, provider] of CI_FILE_RULES) {
      for (const file of index.getByNamePrimary(fileName)) {
        addFinding(
          provider,
          1.0,
          `config file: ${file.relativePath}`,
          file.relativePath,
        );
      }
    }

    for (const [dir, provider] of CI_DIR_RULES) {
      const files = index.getUnderPath(dir);
      if (files.length > 0) {
        addFinding(
          provider,
          1.0,
          `config under: ${dir}/`,
          files[0]!.relativePath,
        );
      }
    }

    return { detectorId: "ciProvider", findings };
  },
});
