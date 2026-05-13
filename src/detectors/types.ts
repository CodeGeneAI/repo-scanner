import type { FileIndex } from "../utils/file-index";

export interface Finding {
  readonly value: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
}

export interface DetectorResult {
  readonly detectorId: string;
  readonly findings: readonly Finding[];
  /** Optional component hints for the aggregator. */
  readonly componentHints?: readonly {
    readonly path: string;
    readonly kind?: string;
    readonly name?: string;
    readonly description?: string;
  }[];
  /** Optional structured metadata for the aggregator. */
  readonly metadata?: Record<string, unknown>;
}

export interface Detector {
  readonly id: string;
  detect(rootPath: string, index: FileIndex): Promise<DetectorResult>;
}
