export { BUILD_SHA, BUILD_UPDATE_URL } from "./build-version";
export {
  detectAvx2,
  detectPlatform,
  formatUpdateNotice,
  getBundleForPlatform,
  isCacheStale,
  isUpdateAvailable,
  shortSha,
  shouldRunUpdateCheck,
  startBackgroundUpdateCheck,
} from "./check";
export type {
  UpdateCommandDeps,
  UpdateCommandOpts,
  UpdateCommandResult,
} from "./command";
export { defaultUpdateDeps, runUpdateCommand } from "./command";
export {
  UpdateChecksumError,
  UpdateConfigError,
  UpdateDownloadError,
  UpdateExtractionError,
  UpdateFetchError,
  UpdatePlatformError,
} from "./errors";
export {
  atomicReplace,
  downloadBundle,
  extractBinaryFromBundle,
  resolveRealExecPath,
  verifyChecksum,
} from "./install";
export type {
  BunPlatform,
  FetchFn,
  PlatformBundle,
  UpdateCheckCache,
  VersionInfo,
} from "./types";
export { BUN_PLATFORMS } from "./types";
export { isBunPlatform } from "./utils";
