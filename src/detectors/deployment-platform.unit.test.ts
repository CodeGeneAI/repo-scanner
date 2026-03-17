import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIndex } from "../utils/file-index";
import "./init";
import { getDetectors } from "./registry";
import type { Detector, DetectorResult } from "./types";

function findDetector(id: string): Detector {
  const detector = getDetectors().find((d) => d.id === id);
  if (!detector) throw new Error(`Detector "${id}" not found in registry`);
  return detector;
}

describe("deployment-platform detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-deploy-platform-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function run(): Promise<{
    values: string[];
    result: DetectorResult;
  }> {
    const detector = findDetector("deployment-platform");
    const index = await FileIndex.build(tmpDir);
    const result = await detector.detect(tmpDir, index);
    return { values: result.findings.map((f) => f.value), result };
  }

  // ── Platforms migrated from containerization ──

  it("detects Vercel from vercel.json", async () => {
    await writeFile(path.join(tmpDir, "vercel.json"), "{}");
    const { values } = await run();
    expect(values).toContain("Vercel");
  });

  it("detects Netlify from netlify.toml", async () => {
    await writeFile(path.join(tmpDir, "netlify.toml"), "[build]");
    const { values } = await run();
    expect(values).toContain("Netlify");
  });

  it("detects Heroku from Procfile", async () => {
    await writeFile(path.join(tmpDir, "Procfile"), "web: node server.js");
    const { values } = await run();
    expect(values).toContain("Heroku");
  });

  it("detects Fly.io from fly.toml", async () => {
    await writeFile(path.join(tmpDir, "fly.toml"), 'app = "my-app"');
    const { values } = await run();
    expect(values).toContain("Fly.io");
  });

  it("detects Render from render.yaml", async () => {
    await writeFile(path.join(tmpDir, "render.yaml"), "services: []");
    const { values } = await run();
    expect(values).toContain("Render");
  });

  it("detects Railway from railway.toml", async () => {
    await writeFile(path.join(tmpDir, "railway.toml"), "[deploy]");
    const { values } = await run();
    expect(values).toContain("Railway");
  });

  it("detects Railway from railway.json", async () => {
    await writeFile(path.join(tmpDir, "railway.json"), "{}");
    const { values } = await run();
    expect(values).toContain("Railway");
  });

  // ── New platforms ──

  it("detects Cloudflare from wrangler.toml", async () => {
    await writeFile(path.join(tmpDir, "wrangler.toml"), 'name = "my-worker"');
    const { values } = await run();
    expect(values).toContain("Cloudflare");
  });

  it("detects Cloudflare from wrangler.json", async () => {
    await writeFile(path.join(tmpDir, "wrangler.json"), "{}");
    const { values } = await run();
    expect(values).toContain("Cloudflare");
  });

  it("detects Firebase from firebase.json", async () => {
    await writeFile(path.join(tmpDir, "firebase.json"), "{}");
    const { values } = await run();
    expect(values).toContain("Firebase");
  });

  it("detects Firebase from .firebaserc", async () => {
    await writeFile(path.join(tmpDir, ".firebaserc"), '{"projects":{}}');
    const { values } = await run();
    expect(values).toContain("Firebase");
  });

  it("detects Supabase from supabase/config.toml", async () => {
    await mkdir(path.join(tmpDir, "supabase"), { recursive: true });
    await writeFile(
      path.join(tmpDir, "supabase", "config.toml"),
      "[api]\nport = 54321",
    );
    const { values } = await run();
    expect(values).toContain("Supabase");
  });

  it("does NOT detect Supabase from supabase/ without config.toml", async () => {
    await mkdir(path.join(tmpDir, "supabase"), { recursive: true });
    await writeFile(path.join(tmpDir, "supabase", "seed.sql"), "");
    const { values } = await run();
    expect(values).not.toContain("Supabase");
  });

  it("detects AWS Amplify from amplify.yml", async () => {
    await writeFile(path.join(tmpDir, "amplify.yml"), "version: 1");
    const { values } = await run();
    expect(values).toContain("AWS Amplify");
  });

  it("detects AWS Elastic Beanstalk from .ebextensions/", async () => {
    await mkdir(path.join(tmpDir, ".ebextensions"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".ebextensions", "01.config"),
      "option_settings: []",
    );
    const { values } = await run();
    expect(values).toContain("AWS Elastic Beanstalk");
  });

  it("detects AWS CodeDeploy from appspec.yml", async () => {
    await writeFile(path.join(tmpDir, "appspec.yml"), "version: 0.0");
    const { values } = await run();
    expect(values).toContain("AWS CodeDeploy");
  });

  it("detects Google App Engine from app.yaml with runtime:", async () => {
    await writeFile(
      path.join(tmpDir, "app.yaml"),
      "runtime: python39\nentrypoint: gunicorn",
    );
    const { values } = await run();
    expect(values).toContain("Google App Engine");
  });

  it("does NOT detect Google App Engine from app.yaml without runtime:", async () => {
    await writeFile(path.join(tmpDir, "app.yaml"), "name: my-app");
    const { values } = await run();
    expect(values).not.toContain("Google App Engine");
  });

  it("detects Google Cloud Build from cloudbuild.yaml", async () => {
    await writeFile(path.join(tmpDir, "cloudbuild.yaml"), "steps: []");
    const { values } = await run();
    expect(values).toContain("Google Cloud Build");
  });

  it("detects Azure Static Web Apps from staticwebapp.config.json", async () => {
    await writeFile(
      path.join(tmpDir, "staticwebapp.config.json"),
      '{"routes":[]}',
    );
    const { values } = await run();
    expect(values).toContain("Azure Static Web Apps");
  });

  it("detects Azure Functions from host.json with extensionBundle", async () => {
    await writeFile(
      path.join(tmpDir, "host.json"),
      '{"extensionBundle":{"id":"Microsoft.Azure.Functions.ExtensionBundle"}}',
    );
    const { values } = await run();
    expect(values).toContain("Azure Functions");
  });

  it("does NOT detect Azure Functions from host.json without extensionBundle", async () => {
    await writeFile(path.join(tmpDir, "host.json"), '{"version":"2.0"}');
    const { values } = await run();
    expect(values).not.toContain("Azure Functions");
  });

  it("detects DigitalOcean App Platform from .do/app.yaml", async () => {
    await mkdir(path.join(tmpDir, ".do"), { recursive: true });
    await writeFile(path.join(tmpDir, ".do", "app.yaml"), "name: my-app");
    const { values } = await run();
    expect(values).toContain("DigitalOcean App Platform");
  });

  it("does NOT detect DigitalOcean from .do/ without app.yaml", async () => {
    await mkdir(path.join(tmpDir, ".do"), { recursive: true });
    await writeFile(path.join(tmpDir, ".do", "other.txt"), "");
    const { values } = await run();
    expect(values).not.toContain("DigitalOcean App Platform");
  });

  it("detects Deno Deploy from deno.json with deploy key", async () => {
    await writeFile(
      path.join(tmpDir, "deno.json"),
      '{"deploy":{"project":"my-project"}}',
    );
    const { values } = await run();
    expect(values).toContain("Deno Deploy");
  });

  it("does NOT detect Deno Deploy from deno.json without deploy key", async () => {
    await writeFile(path.join(tmpDir, "deno.json"), '{"compilerOptions":{}}');
    const { values } = await run();
    expect(values).not.toContain("Deno Deploy");
  });

  it("detects Coolify from coolify.yaml", async () => {
    await writeFile(path.join(tmpDir, "coolify.yaml"), "services: []");
    const { values } = await run();
    expect(values).toContain("Coolify");
  });

  it("detects Dokku from .buildpacks", async () => {
    await writeFile(
      path.join(tmpDir, ".buildpacks"),
      "https://github.com/heroku/heroku-buildpack-nodejs",
    );
    const { values } = await run();
    expect(values).toContain("Dokku");
  });

  it("detects SST from sst.config.ts", async () => {
    await writeFile(
      path.join(tmpDir, "sst.config.ts"),
      'export default { app: "my-app" };',
    );
    const { values } = await run();
    expect(values).toContain("SST");
  });

  it("detects Northflank from northflank.json", async () => {
    await writeFile(path.join(tmpDir, "northflank.json"), "{}");
    const { values } = await run();
    expect(values).toContain("Northflank");
  });

  // ── Signals ──

  it("sets hasDeploymentPlatform signal to true when platforms detected", async () => {
    await writeFile(path.join(tmpDir, "vercel.json"), "{}");
    const { result } = await run();
    expect(result.signals?.hasDeploymentPlatform).toBe(true);
  });

  it("sets hasDeploymentPlatform signal to false when no platforms detected", async () => {
    await writeFile(path.join(tmpDir, "index.ts"), "");
    const { result } = await run();
    expect(result.signals?.hasDeploymentPlatform).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  // ── Multiple platforms ──

  it("detects multiple platforms simultaneously", async () => {
    await writeFile(path.join(tmpDir, "vercel.json"), "{}");
    await writeFile(path.join(tmpDir, "netlify.toml"), "[build]");
    await writeFile(path.join(tmpDir, "wrangler.toml"), 'name = "worker"');

    const { values, result } = await run();
    expect(values).toContain("Vercel");
    expect(values).toContain("Netlify");
    expect(values).toContain("Cloudflare");
    expect(result.findings).toHaveLength(3);
  });

  // ── Basics ──

  it("returns detectorId 'deployment-platform'", async () => {
    await writeFile(path.join(tmpDir, "index.ts"), "");
    const { result } = await run();
    expect(result.detectorId).toBe("deployment-platform");
  });
});
