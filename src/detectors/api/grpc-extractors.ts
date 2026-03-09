import type { RawEndpoint } from "./types";

/** Extract gRPC service methods from .proto files. */
export const extractProto = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];
  let currentService: string | undefined;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("//")) continue;

    // Detect service block
    const serviceMatch = /^service\s+(\w+)\s*\{?\s*$/.exec(trimmed);
    if (serviceMatch) {
      currentService = serviceMatch[1];
      braceDepth = trimmed.includes("{") ? 1 : 0;
      continue;
    }

    if (currentService !== undefined) {
      for (const ch of trimmed) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      if (braceDepth <= 0) {
        currentService = undefined;
        continue;
      }

      // rpc MethodName(Request) returns (Response)
      const rpcMatch = /^\s*rpc\s+(\w+)\s*\(/.exec(line);
      if (rpcMatch) {
        endpoints.push({
          method: "RPC",
          path: `${currentService}.${rpcMatch[1]}`,
          file: filePath,
          line: i + 1,
          framework: "gRPC",
        });
      }
    }
  }

  return endpoints;
};
