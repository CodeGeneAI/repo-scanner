import { Database } from "bun:sqlite";
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

  it("extracts Mercurial origin and branch metadata", async () => {
    await mkdir(path.join(tmpDir, ".hg"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".hg", "hgrc"),
      `[paths]
default = https://bitbucket.org/acme/hg-repo
`,
    );
    await writeFile(path.join(tmpDir, ".hg", "branch"), "release\n");

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.type).toBe("mercurial");
    expect(vcs.originUrl).toBe("https://bitbucket.org/acme/hg-repo");
    expect(vcs.provider).toBe("Bitbucket");
    expect(vcs.currentBranch).toBe("release");
    expect(vcs.defaultBranch).toBe("release");
    expect(vcs.metadataSources?.originUrl).toBe(".hg/hgrc [paths].default");
    expect(vcs.metadataSources?.currentBranch).toBe(".hg/branch");
    expect(vcs.metadataConfidence?.originUrl).toBe(1);
    expect(vcs.metadataConfidence?.defaultBranch).toBe(0.75);
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

  it("extracts svn origin URL from legacy entries file", async () => {
    await mkdir(path.join(tmpDir, ".svn"), { recursive: true });
    await writeFile(
      path.join(tmpDir, ".svn", "entries"),
      `12
dir
1234
https://svn.example.com/repos/project/trunk
https://svn.example.com/repos/project
`,
    );

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.type).toBe("svn");
    expect(vcs.originUrl).toBe("https://svn.example.com/repos/project/trunk");
    expect(vcs.provider).toBe("svn.example.com");
    expect(vcs.metadataSources?.originUrl).toBe(".svn/entries");
    expect(vcs.metadataConfidence?.originUrl).toBe(1);
  });

  it("extracts svn origin URL from wc.db when entries is unavailable", async () => {
    await mkdir(path.join(tmpDir, ".svn"), { recursive: true });
    const dbPath = path.join(tmpDir, ".svn", "wc.db");
    const db = new Database(dbPath);
    try {
      db.run("CREATE TABLE repository (id INTEGER PRIMARY KEY, root TEXT)");
      db.run("INSERT INTO repository (id, root) VALUES (?, ?)", [
        1,
        "https://svn.example.com/repos/project",
      ]);
    } finally {
      db.close();
    }

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.type).toBe("svn");
    expect(vcs.originUrl).toBe("https://svn.example.com/repos/project");
    expect(vcs.metadataSources?.originUrl).toBe(".svn/wc.db");
    expect(vcs.metadataConfidence?.originUrl).toBe(0.95);
  });

  it("extracts svn origin URL from wc.db repositories table schema variant", async () => {
    await mkdir(path.join(tmpDir, ".svn"), { recursive: true });
    const dbPath = path.join(tmpDir, ".svn", "wc.db");
    const db = new Database(dbPath);
    try {
      db.run("CREATE TABLE repositories (id INTEGER PRIMARY KEY, root TEXT)");
      db.run("INSERT INTO repositories (id, root) VALUES (?, ?)", [
        1,
        "https://svn.example.com/repos/legacy-layout",
      ]);
    } finally {
      db.close();
    }

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.type).toBe("svn");
    expect(vcs.originUrl).toBe("https://svn.example.com/repos/legacy-layout");
    expect(vcs.metadataSources?.originUrl).toBe(".svn/wc.db");
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
    expect(vcs.metadataSources?.originUrl).toBe(".git/config");
    expect(vcs.metadataSources?.provider).toBe("derived from .git/config");
    expect(vcs.metadataConfidence?.originUrl).toBe(1);
    expect(vcs.metadataConfidence?.provider).toBe(1);
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
    expect(vcs.branchSources?.main).toContain("refs/heads");
    expect(vcs.metadataSources?.branches).toBe("refs/heads + packed-refs");
  });

  it("reads origin URL when .git is a gitdir pointer file", async () => {
    const actualGitDir = path.join(tmpDir, ".git-data");
    await mkdir(actualGitDir, { recursive: true });

    await writeFile(path.join(tmpDir, ".git"), "gitdir: .git-data\n");
    await writeFile(
      path.join(actualGitDir, "config"),
      `[remote "origin"]
	url = https://github.com/acme/pointer.git
`,
    );
    await writeFile(path.join(actualGitDir, "HEAD"), "ref: refs/heads/main\n");

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.type).toBe("git");
    expect(vcs.originUrl).toBe("https://github.com/acme/pointer.git");
    expect(vcs.provider).toBe("GitHub");
  });

  it("reads config/refs from commondir for linked worktree layouts", async () => {
    const worktreeDir = path.join(tmpDir, ".git-worktree");
    const commonDir = path.join(tmpDir, ".git-common");
    await mkdir(path.join(commonDir, "refs", "heads"), { recursive: true });
    await mkdir(path.join(commonDir, "refs", "remotes", "origin"), {
      recursive: true,
    });
    await mkdir(worktreeDir, { recursive: true });

    await writeFile(path.join(tmpDir, ".git"), "gitdir: .git-worktree\n");
    await writeFile(
      path.join(worktreeDir, "HEAD"),
      "ref: refs/heads/feature/wt\n",
    );
    await writeFile(path.join(worktreeDir, "commondir"), "../.git-common\n");

    await writeFile(
      path.join(commonDir, "config"),
      `[remote "origin"]
	url = https://github.com/acme/worktree.git
`,
    );
    await writeFile(path.join(commonDir, "refs", "heads", "main"), "abc123\n");
    await writeFile(
      path.join(commonDir, "refs", "remotes", "origin", "HEAD"),
      "ref: refs/remotes/origin/main\n",
    );

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.type).toBe("git");
    expect(vcs.originUrl).toBe("https://github.com/acme/worktree.git");
    expect(vcs.currentBranch).toBe("feature/wt");
    expect(vcs.defaultBranch).toBe("main");
    expect(vcs.branches).toContain("main");
  });

  it("includes branches that only exist in packed-refs", async () => {
    await mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await writeFile(path.join(tmpDir, ".git", "config"), "[core]\n");
    await writeFile(
      path.join(tmpDir, ".git", "HEAD"),
      "ref: refs/heads/main\n",
    );
    await writeFile(
      path.join(tmpDir, ".git", "packed-refs"),
      "# pack-refs with: peeled fully-peeled sorted\n" +
        "1111111111111111111111111111111111111111 refs/heads/release\n" +
        "2222222222222222222222222222222222222222 refs/tags/v1.0.0\n",
    );

    const detector = findDetector("vcs");
    const index = await FileIndex.build(tmpDir);
    const result: DetectorResult = await detector.detect(tmpDir, index);

    const vcs = result.metadata?.vcsInfo as VcsInfo;
    expect(vcs.branches).toContain("release");
    expect(vcs.branches).not.toContain("v1.0.0");
    expect(vcs.branchSources?.release).toContain("packed-refs");
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
