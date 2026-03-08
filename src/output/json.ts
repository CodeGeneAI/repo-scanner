import type { RepoScanResult } from "../types";

export const renderJson = (
  result: RepoScanResult,
  stream: NodeJS.WritableStream,
): void => {
  stream.write(JSON.stringify(result, null, 2));
  stream.write("\n");
};
