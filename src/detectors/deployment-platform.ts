import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface DeploymentCheck {
  detect: (index: FileIndex) => boolean;
  name: string;
  evidence: string;
  /** If set, requires additional async validation after sync detect passes. */
  asyncValidate?: (index: FileIndex) => Promise<boolean>;
}

const DEPLOYMENT_CHECKS: readonly DeploymentCheck[] = [
  // — Platforms migrated from containerization detector —
  {
    detect: (idx) => idx.hasFile("vercel.json"),
    name: "Vercel",
    evidence: "vercel.json",
  },
  {
    detect: (idx) => idx.hasFile("netlify.toml"),
    name: "Netlify",
    evidence: "netlify.toml",
  },
  {
    detect: (idx) => idx.hasFilePrimary("Procfile"),
    name: "Heroku",
    evidence: "Procfile",
  },
  {
    detect: (idx) => idx.hasFile("fly.toml"),
    name: "Fly.io",
    evidence: "fly.toml",
  },
  {
    detect: (idx) => idx.hasFile("render.yaml"),
    name: "Render",
    evidence: "render.yaml",
  },
  {
    detect: (idx) => idx.hasFile("railway.toml") || idx.hasFile("railway.json"),
    name: "Railway",
    evidence: "railway.toml / railway.json",
  },

  // — New platforms —
  {
    detect: (idx) =>
      idx.hasFile("wrangler.toml") ||
      idx.hasFile("wrangler.json") ||
      idx.hasFile("wrangler.jsonc"),
    name: "Cloudflare",
    evidence: "wrangler.toml / wrangler.json / wrangler.jsonc",
  },
  {
    detect: (idx) => idx.hasFile("firebase.json") || idx.hasFile(".firebaserc"),
    name: "Firebase",
    evidence: "firebase.json / .firebaserc",
  },
  {
    detect: (idx) => idx.getUnderPath("supabase").length > 0,
    name: "Supabase",
    evidence: "supabase/",
    asyncValidate: async (idx) => {
      for (const f of idx.getUnderPath("supabase")) {
        if (f.name === "config.toml") return true;
      }
      return false;
    },
  },
  {
    detect: (idx) =>
      idx.hasFile("amplify.yml") || idx.getUnderPath("amplify").length > 0,
    name: "AWS Amplify",
    evidence: "amplify.yml / amplify/",
  },
  {
    detect: (idx) =>
      idx.getUnderPath(".ebextensions").length > 0 ||
      idx.hasFile("Dockerrun.aws.json"),
    name: "AWS Elastic Beanstalk",
    evidence: ".ebextensions/ / Dockerrun.aws.json",
  },
  {
    detect: (idx) => idx.hasFile("appspec.yml") || idx.hasFile("appspec.yaml"),
    name: "AWS CodeDeploy",
    evidence: "appspec.yml / appspec.yaml",
  },
  {
    detect: (idx) => idx.hasFile("app.yaml") || idx.hasFile("app.yml"),
    name: "Google App Engine",
    evidence: "app.yaml (with runtime:)",
    asyncValidate: async (idx) => {
      for (const f of [
        ...idx.getByName("app.yaml"),
        ...idx.getByName("app.yml"),
      ]) {
        const content = await readText(f.path);
        if (content?.includes("runtime:")) return true;
      }
      return false;
    },
  },
  {
    detect: (idx) =>
      idx.hasFile("cloudbuild.yaml") || idx.hasFile("cloudbuild.yml"),
    name: "Google Cloud Build",
    evidence: "cloudbuild.yaml / cloudbuild.yml",
  },
  {
    detect: (idx) => idx.hasFile("staticwebapp.config.json"),
    name: "Azure Static Web Apps",
    evidence: "staticwebapp.config.json",
  },
  {
    detect: (idx) => idx.hasFile("host.json"),
    name: "Azure Functions",
    evidence: "host.json (with extensionBundle)",
    asyncValidate: async (idx) => {
      for (const f of idx.getByName("host.json")) {
        const content = await readText(f.path);
        if (content?.includes("extensionBundle")) return true;
      }
      return false;
    },
  },
  {
    detect: (idx) => idx.getUnderPath(".do").length > 0,
    name: "DigitalOcean App Platform",
    evidence: ".do/app.yaml",
    asyncValidate: async (idx) => {
      for (const f of idx.getUnderPath(".do")) {
        if (f.name === "app.yaml" || f.name === "app.yml") return true;
      }
      return false;
    },
  },
  {
    detect: (idx) => idx.hasFile("deno.json") || idx.hasFile("deno.jsonc"),
    name: "Deno Deploy",
    evidence: "deno.json (with deploy config)",
    asyncValidate: async (idx) => {
      for (const f of [
        ...idx.getByName("deno.json"),
        ...idx.getByName("deno.jsonc"),
      ]) {
        const content = await readText(f.path);
        if (content?.includes('"deploy"')) return true;
      }
      return false;
    },
  },
  {
    detect: (idx) => idx.hasFile("coolify.yaml"),
    name: "Coolify",
    evidence: "coolify.yaml",
  },
  {
    detect: (idx) => idx.hasFile(".buildpacks") || idx.hasFile("DOKKU_SCALE"),
    name: "Dokku",
    evidence: ".buildpacks / DOKKU_SCALE",
  },
  {
    detect: (idx) =>
      idx.hasFile("sst.config.ts") || idx.hasFile("sst.config.js"),
    name: "SST",
    evidence: "sst.config.ts / sst.config.js",
  },
  {
    detect: (idx) => idx.hasFile("northflank.json"),
    name: "Northflank",
    evidence: "northflank.json",
  },
];

registerDetector({
  id: "deployment-platform",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const seen = new Set<string>();
    const findings: Finding[] = [];

    for (const check of DEPLOYMENT_CHECKS) {
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
      detectorId: "deployment-platform",
      findings,
      signals: { hasDeploymentPlatform: findings.length > 0 },
    };
  },
});
