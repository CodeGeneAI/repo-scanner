/**
 * Parse `git diff -U0` output to extract actually-added line numbers per file.
 * Returns a map of relative file path → set of added line numbers.
 */
export const getAddedLines = async (
  scanPath: string,
  diffRange: string,
): Promise<ReadonlyMap<string, ReadonlySet<number>>> => {
  const args = ["git", "diff", "-U0", diffRange];
  const proc = Bun.spawn(args, {
    cwd: scanPath,
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return new Map();
  }

  const result = new Map<string, Set<number>>();
  let currentFile: string | undefined;
  let addedLineNum = 0;

  for (const line of output.split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      continue;
    }

    if (line.startsWith("@@ ") && currentFile) {
      // Parse hunk header: @@ -X,Y +A,B @@
      const match = line.match(/\+(\d+)(?:,(\d+))?/);
      if (match) {
        addedLineNum = Number.parseInt(match[1]!, 10);
        // A hunk with count 0 (e.g. +X,0) means no lines added — pure deletion
        const count =
          match[2] !== undefined ? Number.parseInt(match[2], 10) : 1;
        if (count === 0) {
          addedLineNum = 0;
        }
      }
      continue;
    }

    if (
      line.startsWith("+") &&
      !line.startsWith("+++") &&
      currentFile &&
      addedLineNum > 0
    ) {
      let fileLines = result.get(currentFile);
      if (!fileLines) {
        fileLines = new Set();
        result.set(currentFile, fileLines);
      }
      fileLines.add(addedLineNum);
      addedLineNum++;
    }
  }

  return result;
};

export const getChangedFiles = async (
  scanPath: string,
  diffRange: string,
): Promise<string[]> => {
  const args = ["git", "diff", "--name-only", diffRange];
  const proc = Bun.spawn(args, {
    cwd: scanPath,
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
};
