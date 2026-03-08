export type ComponentKind =
  | "app"
  | "service"
  | "package"
  | "library"
  | "infra"
  | "script"
  | "unknown";

export interface Component {
  readonly name: string;
  readonly path: string;
  readonly kind: ComponentKind;
  readonly description: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
}

export interface RepoScanResult {
  readonly inventory: {
    readonly languages: readonly string[];
    readonly frameworks: readonly string[];
    readonly datastores: readonly string[];
    readonly dependencyManagers: readonly string[];
    readonly repoTools: readonly string[];
  };
  readonly architecture: {
    readonly monorepo: boolean;
    readonly components: readonly Component[];
  };
  readonly buildAndTest: {
    readonly buildCommands: readonly string[];
    readonly testCommands: readonly string[];
    readonly lintCommands: readonly string[];
    readonly ciSystems: readonly string[];
  };
  readonly signals: {
    readonly hasReadme: boolean;
    readonly hasCi: boolean;
    readonly hasContainerization: boolean;
    readonly hasIaC: boolean;
    readonly hasTests: boolean;
    readonly hasTypedContracts: boolean;
  };
  readonly scanPath: string;
  readonly timestamp: string;
  readonly durationMs: number;
}

export interface CliOptions {
  readonly path: string;
  readonly format: "table" | "json";
  readonly showHelp: boolean;
}
