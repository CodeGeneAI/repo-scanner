import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface ContainerCheck {
  detect: (index: FileIndex) => boolean;
  name: string;
  evidence: string;
}

const CONTAINER_CHECKS: readonly ContainerCheck[] = [
  {
    detect: (idx) =>
      idx.hasFile("Dockerfile") || idx.getByExtension(".dockerfile").length > 0,
    name: "Docker",
    evidence: "Dockerfile",
  },
  {
    detect: (idx) =>
      idx.hasFilePrimary("docker-compose.yml") ||
      idx.hasFilePrimary("docker-compose.yaml") ||
      idx.hasFilePrimary("compose.yml") ||
      idx.hasFilePrimary("compose.yaml"),
    name: "Docker Compose",
    evidence: "docker-compose / compose YAML",
  },
  {
    detect: (idx) => idx.hasFile("Chart.yaml"),
    name: "Helm",
    evidence: "Chart.yaml",
  },
];

registerDetector({
  id: "containerization",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const findings: Finding[] = [];

    for (const check of CONTAINER_CHECKS) {
      if (check.detect(index)) {
        findings.push({
          value: check.name,
          confidence: 1.0,
          evidence: [check.evidence],
        });
      }
    }

    return {
      detectorId: "containerization",
      findings,
      signals: { hasContainerization: findings.length > 0 },
    };
  },
});
