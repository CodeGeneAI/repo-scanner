import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import type { DetectorResult } from "./types";

registerDetector({
  id: "packageManager",
  async detect(_rootPath: string, _index: FileIndex): Promise<DetectorResult> {
    return {
      detectorId: "packageManager",
      findings: [],
    };
  },
});
