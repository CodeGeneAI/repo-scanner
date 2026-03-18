import {
  fetchLatestVersion,
  formatUpdateNotice,
  isUpdateAvailable,
  shortSha,
} from "./check";
import {
  atomicReplace,
  downloadBundle,
  extractBinaryFromBundle,
  resolveRealExecPath,
} from "./install";
import type { VersionInfo } from "./types";

// ---------------------------------------------------------------------------
// Dependency injection interface — all side-effectful operations are injectable
// so the command can be unit-tested without network/filesystem access.
// ---------------------------------------------------------------------------

export interface UpdateCommandDeps {
  readonly fetchLatestVersion: (url: string) => Promise<VersionInfo>;
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
  fetchLatestVersion: (url) => fetchLatestVersion(url),
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

const write = (stream: NodeJS.WritableStream, message: string): void => {
  stream.write(message);
};

export const runUpdateCommand = async (
  opts: UpdateCommandOpts,
  deps: UpdateCommandDeps = defaultUpdateDeps,
): Promise<UpdateCommandResult> => {
  if (!opts.updateUrl) {
    throw new Error(
      "No update URL configured. This binary was built without an update URL.",
    );
  }

  write(opts.stderr, "Checking for updates...\n");

  const latest = await deps.fetchLatestVersion(opts.updateUrl);

  if (!isUpdateAvailable(opts.currentSha, latest.sha)) {
    write(
      opts.stderr,
      `Already up to date (sha: ${shortSha(opts.currentSha)}).\n`,
    );
    return "up-to-date";
  }

  write(
    opts.stderr,
    `Update available: ${shortSha(opts.currentSha)} → ${shortSha(latest.sha)}\n`,
  );
  write(opts.stderr, "Downloading...\n");

  const bundleBytes = await deps.downloadBundle(
    latest.bundleUrl,
    latest.bundleChecksum,
  );

  write(opts.stderr, "Extracting binary...\n");
  const binaryBytes = deps.extractBinaryFromBundle(bundleBytes);

  write(opts.stderr, "Installing...\n");
  const execPath = deps.resolveRealExecPath();
  await deps.atomicReplace(binaryBytes, execPath);

  write(
    opts.stderr,
    `Done. repo-scanner updated to ${shortSha(latest.sha)}.\n`,
  );

  return "updated";
};

export { formatUpdateNotice };
