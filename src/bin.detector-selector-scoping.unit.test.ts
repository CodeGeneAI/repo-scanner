import { afterAll, beforeAll, describe, it } from "bun:test";
import { rm } from "fs/promises";
import {
  assertDetectorSelectorScoping,
  createCoreProfileFixtureRepo,
} from "./bin.unit.test.helpers";
import { DETECTOR_IDS } from "./detectors/catalog";

describe("repo-scanner bin detector selector scoping", () => {
  let repoPath = "";

  beforeAll(async () => {
    repoPath = await createCoreProfileFixtureRepo();
  });

  afterAll(async () => {
    if (repoPath.length > 0) {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  for (const detectorId of DETECTOR_IDS) {
    it(`scopes selector for ${detectorId} to one payload key`, () => {
      assertDetectorSelectorScoping(repoPath, detectorId);
    });
  }
});
