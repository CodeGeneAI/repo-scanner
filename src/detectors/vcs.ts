import { Database } from "bun:sqlite";
import { execFile } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { promisify } from "util";
import type { FileIndex } from "../utils/file-index";
import { readText } from "../utils/fs";
import { parseIniSections } from "../utils/ini";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

export interface VcsInfo {
  readonly type: string;
  readonly provider?: string;
  readonly originUrl?: string;
  readonly defaultBranch?: string;
  readonly currentBranch?: string;
  readonly branches?: readonly string[];
  readonly metadataSources?: Partial<
    Record<
      "originUrl" | "provider" | "currentBranch" | "defaultBranch" | "branches",
      string
    >
  >;
  readonly metadataConfidence?: Partial<
    Record<
      "originUrl" | "provider" | "currentBranch" | "defaultBranch" | "branches",
      number
    >
  >;
  readonly branchSources?: Record<string, readonly string[]>;
}

interface GitLayoutPaths {
  readonly gitDir: string;
  readonly commonDir: string;
}

const execFileAsync = promisify(execFile);

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
  const parsed = parseIniSections(gitConfig);
  return parsed['remote "origin"']?.url;
};

/** Extract default Mercurial remote URL from .hg/hgrc. */
const parseHgDefaultPath = (hgrc: string): string | undefined => {
  const parsed = parseIniSections(hgrc);
  return parsed.paths?.default;
};

/** Extract Subversion repository URL from legacy .svn/entries text format. */
const parseSvnEntriesUrl = (entriesContent: string): string | undefined => {
  const urlMatch = entriesContent.match(
    /(https?:\/\/[^\s]+|svn\+ssh:\/\/[^\s]+)/,
  );
  return urlMatch ? urlMatch[1] : undefined;
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

const resolveGitLayoutPaths = async (
  rootPath: string,
): Promise<GitLayoutPaths | undefined> => {
  const gitPath = path.join(rootPath, ".git");

  if (!existsSync(gitPath)) {
    return undefined;
  }

  let gitDir = gitPath;
  try {
    if (!statSync(gitPath).isDirectory()) {
      const gitFileContent = await readText(gitPath);
      const rawGitDir = parseGitDirPointer(gitFileContent);
      if (!rawGitDir) {
        return undefined;
      }
      gitDir = path.resolve(rootPath, rawGitDir);
    }
  } catch {
    return undefined;
  }

  const commonDir = await resolveCommonDir(gitDir);
  return { gitDir, commonDir };
};

const parseGitDirPointer = (gitFileContent?: string): string | undefined => {
  if (!gitFileContent) {
    return undefined;
  }

  const match = gitFileContent.trim().match(/^gitdir:\s*(.+)$/i);
  return match ? match[1].trim() : undefined;
};

const resolveCommonDir = async (gitDir: string): Promise<string> => {
  const commonDirPointer = await readText(path.join(gitDir, "commondir"));
  if (!commonDirPointer) {
    return gitDir;
  }

  return path.resolve(gitDir, commonDirPointer.trim());
};

/** List local branch names from .git/refs/heads/. */
const listBranches = async (
  commonDir: string,
): Promise<BranchCollectionResult> => {
  const looseBranches = collectLooseBranches(
    path.join(commonDir, "refs", "heads"),
  );
  const packedBranches = await collectPackedBranches(commonDir);

  if (looseBranches.length === 0 && packedBranches.length === 0) {
    return {
      names: [],
      sourcesByBranch: {},
    };
  }

  const sourcesByBranch: Record<string, readonly string[]> = {};
  for (const branch of looseBranches) {
    sourcesByBranch[branch] = [
      ...(sourcesByBranch[branch] ?? []),
      "refs/heads",
    ];
  }
  for (const branch of packedBranches) {
    sourcesByBranch[branch] = [
      ...(sourcesByBranch[branch] ?? []),
      "packed-refs",
    ];
  }

  const names = [...new Set([...looseBranches, ...packedBranches])].sort();
  return {
    names,
    sourcesByBranch,
  };
};

const collectLooseBranches = (headsDir: string): string[] => {
  try {
    return collectBranchesRecursive(headsDir, "");
  } catch {
    return [];
  }
};

const collectBranchesRecursive = (dir: string, prefix: string): string[] => {
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
        branches.push(...collectBranchesRecursive(fullPath, name));
      } else {
        branches.push(name);
      }
    } catch {
      branches.push(name);
    }
  }
  return branches;
};

const collectPackedBranches = async (commonDir: string): Promise<string[]> => {
  const packedRefs = await readText(path.join(commonDir, "packed-refs"));
  if (!packedRefs) {
    return [];
  }

  const branches: string[] = [];
  for (const line of packedRefs.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("^")) {
      continue;
    }

    const match = trimmed.match(/^[0-9a-f]{40}\s+refs\/heads\/(.+)$/i);
    if (match) {
      branches.push(match[1]!);
    }
  }

  return branches;
};

const buildOriginMetadata = (
  rawOriginUrl: string,
  originSource: string,
): Pick<VcsInfo, "originUrl" | "provider" | "metadataSources"> => {
  const originUrl = sanitizeUrl(rawOriginUrl);
  const provider = inferProvider(rawOriginUrl);
  return {
    originUrl,
    ...(provider ? { provider } : {}),
    metadataSources: {
      originUrl: originSource,
      ...(provider ? { provider: `derived from ${originSource}` } : {}),
    },
  };
};

const mergeMetadataSources = (
  existing: VcsInfo["metadataSources"] | undefined,
  additional: VcsInfo["metadataSources"] | undefined,
): VcsInfo["metadataSources"] | undefined => {
  if (!existing && !additional) {
    return undefined;
  }
  return {
    ...(existing ?? {}),
    ...(additional ?? {}),
  };
};

const mergeMetadataConfidence = (
  existing: VcsInfo["metadataConfidence"] | undefined,
  additional: VcsInfo["metadataConfidence"] | undefined,
): VcsInfo["metadataConfidence"] | undefined => {
  if (!existing && !additional) {
    return undefined;
  }
  return {
    ...(existing ?? {}),
    ...(additional ?? {}),
  };
};

const confidenceForSource = (source: string): number => {
  switch (source) {
    case ".git/config":
    case ".git/HEAD":
    case ".git/refs/remotes/origin/HEAD":
    case ".hg/hgrc [paths].default":
    case ".hg/branch":
    case ".svn/entries":
      return 1.0;
    case ".svn/wc.db":
      return 0.95;
    case "git config --get remote.origin.url":
      return 0.9;
    case "fallback from currentBranch":
    case "derived from currentBranch":
    case "Mercurial default branch":
      return 0.75;
    default:
      return 0.8;
  }
};

const readSvnUrlFromWcDb = (wcDbPath: string): string | undefined => {
  let db: Database | undefined;
  try {
    db = new Database(wcDbPath, { readonly: true });

    const repositoryRootQueryCandidates = [
      "SELECT root FROM repository ORDER BY id ASC LIMIT 1",
      "SELECT root FROM repositories ORDER BY id ASC LIMIT 1",
      "SELECT repos_root_url AS root FROM repository ORDER BY id ASC LIMIT 1",
    ];
    for (const query of repositoryRootQueryCandidates) {
      try {
        const row = db.query(query).get() as { root?: string } | null;
        if (row?.root) {
          return row.root;
        }
      } catch {
        // Try the next schema variant.
      }
    }

    const nodeRootJoinQueryCandidates = [
      `SELECT
         CASE
           WHEN n.repos_path LIKE 'http%' THEN n.repos_path
           ELSE r.root || '/' || ltrim(n.repos_path, '/')
         END AS root
       FROM nodes n
       LEFT JOIN repository r ON r.id = n.repos_id
       WHERE n.repos_path IS NOT NULL
       LIMIT 1`,
      `SELECT
         CASE
           WHEN n.repos_path LIKE 'http%' THEN n.repos_path
           ELSE r.root || '/' || ltrim(n.repos_path, '/')
         END AS root
       FROM nodes n
       LEFT JOIN repositories r ON r.id = n.repos_id
       WHERE n.repos_path IS NOT NULL
       LIMIT 1`,
      "SELECT repos_path AS root FROM nodes WHERE repos_path IS NOT NULL LIMIT 1",
    ];
    for (const query of nodeRootJoinQueryCandidates) {
      try {
        const row = db.query(query).get() as { root?: string } | null;
        if (row?.root) {
          return row.root;
        }
      } catch {
        // Try the next schema variant.
      }
    }
  } catch {
    return undefined;
  } finally {
    db?.close();
  }
  return undefined;
};

const tryGitCommandOrigin = async (
  rootPath: string,
): Promise<string | undefined> => {
  try {
    const response = await execFileAsync(
      "git",
      ["config", "--get", "remote.origin.url"],
      {
        cwd: rootPath,
      },
    );
    const stdout = response.stdout.trim();
    return stdout || undefined;
  } catch {
    return undefined;
  }
};

registerDetector({
  id: "vcs",
  async detect(rootPath: string, _index: FileIndex): Promise<DetectorResult> {
    const findings: Finding[] = [];
    let vcsInfo: VcsInfo | undefined;

    const hgDir = path.join(rootPath, ".hg");
    const svnDir = path.join(rootPath, ".svn");

    const gitLayout = await resolveGitLayoutPaths(rootPath);
    if (gitLayout) {
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
        metadataSources?: VcsInfo["metadataSources"];
        metadataConfidence?: VcsInfo["metadataConfidence"];
        branchSources?: VcsInfo["branchSources"];
      } = { type: "git" };

      // Parse origin URL
      const configContent =
        (await readText(path.join(gitLayout.gitDir, "config"))) ??
        (await readText(path.join(gitLayout.commonDir, "config")));
      if (configContent) {
        const rawUrl = parseOriginUrl(configContent);
        if (rawUrl) {
          const metadata = buildOriginMetadata(rawUrl, ".git/config");
          info.originUrl = metadata.originUrl;
          info.provider = metadata.provider;
          info.metadataSources = mergeMetadataSources(
            info.metadataSources,
            metadata.metadataSources,
          );
          info.metadataConfidence = mergeMetadataConfidence(
            info.metadataConfidence,
            {
              originUrl: confidenceForSource(".git/config"),
              provider: confidenceForSource(".git/config"),
            },
          );
        }
      }

      if (!info.originUrl) {
        const gitCommandOriginUrl = await tryGitCommandOrigin(rootPath);
        if (gitCommandOriginUrl) {
          const metadata = buildOriginMetadata(
            gitCommandOriginUrl,
            "git config --get remote.origin.url",
          );
          info.originUrl = metadata.originUrl;
          info.provider = metadata.provider;
          info.metadataSources = mergeMetadataSources(
            info.metadataSources,
            metadata.metadataSources,
          );
          info.metadataConfidence = mergeMetadataConfidence(
            info.metadataConfidence,
            {
              originUrl: confidenceForSource(
                "git config --get remote.origin.url",
              ),
              provider: confidenceForSource(
                "git config --get remote.origin.url",
              ),
            },
          );
        }
      }

      // Parse current branch from HEAD
      const headContent = await readText(path.join(gitLayout.gitDir, "HEAD"));
      if (headContent) {
        info.currentBranch = parseCurrentBranch(headContent);
        if (info.currentBranch) {
          info.metadataSources = mergeMetadataSources(info.metadataSources, {
            currentBranch: ".git/HEAD",
          });
          info.metadataConfidence = mergeMetadataConfidence(
            info.metadataConfidence,
            {
              currentBranch: confidenceForSource(".git/HEAD"),
            },
          );
        }
      }

      // Parse default branch from remote HEAD symref
      const remoteHead = await readText(
        path.join(gitLayout.commonDir, "refs", "remotes", "origin", "HEAD"),
      );
      if (remoteHead) {
        const prefix = "ref: refs/remotes/origin/";
        const trimmed = remoteHead.trim();
        if (trimmed.startsWith(prefix)) {
          info.defaultBranch = trimmed.slice(prefix.length);
          info.metadataSources = mergeMetadataSources(info.metadataSources, {
            defaultBranch: ".git/refs/remotes/origin/HEAD",
          });
          info.metadataConfidence = mergeMetadataConfidence(
            info.metadataConfidence,
            {
              defaultBranch: confidenceForSource(
                ".git/refs/remotes/origin/HEAD",
              ),
            },
          );
        }
      }

      // List local branches from loose refs + packed-refs
      const branchCollection = await listBranches(gitLayout.commonDir);
      if (branchCollection.names.length > 0) {
        info.branches = [...branchCollection.names];
        info.branchSources = branchCollection.sourcesByBranch;
        info.metadataSources = mergeMetadataSources(info.metadataSources, {
          branches: "refs/heads + packed-refs",
        });
        info.metadataConfidence = mergeMetadataConfidence(
          info.metadataConfidence,
          {
            branches: confidenceForSource("refs/heads + packed-refs"),
          },
        );
      }

      // Fall back: if no default branch detected, use current branch
      if (!info.defaultBranch && info.currentBranch) {
        info.defaultBranch = info.currentBranch;
        info.metadataSources = mergeMetadataSources(info.metadataSources, {
          defaultBranch: "fallback from currentBranch",
        });
        info.metadataConfidence = mergeMetadataConfidence(
          info.metadataConfidence,
          {
            defaultBranch: confidenceForSource("fallback from currentBranch"),
          },
        );
      }

      vcsInfo = info;
    } else if (existsSync(hgDir)) {
      findings.push({
        value: "Mercurial",
        confidence: 1.0,
        evidence: [".hg/ directory"],
      });
      const hgrcContent = await readText(path.join(hgDir, "hgrc"));
      const branchContent = await readText(path.join(hgDir, "branch"));
      const rawOriginUrl = hgrcContent
        ? parseHgDefaultPath(hgrcContent)
        : undefined;
      const currentBranch = branchContent?.trim() || "default";
      const originMetadata = rawOriginUrl
        ? buildOriginMetadata(rawOriginUrl, ".hg/hgrc [paths].default")
        : undefined;
      vcsInfo = {
        type: "mercurial",
        ...(originMetadata ?? {}),
        currentBranch,
        defaultBranch: currentBranch,
        metadataSources: mergeMetadataSources(originMetadata?.metadataSources, {
          currentBranch: branchContent
            ? ".hg/branch"
            : "Mercurial default branch",
          defaultBranch: "derived from currentBranch",
        }),
        metadataConfidence: {
          ...(originMetadata?.metadataSources?.originUrl
            ? {
                originUrl: confidenceForSource(".hg/hgrc [paths].default"),
                provider: confidenceForSource(".hg/hgrc [paths].default"),
              }
            : {}),
          currentBranch: confidenceForSource(
            branchContent ? ".hg/branch" : "Mercurial default branch",
          ),
          defaultBranch: confidenceForSource("derived from currentBranch"),
        },
      };
    } else if (existsSync(svnDir)) {
      findings.push({
        value: "SVN",
        confidence: 1.0,
        evidence: [".svn/ directory"],
      });
      const entriesPath = path.join(svnDir, "entries");
      const entriesContent = await readText(entriesPath);
      let rawOriginUrl = entriesContent
        ? parseSvnEntriesUrl(entriesContent)
        : undefined;
      let originSource = ".svn/entries";

      if (!rawOriginUrl) {
        const wcDbUrl = readSvnUrlFromWcDb(path.join(svnDir, "wc.db"));
        if (wcDbUrl) {
          rawOriginUrl = wcDbUrl;
          originSource = ".svn/wc.db";
        }
      }

      vcsInfo = {
        type: "svn",
        ...(rawOriginUrl
          ? buildOriginMetadata(rawOriginUrl, originSource)
          : {}),
        ...(rawOriginUrl
          ? {
              metadataConfidence: {
                originUrl: confidenceForSource(originSource),
                provider: confidenceForSource(originSource),
              },
            }
          : {}),
      };
    }

    return {
      detectorId: "vcs",
      findings,
      metadata: vcsInfo ? { vcsInfo } : undefined,
    };
  },
});
interface BranchCollectionResult {
  readonly names: readonly string[];
  readonly sourcesByBranch: Record<string, readonly string[]>;
}
