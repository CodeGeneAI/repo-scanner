/** Information about a class/struct extracted from AST. */
export interface ClassInfo {
  readonly name: string;
  readonly line: number;
  readonly methods: readonly MethodInfo[];
  readonly fieldCount: number;
  /** Lines of code in class body. */
  readonly loc: number;
  readonly implements?: readonly string[];
  readonly extends?: string;
}

/** Information about a method extracted from AST. */
export interface MethodInfo {
  readonly name: string;
  readonly line: number;
  /** Cyclomatic complexity (branch count + 1). */
  readonly complexity: number;
  readonly isOverride: boolean;
  /** Method body is empty or only contains pass/return. */
  readonly isEmpty: boolean;
  /** Method throws NotImplementedError or equivalent. */
  readonly throwsNotImplemented: boolean;
}

/** Import statement information. */
export interface ImportInfo {
  readonly source: string;
  readonly names: readonly string[];
  readonly isTypeOnly: boolean;
  readonly line: number;
}

/** Interface/protocol/trait information. */
export interface InterfaceInfo {
  readonly name: string;
  readonly line: number;
  readonly methodCount: number;
  readonly methods: readonly string[];
}

/** A `new ClassName()` instantiation. */
export interface InstantiationInfo {
  readonly className: string;
  readonly line: number;
  readonly inFunction: string;
}

/** A type check (instanceof, typeof, is, isinstance). */
export interface TypeCheckInfo {
  readonly checkedType: string;
  readonly line: number;
  readonly inFunction: string;
}

/** Complete analysis of a single file. */
export interface FileAnalysis {
  readonly classes: readonly ClassInfo[];
  readonly imports: readonly ImportInfo[];
  readonly interfaces: readonly InterfaceInfo[];
  readonly instantiations: readonly InstantiationInfo[];
  readonly typeChecks: readonly TypeCheckInfo[];
}
