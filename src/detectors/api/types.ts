import type { ApiEndpoint } from "../../types";

/** Raw endpoint found by an extractor (before deduplication). */
export type RawEndpoint = ApiEndpoint;

/** Extractor function signature for API endpoints. */
export type EndpointExtractor = (
  lines: readonly string[],
  filePath: string,
) => RawEndpoint[];
