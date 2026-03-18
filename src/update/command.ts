import {
  detectPlatform,
  fetchLatestVersion,
  formatUpdateNotice,
  getBundleForPlatform,
  isUpdateAvailable,
  shortSha,
} from "./check";
import { UpdateConfigError } from "./errors";
import {
  atomicReplace,
  downloadBundle,
  extractBinaryFromBundle,
  resolveRealExecPath,
} from "./install";
import type { BunPlatform, VersionInfo } from "./types";

// ---------------------------------------------------------------------------
// Dependency injection interface — all side-effectful operations are injectable
// so the command can be unit-tested without network/filesystem access.
// ---------------------------------------------------------------------------

export interface UpdateCommandDeps {
  readonly fetchLatestVersion: (url: string) => Promise<VersionInfo>;
  readonly detectPlatform: () => BunPlatform;
  readonly downloadBundle: (
    url: string,
    checksum: string,
  ) => Promise<Uint8Array>;
  readonly extractBinaryFromBundle: (bytes: Uint8Array) => Uint8Array;
  readonly atomicReplace: (
    bytes: Uint8Array,
    targetPath: string,
  ) => Promise<void>;
  readonly resolveRealExecPath: () => string;
}

export const defaultUpdateDeps: UpdateCommandDeps = {
  // TypeScript function-type compatibility allows assigning the real function
  // (which has additional optional parameters) directly to the interface slot
  // typed as `(url: string) => Promise<VersionInfo>`.
  fetchLatestVersion,
  detectPlatform,
  downloadBundle,
  extractBinaryFromBundle,
  atomicReplace,
  resolveRealExecPath,
};

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export interface UpdateCommandOpts {
  readonly currentSha: string;
  readonly updateUrl: string;
  readonly stderr: NodeJS.WritableStream;
}

export type UpdateCommandResult = "up-to-date" | "updated";

export const runUpdateCommand = async (
  opts: UpdateCommandOpts,
  deps: UpdateCommandDeps = defaultUpdateDeps,
): Promise<UpdateCommandResult> => {
  if (!opts.updateUrl) {
    throw new UpdateConfigError(
      "No update URL configured. This binary was built without an update URL.",
    );
  }

  opts.stderr.write("Checking for updates...\n");

  const latest = await deps.fetchLatestVersion(opts.updateUrl);

  if (!isUpdateAvailable(opts.currentSha, latest.sha)) {
    opts.stderr.write(
      `Already up to date (sha: ${shortSha(opts.currentSha)}).\n`,
    );
    return "up-to-date";
  }

  opts.stderr.write(
    `Update available: ${shortSha(opts.currentSha)} → ${shortSha(latest.sha)}\n`,
  );

  const platform = deps.detectPlatform();
  const bundle = getBundleForPlatform(latest, platform);

  opts.stderr.write("Downloading...\n");

  const bundleBytes = await deps.downloadBundle(
    bundle.bundleUrl,
    bundle.bundleChecksum,
  );

  opts.stderr.write("Extracting binary...\n");
  const binaryBytes = deps.extractBinaryFromBundle(bundleBytes);

  opts.stderr.write("Installing...\n");
  const execPath = deps.resolveRealExecPath();
  await deps.atomicReplace(binaryBytes, execPath);

  opts.stderr.write(`Done. repo-scanner updated to ${shortSha(latest.sha)}.\n`);

  return "updated";
};

export { formatUpdateNotice };
