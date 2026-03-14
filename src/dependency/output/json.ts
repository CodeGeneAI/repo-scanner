import type { DepScannerResult } from "../types";

export const renderJson = (
  result: DepScannerResult,
  stream: NodeJS.WritableStream,
): void => {
  stream.write(JSON.stringify(result, null, 2));
  stream.write("\n");
};
