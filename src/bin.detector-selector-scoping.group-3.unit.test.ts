import { afterAll, beforeAll, describe, it } from "bun:test";
import { rm } from "fs/promises";
import {
  assertDetectorSelectorScopingBatch,
  createCoreProfileFixtureRepo,
} from "./bin.unit.test.helpers";
import { DETECTOR_IDS } from "./detectors/catalog";

const DETECTOR_SCOPE_GROUP_INDEX = 2;
const detectorIds = DETECTOR_IDS.filter(
  (_, index) => index % 4 === DETECTOR_SCOPE_GROUP_INDEX,
);

describe("repo-scanner bin detector selector scoping group 3", () => {
  let repoPath = "";

  beforeAll(async () => {
    repoPath = await createCoreProfileFixtureRepo();
  });

  afterAll(async () => {
    if (repoPath.length > 0) {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("scopes detector selectors to one payload key", async () => {
    await assertDetectorSelectorScopingBatch(repoPath, detectorIds);
  });
});
