export interface VersionInfo {
  readonly sha: string;
  readonly bundleUrl: string;
  readonly bundleChecksum: string;
  readonly publishedAt: string;
}

export interface UpdateCheckCache {
  readonly checkedAt: number; // Unix ms
  readonly latest: VersionInfo | null;
}

/** Minimal fetch abstraction — subset of globalThis.fetch used by the update module. */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
