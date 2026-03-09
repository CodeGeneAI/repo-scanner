import type { RawEndpoint } from "./types";

/** Extract WebSocket event handlers from NestJS gateways. */
export const extractNestJsWebSocket = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // @SubscribeMessage('eventName')
    const subMatch = /@SubscribeMessage\(\s*['"]([^'"]+)['"]\s*\)/.exec(line);
    if (subMatch) {
      endpoints.push({
        method: "WS",
        path: subMatch[1]!,
        file: filePath,
        line: i + 1,
        framework: "NestJS",
      });
    }
  }

  return endpoints;
};

/** Check if content looks like a NestJS WebSocket gateway. */
export const isNestJsGateway = (content: string): boolean =>
  content.includes("@WebSocketGateway") ||
  content.includes("@SubscribeMessage");
