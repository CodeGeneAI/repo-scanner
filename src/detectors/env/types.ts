import type { EnvValueType } from "../../types";

/** How the environment variable is accessed. */
export type EnvAccessType = "read" | "write" | "definition";

/** A raw match from a language extractor or config parser. */
export interface ExtractorMatch {
  readonly varName: string;
  readonly line: number;
  readonly pattern: string;
  readonly accessType: EnvAccessType;
  readonly defaultValue?: string;
  readonly inferredType?: EnvValueType;
  readonly isDynamic?: boolean;
  readonly isConfigFile?: boolean;
}

/** Extractor function signature for a language. */
export type LanguageExtractor = (
  lines: readonly string[],
  filePath: string,
) => ExtractorMatch[];
