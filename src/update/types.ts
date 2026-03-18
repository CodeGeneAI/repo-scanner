export const BUN_PLATFORMS = [
  "bun-linux-x64",
  "bun-linux-x64-baseline",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-x64-baseline",
  "bun-darwin-arm64",
  "bun-windows-x64",
  "bun-windows-x64-baseline",
] as const;

export type BunPlatform = (typeof BUN_PLATFORMS)[number];

export interface PlatformBundle {
  readonly bundleUrl: string;
  readonly bundleChecksum: string;
}

export interface VersionInfo {
  readonly sha: string;
  readonly publishedAt: string;
  readonly platforms: Partial<Record<BunPlatform, PlatformBundle>>;
}

export interface UpdateCheckCache {
  readonly checkedAt: number; // Unix ms
  readonly latest: VersionInfo | null;
}

/** Minimal fetch abstraction — subset of globalThis.fetch used by the update module. */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
