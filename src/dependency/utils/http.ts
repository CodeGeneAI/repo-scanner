const DEFAULT_TIMEOUT = 10_000;
const MAX_RETRIES = 3;
const BASE_DELAY = 500;

export interface FetchOptions {
  timeout?: number;
  retries?: number;
}

/**
 * Fetch with retry and timeout.
 */
export const fetchWithRetry = async (
  url: string,
  init?: RequestInit & FetchOptions,
): Promise<Response> => {
  const {
    timeout: timeoutMs = DEFAULT_TIMEOUT,
    retries,
    ...fetchInit
  } = init ?? {};
  const maxRetries = retries ?? MAX_RETRIES;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const delay = retryAfter
          ? Number.parseInt(retryAfter, 10) * 1000
          : BASE_DELAY * 2 ** attempt;
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await sleep(BASE_DELAY * 2 ** attempt);
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch JSON with retry and timeout.
 */
export const fetchJson = async <T>(
  url: string,
  init?: RequestInit & FetchOptions,
): Promise<T | undefined> => {
  try {
    const response = await fetchWithRetry(url, init);
    if (!response.ok) return undefined;
    return response.json() as Promise<T>;
  } catch {
    return undefined;
  }
};
