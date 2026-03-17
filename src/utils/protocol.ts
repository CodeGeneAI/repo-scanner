/** Derive a human-readable protocol name from a raw endpoint method. */
export const deriveProtocol = (method: string): string => {
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
