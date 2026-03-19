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
