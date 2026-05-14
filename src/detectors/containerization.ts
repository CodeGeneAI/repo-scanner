import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import { createFindingAdder } from "./shared";
import type { DetectorResult } from "./types";

/** Exact-filename rules: filename → tool display name. */
const CONTAINER_FILE_RULES: ReadonlyMap<string, string> = new Map([
  ["Dockerfile", "Docker"],
  ["Containerfile", "Podman"],
  ["docker-compose.yml", "Docker Compose"],
  ["docker-compose.yaml", "Docker Compose"],
  ["compose.yml", "Docker Compose"],
  ["compose.yaml", "Docker Compose"],
  [".devcontainer.json", "Dev Container"], // C1 — root-level config
  ["devcontainer.json", "Dev Container"], // C2 — covers root .devcontainer/ AND nested app .devcontainer/
]);

/** Directory rules: any primary file under prefix → tool.
 * Kept for future extensibility; currently empty because all known cases
 * are handled by CONTAINER_FILE_RULES (including devcontainer detection). */
const CONTAINER_DIR_RULES: ReadonlyMap<string, string> = new Map([]);

registerDetector({
  id: "containerization",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const { findings, addFinding } = createFindingAdder();
    for (const [fileName, tool] of CONTAINER_FILE_RULES) {
      for (const file of index.getByNamePrimary(fileName)) {
        addFinding(
          tool,
          1.0,
          `container file: ${file.relativePath}`,
          file.relativePath,
        );
      }
    }
    for (const [dir, tool] of CONTAINER_DIR_RULES) {
      const files = index.getUnderPath(dir);
      if (files.length > 0) {
        addFinding(
          tool,
          1.0,
          `container config under: ${dir}/`,
          files[0]!.relativePath,
        );
      }
    }
    return { detectorId: "containerization", findings };
  },
});
