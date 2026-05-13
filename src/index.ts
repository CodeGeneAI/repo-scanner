export { getCallChain, getCalleesOf, getCallersOf } from "./call-graph/query";
export type { DetectorResult, Finding } from "./detectors/types";
export type {
  DiagramKind,
  DiagramOutput,
  TopologyResult,
} from "./output/topology";
export { generateTopology } from "./output/topology";
export { generatePerfDriftReport } from "./perf/drift-report";
export { recordPerfTrend } from "./perf/trend-history";
export { scanRepo } from "./scanner";
export type {
  ApiEndpoint,
  ApiSurface,
  CallGraph,
  CallGraphEdge,
  CallGraphNode,
  CliOptions,
  Component,
  ComponentKind,
  ComponentMetadata,
  CrossPackageDependencyGraph,
  DeadExport,
  EnvValueType,
  EnvVarInfo,
  EnvVarUsage,
  LanguageStats,
  LargeFileInfo,
  PackageDependencyEdge,
  RepoScanResult,
  RuntimeInfo,
  ScanRepoOptions,
  SolidHealthResult,
  TodoAnnotation,
} from "./types";
