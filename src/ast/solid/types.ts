export type ViolationSeverity = "info" | "warning" | "error";
export type SolidPrinciple = "SRP" | "OCP" | "LSP" | "ISP" | "DIP";

export interface Violation {
  readonly principle: SolidPrinciple;
  readonly file: string;
  readonly line: number;
  readonly entity: string;
  readonly severity: ViolationSeverity;
  readonly message: string;
  readonly metric?: {
    readonly name: string;
    readonly value: number;
    readonly threshold: number;
  };
}

export interface PrincipleResult {
  readonly score: number;
  readonly confidence: number;
  readonly violations: readonly Violation[];
  readonly summary: string;
}

export interface FileScore {
  readonly file: string;
  readonly score: number;
  readonly violations: number;
  readonly language: string;
}

export interface SolidHealthResult {
  readonly score: number;
  readonly principles: {
    readonly srp: PrincipleResult;
    readonly ocp: PrincipleResult;
    readonly lsp: PrincipleResult;
    readonly isp: PrincipleResult;
    readonly dip: PrincipleResult;
  };
  readonly worstFiles: readonly FileScore[];
  readonly analyzedFiles: number;
  readonly analyzedClasses: number;
}

export interface SolidScanOptions {
  readonly enabled?: boolean;
  readonly threshold?: number;
}
