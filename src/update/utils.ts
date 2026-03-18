import type { BunPlatform } from "./types";
import { BUN_PLATFORMS } from "./types";

// ---------------------------------------------------------------------------
// Platform utilities
// ---------------------------------------------------------------------------

/** Type predicate for the BUN_PLATFORMS tuple. */
export const isBunPlatform = (value: string): value is BunPlatform =>
  (BUN_PLATFORMS as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// URL utilities
// ---------------------------------------------------------------------------

/**
 * Parses and validates an HTTPS URL.
 *
 * Throws via the supplied `mkError` factory so each call-site can produce the
 * appropriate domain-specific error type (e.g. UpdateFetchError vs
 * UpdateDownloadError) without duplicating URL-parsing logic.
 */
export const parseHttpsUrl = (
  url: string,
  mkError: (message: string) => Error,
): URL => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw mkError(`Invalid URL: "${url}"`);
  }
  if (parsed.protocol !== "https:") {
    throw mkError(`URL must use HTTPS (got "${parsed.protocol}"): "${url}"`);
  }
  return parsed;
};
