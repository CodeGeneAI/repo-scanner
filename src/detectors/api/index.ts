import type { ApiSurface } from "../../types";
import type { FileIndex } from "../../utils/file-index";
import { readText } from "../../utils/fs";
import { registerDetector } from "../registry";
import type { DetectorResult } from "../types";
import {
  extractGraphqlSchema,
  extractNestJsGraphql,
  isNestJsResolver,
} from "./graphql-extractors";
import { extractProto } from "./grpc-extractors";
import {
  extractExpress,
  extractFlask,
  extractGoHttp,
  extractNestJsRest,
  extractRails,
  extractSpring,
  isExpressLike,
  isFlaskLike,
  isGoHttp,
  isNestJsController,
  isRailsRoutes,
  isSpringController,
} from "./rest-extractors";
import type { RawEndpoint } from "./types";
import {
  extractNestJsWebSocket,
  isNestJsGateway,
} from "./websocket-extractors";

// ─── Extension → extractor mapping ─────────────────────────────────

interface ExtractorEntry {
  check: (content: string, relativePath: string) => boolean;
  extract: (lines: readonly string[], filePath: string) => RawEndpoint[];
}

const TS_EXTRACTORS: readonly ExtractorEntry[] = [
  { check: isNestJsController, extract: extractNestJsRest },
  { check: isNestJsResolver, extract: extractNestJsGraphql },
  { check: isNestJsGateway, extract: extractNestJsWebSocket },
  { check: isExpressLike, extract: extractExpress },
];

const JS_EXTRACTORS: readonly ExtractorEntry[] = [
  { check: isExpressLike, extract: extractExpress },
];

const PY_EXTRACTORS: readonly ExtractorEntry[] = [
  { check: isFlaskLike, extract: extractFlask },
];

const GO_EXTRACTORS: readonly ExtractorEntry[] = [
  { check: isGoHttp, extract: extractGoHttp },
];

const JAVA_KT_EXTRACTORS: readonly ExtractorEntry[] = [
  { check: isSpringController, extract: extractSpring },
];

const RB_EXTRACTORS: readonly ExtractorEntry[] = [
  { check: (_c, rp) => isRailsRoutes(rp), extract: extractRails },
];

// Map of extension → extractors
const EXTENSION_MAP: Record<string, readonly ExtractorEntry[]> = {
  ".ts": TS_EXTRACTORS,
  ".js": JS_EXTRACTORS,
  ".mjs": JS_EXTRACTORS,
  ".py": PY_EXTRACTORS,
  ".go": GO_EXTRACTORS,
  ".java": JAVA_KT_EXTRACTORS,
  ".kt": JAVA_KT_EXTRACTORS,
  ".rb": RB_EXTRACTORS,
};

// Extensions to scan
const SCAN_EXTENSIONS = Object.keys(EXTENSION_MAP);

// ─── Protocol derivation ────────────────────────────────────────────

const deriveProtocol = (method: string): string => {
  switch (method) {
    case "QUERY":
    case "MUTATION":
    case "SUBSCRIPTION":
      return "GraphQL";
    case "RPC":
      return "gRPC";
    case "WS":
      return "WebSocket";
    default:
      return "REST";
  }
};

// ─── Detector ───────────────────────────────────────────────────────

registerDetector({
  id: "api-surface",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const allEndpoints: RawEndpoint[] = [];

    // Scan source files by extension
    for (const ext of SCAN_EXTENSIONS) {
      const extractors = EXTENSION_MAP[ext]!;
      const files = index.getByExtensionPrimary(ext);

      for (const f of files) {
        const content = await readText(f.path);
        if (!content) continue;

        const lines = content.split("\n");

        for (const entry of extractors) {
          if (entry.check(content, f.relativePath)) {
            const endpoints = entry.extract(lines, f.relativePath);
            allEndpoints.push(...endpoints);
          }
        }
      }
    }

    // Scan GraphQL schema files
    for (const ext of [".graphql", ".gql"]) {
      const files = index.getByExtensionPrimary(ext);
      for (const f of files) {
        const content = await readText(f.path);
        if (!content) continue;
        const lines = content.split("\n");
        const endpoints = extractGraphqlSchema(lines, f.relativePath);
        allEndpoints.push(...endpoints);
      }
    }

    // Scan .proto files
    const protoFiles = index.getByExtensionPrimary(".proto");
    for (const f of protoFiles) {
      const content = await readText(f.path);
      if (!content) continue;
      const lines = content.split("\n");
      const endpoints = extractProto(lines, f.relativePath);
      allEndpoints.push(...endpoints);
    }

    // Build ApiSurface
    if (allEndpoints.length === 0) {
      return { detectorId: "api-surface", findings: [] };
    }

    const protocols = [
      ...new Set(allEndpoints.map((e) => deriveProtocol(e.method))),
    ].sort();
    const frameworksUsed = [
      ...new Set(allEndpoints.map((e) => e.framework)),
    ].sort();

    const apiSurface: ApiSurface = {
      endpoints: allEndpoints,
      protocols,
      frameworksUsed,
    };

    return {
      detectorId: "api-surface",
      findings: protocols.map((p) => ({
        value: p,
        confidence: 1.0,
        evidence: [
          `${allEndpoints.filter((e) => deriveProtocol(e.method) === p).length} ${p} endpoints`,
        ],
      })),
      metadata: { apiSurface },
      signals: {
        hasTypedContracts:
          protocols.includes("GraphQL") || protocols.includes("gRPC"),
      },
    };
  },
});
