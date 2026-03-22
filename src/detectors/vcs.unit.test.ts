import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIndex } from "../utils/file-index";
import type { VcsInfo } from "./vcs";
import "./init";
import { getDetectors } from "./registry";
import type { Detector, DetectorResult } from "./types";

function findDetector(id: string): Detector {
  const detector = getDetectors().find((d) => d.id === id);
  if (!detector) throw new Error(`Detector "${id}" not found in registry`);
  return detector;
}

describe("vcs detector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "det-vcs-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns detectorId 'vcs'", async () => {
    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    expect(result.detectorId).toBe("vcs");
  });

  it("returns no findings when no VCS directory exists", async () => {
    await writeFile(path.join(tmpDir, "index.ts"), "");
    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);
    expect(result.findings).toHaveLength(0);
    expect(result.metadata).toBeUndefined();
  });

  it("detects git from .git/ directory", async () => {
    await mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".git", "HEAD"),
      "ref: refs/heads/main\n",
    );
    await writeFile(path.join(tmpDir, ".git", "config"), "[core]\n");

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.value).toBe("Git");
    expect(result.findings[0]!.confidence).toBe(1.0);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.type).toBe("git");
    expect(vcs.currentBranch).toBe("main");
  });

  it("detects mercurial from .hg/ directory", async () => {
    await mkdir(path.join(tmpDir, ".hg"), { recursive: true });

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.findings[0]!.value).toBe("Mercurial");
    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.type).toBe("mercurial");
  });

  it("detects svn from .svn/ directory", async () => {
    await mkdir(path.join(tmpDir, ".svn"), { recursive: true });

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    expect(result.findings[0]!.value).toBe("SVN");
    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.type).toBe("svn");
  });

  it("parses origin URL from .git/config", async () => {
    await mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".git", "config"),
      `[core]
\trepositoryformatversion = 0
[remote "origin"]
\turl = https://github.com/acme/repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
\tremote = origin
`,
    );
    await writeFile(
      path.join(tmpDir, ".git", "HEAD"),
      "ref: refs/heads/main\n",
    );

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.originUrl).toBe("https://github.com/acme/repo.git");
    expect(vcs.provider).toBe("GitHub");
  });

  it("parses SSH-style origin URLs", async () => {
    await mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".git", "config"),
      `[remote "origin"]
\turl = git@github.com:acme/repo.git
`,
    );
    await writeFile(
      path.join(tmpDir, ".git", "HEAD"),
      "ref: refs/heads/main\n",
    );

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.originUrl).toBe("git@github.com:acme/repo.git");
    expect(vcs.provider).toBe("GitHub");
  });

  it("sanitizes credentials from origin URL", async () => {
    await mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".git", "config"),
      `[remote "origin"]
\turl = https://user:token@github.com/acme/repo.git
`,
    );
    await writeFile(
      path.join(tmpDir, ".git", "HEAD"),
      "ref: refs/heads/main\n",
    );

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.originUrl).not.toContain("user");
    expect(vcs.originUrl).not.toContain("token");
    expect(vcs.originUrl).toContain("github.com");
  });

  it("infers GitLab provider", async () => {
    await mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".git", "config"),
      `[remote "origin"]
\turl = https://gitlab.com/acme/repo.git
`,
    );
    await writeFile(
      path.join(tmpDir, ".git", "HEAD"),
      "ref: refs/heads/main\n",
    );

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.provider).toBe("GitLab");
  });

  it("infers Bitbucket provider", async () => {
    await mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".git", "config"),
      `[remote "origin"]
\turl = https://bitbucket.org/acme/repo.git
`,
    );
    await writeFile(
      path.join(tmpDir, ".git", "HEAD"),
      "ref: refs/heads/main\n",
    );

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.provider).toBe("Bitbucket");
  });

  it("detects default branch from refs/remotes/origin/HEAD", async () => {
    await mkdir(path.join(tmpDir, ".git", "refs", "remotes", "origin"), {
      recursive: true,
    });
    await writeFile(path.join(tmpDir, ".git", "config"), "[core]\n");
    await writeFile(
      path.join(tmpDir, ".git", "HEAD"),
      "ref: refs/heads/feature/cool\n",
    );
    await writeFile(
      path.join(tmpDir, ".git", "refs", "remotes", "origin", "HEAD"),
      "ref: refs/remotes/origin/main\n",
    );

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.currentBranch).toBe("feature/cool");
    expect(vcs.defaultBranch).toBe("main");
  });

  it("lists local branches from refs/heads/", async () => {
    const headsDir = path.join(tmpDir, ".git", "refs", "heads");
    await mkdir(headsDir, { recursive: true });
    await writeFile(path.join(tmpDir, ".git", "config"), "[core]\n");
    await writeFile(
      path.join(tmpDir, ".git", "HEAD"),
      "ref: refs/heads/main\n",
    );

    // Create branch ref files
    await writeFile(path.join(headsDir, "main"), "abc123\n");
    await writeFile(path.join(headsDir, "develop"), "def456\n");
    await mkdir(path.join(headsDir, "feature"), { recursive: true });
    await writeFile(path.join(headsDir, "feature", "cool"), "789abc\n");

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.branches).toEqual(["develop", "feature/cool", "main"]);
  });

  it("falls back to current branch as default when origin/HEAD missing", async () => {
    await mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await writeFile(path.join(tmpDir, ".git", "config"), "[core]\n");
    await writeFile(
      path.join(tmpDir, ".git", "HEAD"),
      "ref: refs/heads/main\n",
    );

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.currentBranch).toBe("main");
    expect(vcs.defaultBranch).toBe("main");
  });
});
