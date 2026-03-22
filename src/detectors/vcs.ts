import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

export interface VcsInfo {
  readonly type: string;
  readonly provider?: string;
  readonly originUrl?: string;
  readonly defaultBranch?: string;
  readonly currentBranch?: string;
  readonly branches?: readonly string[];
}

/** Strip userinfo (credentials) from a URL. */
const sanitizeUrl = (url: string): string => {
  // Handle SSH-style URLs like git@github.com:user/repo.git
  if (url.includes("@") && !url.includes("://")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
};

/** Extract the origin URL from a .git/config file. */
const parseOriginUrl = (gitConfig: string): string | undefined => {
  const lines = gitConfig.split("\n");
  let inOrigin = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '[remote "origin"]') {
      inOrigin = true;
      continue;
    }
    if (inOrigin) {
      if (trimmed.startsWith("[")) break; // next section
      const match = trimmed.match(/^url\s*=\s*(.+)$/);
      if (match) return match[1].trim();
    }
  }
  return undefined;
};

/** Infer VCS provider name from the origin URL hostname. */
const inferProvider = (originUrl: string): string | undefined => {
  let hostname: string;

  // Handle SSH-style URLs: git@github.com:user/repo.git
  if (originUrl.includes("@") && !originUrl.includes("://")) {
    const atIndex = originUrl.indexOf("@");
    const colonIndex = originUrl.indexOf(":", atIndex);
    hostname = originUrl.slice(atIndex + 1, colonIndex).toLowerCase();
  } else {
    try {
      hostname = new URL(originUrl).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }

  if (hostname.includes("github")) return "GitHub";
  if (hostname.includes("gitlab")) return "GitLab";
  if (hostname.includes("bitbucket")) return "Bitbucket";
  if (hostname.includes("dev.azure.com") || hostname.includes("visualstudio"))
    return "Azure DevOps";
  if (hostname.includes("codecommit")) return "AWS CodeCommit";

  return hostname;
};

/** Parse current branch from .git/HEAD content. */
const parseCurrentBranch = (headContent: string): string | undefined => {
  const trimmed = headContent.trim();
  const prefix = "ref: refs/heads/";
  if (trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length);
  }
  // Detached HEAD — return undefined
  return undefined;
};

/** List local branch names from .git/refs/heads/. */
const listBranches = (gitDir: string): string[] => {
  const headsDir = path.join(gitDir, "refs", "heads");
  try {
    return collectBranches(headsDir, "");
  } catch {
    return [];
  }
};

const collectBranches = (dir: string, prefix: string): string[] => {
  const branches: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir, { encoding: "utf-8" });
  } catch {
    return branches;
  }
  for (const entryName of entries) {
    const fullPath = path.join(dir, entryName);
    const name = prefix ? `${prefix}/${entryName}` : entryName;
    try {
      if (statSync(fullPath).isDirectory()) {
        branches.push(...collectBranches(fullPath, name));
      } else {
        branches.push(name);
      }
    } catch {
      branches.push(name);
    }
  }
  return branches.sort();
};

registerDetector({
  id: "vcs",
  async detect(rootPath: string, _index: FileIndex): Promise<DetectorResult> {
    const findings: Finding[] = [];
    let vcsInfo: VcsInfo | undefined;

    const gitDir = path.join(rootPath, ".git");
    const hgDir = path.join(rootPath, ".hg");
    const svnDir = path.join(rootPath, ".svn");

    if (existsSync(gitDir)) {
      findings.push({
        value: "Git",
        confidence: 1.0,
        evidence: [".git/ directory"],
      });

      const info: {
        type: string;
        provider?: string;
        originUrl?: string;
        defaultBranch?: string;
        currentBranch?: string;
        branches?: string[];
      } = { type: "git" };

      // Parse origin URL
      const configContent = await readText(path.join(gitDir, "config"));
      if (configContent) {
        const rawUrl = parseOriginUrl(configContent);
        if (rawUrl) {
          info.originUrl = sanitizeUrl(rawUrl);
          info.provider = inferProvider(rawUrl);
        }
      }

      // Parse current branch from HEAD
      const headContent = await readText(path.join(gitDir, "HEAD"));
      if (headContent) {
        info.currentBranch = parseCurrentBranch(headContent);
      }

      // Parse default branch from remote HEAD symref
      const remoteHead = await readText(
        path.join(gitDir, "refs", "remotes", "origin", "HEAD"),
      );
      if (remoteHead) {
        const prefix = "ref: refs/remotes/origin/";
        const trimmed = remoteHead.trim();
        if (trimmed.startsWith(prefix)) {
          info.defaultBranch = trimmed.slice(prefix.length);
        }
      }

      // List local branches
      const branches = listBranches(gitDir);
      if (branches.length > 0) {
        info.branches = branches;
      }

      // Fall back: if no default branch detected, use current branch
      if (!info.defaultBranch && info.currentBranch) {
        info.defaultBranch = info.currentBranch;
      }

      vcsInfo = info;
    } else if (existsSync(hgDir)) {
      findings.push({
        value: "Mercurial",
        confidence: 1.0,
        evidence: [".hg/ directory"],
      });
      vcsInfo = { type: "mercurial" };
    } else if (existsSync(svnDir)) {
      findings.push({
        value: "SVN",
        confidence: 1.0,
        evidence: [".svn/ directory"],
      });
      vcsInfo = { type: "svn" };
    }

    return {
      detectorId: "vcs",
      findings,
      metadata: vcsInfo ? { vcsInfo } : undefined,
    };
  },
});
