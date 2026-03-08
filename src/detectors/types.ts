import type { FileIndex } from "../utils/file-index";

export interface Finding {
  readonly value: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
}

export interface DetectorResult {
  readonly detectorId: string;
  readonly findings: readonly Finding[];
  /** Optional commands extracted (build, test, lint). */
  readonly commands?: {
    readonly build?: readonly string[];
    readonly test?: readonly string[];
    readonly lint?: readonly string[];
  };
  /** Optional component hints for the aggregator. */
  readonly componentHints?: readonly {
    readonly path: string;
    readonly kind?: string;
    readonly name?: string;
    readonly description?: string;
  }[];
  /** Optional signal overrides. */
  readonly signals?: Partial<{
    readonly hasReadme: boolean;
    readonly hasCi: boolean;
    readonly hasContainerization: boolean;
    readonly hasIaC: boolean;
    readonly hasTests: boolean;
    readonly hasTypedContracts: boolean;
  }>;
}

export interface Detector {
  readonly id: string;
  detect(rootPath: string, index: FileIndex): Promise<DetectorResult>;
}
