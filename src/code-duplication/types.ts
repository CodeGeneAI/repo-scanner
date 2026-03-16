/** A single location where a duplicated code block appears. */
export interface CloneInstance {
  /** File path relative to scan root. */
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
}

/** A group of identical (after normalization) code blocks. */
export interface DuplicateGroup {
  readonly id: number;
  readonly instances: readonly CloneInstance[];
  /** Number of normalized tokens in this duplicated block. */
  readonly tokenCount: number;
  /** Number of source lines this block spans. */
  readonly lineCount: number;
}

/** Aggregate statistics for the scan. */
export interface DryCheckStats {
  readonly filesScanned: number;
  readonly totalTokens: number;
  readonly duplicateGroups: number;
  readonly duplicatedLines: number;
  readonly duplicationPercentage: number;
}

/** Top-level result returned by the scanner. */
export interface DryCheckResult {
  readonly scanPath: string;
  readonly durationMs: number;
  readonly groups: readonly DuplicateGroup[];
  readonly stats: DryCheckStats;
}

/** CLI options parsed from argv. */
export interface CliOptions {
  readonly path: string;
  readonly format: "table" | "json";
  readonly minTokens: number;
  readonly minLines: number;
  readonly extensions: readonly string[];
  readonly showHelp: boolean;
  readonly minUniqueRatio: number;
  readonly maxLiteralRatio: number;
  readonly ignoreBarrelExports: boolean;
}

/** Options for filtering false-positive clone groups. */
export interface FilterOptions {
  /** Minimum ratio of distinct normalized tokens to total tokens (default: 0.10). Set to 0 to disable. */
  readonly minUniqueRatio?: number;
  /** Maximum ratio of literal tokens (string + numeric) to total tokens (default: 0.50). Set to 1 to disable. */
  readonly maxLiteralRatio?: number;
  /** Filter barrel-file re-export patterns (default: true). */
  readonly ignoreBarrelExports?: boolean;
}

/** Options for the public API `scanForDuplicates`. */
export interface ScanOptions {
  readonly path: string;
  readonly minTokens?: number;
  readonly minLines?: number;
  readonly extensions?: readonly string[];
  readonly filters?: FilterOptions;
}
