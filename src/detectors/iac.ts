import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface IaCCheck {
  detect: (index: FileIndex) => boolean;
  name: string;
  evidence: string;
}

const IAC_CHECKS: readonly IaCCheck[] = [
  {
    detect: (idx) => idx.getByExtension(".tf").length > 0,
    name: "Terraform",
    evidence: "*.tf files",
  },
  {
    detect: (idx) => idx.hasFile("pulumi.yaml") || idx.hasFile("Pulumi.yaml"),
    name: "Pulumi",
    evidence: "pulumi.yaml / Pulumi.yaml",
  },
  {
    detect: (idx) => idx.hasFile("cdk.json"),
    name: "AWS CDK",
    evidence: "cdk.json",
  },
  {
    detect: (idx) =>
      idx.hasFile("serverless.yml") || idx.hasFile("serverless.yaml"),
    name: "Serverless Framework",
    evidence: "serverless.yml / serverless.yaml",
  },
  {
    detect: (idx) => idx.hasFile("kustomization.yaml"),
    name: "Kustomize",
    evidence: "kustomization.yaml",
  },
  {
    detect: (idx) => idx.hasFile("ansible.cfg") || idx.hasFile("playbook.yml"),
    name: "Ansible",
    evidence: "ansible.cfg / playbook.yml",
  },
];

registerDetector({
  id: "iac",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const findings: Finding[] = [];

    for (const check of IAC_CHECKS) {
      if (check.detect(index)) {
        findings.push({
          value: check.name,
          confidence: 1.0,
          evidence: [check.evidence],
        });
      }
    }

    // Special case: AWS SAM requires reading template.yaml for SAM marker
    const templateFiles = index.getByName("template.yaml");
    for (const file of templateFiles) {
      const content = await readText(file.path);
      if (
        content &&
        (content.includes("AWS::Serverless") ||
          content.includes("Transform: AWS::Serverless"))
      ) {
        findings.push({
          value: "AWS SAM",
          confidence: 1.0,
          evidence: ["template.yaml with SAM transform marker"],
        });
        break;
      }
    }

    return {
      detectorId: "iac",
      findings,
      signals: { hasIaC: findings.length > 0 },
    };
  },
});
