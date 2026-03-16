import type { Token } from "../tokenizer/tokens";
import type { CloneInstance, DuplicateGroup, FilterOptions } from "../types";
import {
  computeMetrics,
  resolveFilterOptions,
  shouldFilter,
  shouldFilterBarrel,
} from "./filters";
import { computeRollingHashes, type HashEntry } from "./hasher";

interface FileData {
  readonly file: string;
  readonly tokens: Token[];
}

/** Mutable instance tracking both line and token ranges for accurate merge. */
interface MutableInstance {
  file: string;
  startLine: number;
  endLine: number;
  startToken: number;
  endToken: number;
}

/** Mutable group used internally during merge/dedup phases. */
interface MutableGroup {
  id: number;
  instances: MutableInstance[];
  tokenCount: number;
  lineCount: number;
}

/**
 * Detect duplicated code blocks across all provided files.
 * Uses Rabin-Karp rolling hash with collision verification.
 */
export const detectClones = (
  files: FileData[],
  windowSize: number,
  minLines: number,
  filterOptions?: FilterOptions,
): DuplicateGroup[] => {
  const filters = resolveFilterOptions(filterOptions);
  // Phase 1: Collect all hashes across files
  const globalHashes = new Map<number, HashEntry[]>();
  const tokensByFile = new Map<string, Token[]>();

  for (const { file, tokens } of files) {
    tokensByFile.set(file, tokens);
    const fileHashes = computeRollingHashes(tokens, file, windowSize);
    for (const [hash, entries] of fileHashes) {
      const existing = globalHashes.get(hash);
      if (existing) {
        existing.push(...entries);
      } else {
        globalHashes.set(hash, [...entries]);
      }
    }
  }

  // Phase 2: Find hashes with entries from 2+ different locations
  const candidateGroups: HashEntry[][] = [];
  for (const entries of globalHashes.values()) {
    if (entries.length < 2) continue;

    const deduped = deduplicateEntries(entries);
    if (deduped.length < 2) continue;

    candidateGroups.push(deduped);
  }

  // Phase 3: Verify candidates by comparing actual normalized tokens
  const verifiedGroups: MutableGroup[] = [];
  const seen = new Set<string>();
  let groupId = 1;

  for (const entries of candidateGroups) {
    const firstEntry = entries[0]!;
    const firstTokens = tokensByFile.get(firstEntry.file)!;
    const signature = buildSignature(firstTokens, firstEntry);

    // Verify all entries match the signature
    const verified: HashEntry[] = [];
    for (const entry of entries) {
      const tokens = tokensByFile.get(entry.file)!;
      const entrySig = buildSignature(tokens, entry);
      if (entrySig === signature) {
        verified.push(entry);
      }
    }

    if (verified.length < 2) continue;

    // Build dedup key from signature + all file locations
    const locations = verified
      .map((e) => `${e.file}:${e.startToken}`)
      .sort()
      .join("|");
    const dedupKey = `${signature}::${locations}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    // Convert to mutable instances, sorted by file then line
    const instances = verified
      .map((e) => ({
        file: e.file,
        startLine: e.startLine,
        endLine: e.endLine,
        startToken: e.startToken,
        endToken: e.endToken,
      }))
      .sort(
        (a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine,
      );

    const lineCount = instances[0]!.endLine - instances[0]!.startLine + 1;
    if (lineCount < minLines) continue;

    verifiedGroups.push({
      id: groupId++,
      instances,
      tokenCount: windowSize,
      lineCount,
    });
  }

  // Phase 3.5: Filter likely false positives (pre-merge)
  const filtered = verifiedGroups.filter((group) => {
    const inst = group.instances[0]!;
    const tokens = tokensByFile.get(inst.file)!;
    const metrics = computeMetrics(tokens, inst.startToken, inst.endToken);
    return !shouldFilter(metrics, filters);
  });

  // Phase 4: Merge adjacent/overlapping groups and deduplicate nested
  const merged = mergeAdjacentGroups(filtered);

  // Phase 4.5: Post-merge filter on merged token ranges
  const postMergeFiltered = merged.filter((group) => {
    const inst = group.instances[0]!;
    const tokens = tokensByFile.get(inst.file);
    if (!tokens) return true;
    const metrics = computeMetrics(tokens, inst.startToken, inst.endToken);

    // Re-apply unique ratio + literal ratio on merged ranges
    if (shouldFilter(metrics, filters)) return false;

    // Barrel re-export filter on matched region
    if (shouldFilterBarrel(metrics, filters)) return false;

    return true;
  });

  return removeNestedGroups(postMergeFiltered);
};

/** Build a string signature from normalized tokens for comparison. */
const buildSignature = (tokens: Token[], entry: HashEntry): string => {
  const slice = tokens.slice(entry.startToken, entry.endToken + 1);
  return slice.map((t) => t.normalized).join(" ");
};

/**
 * Remove overlapping entries in the same file.
 * Keep only entries where no other entry for the same file overlaps.
 */
const deduplicateEntries = (entries: HashEntry[]): HashEntry[] => {
  const byFile = new Map<string, HashEntry[]>();
  for (const e of entries) {
    const list = byFile.get(e.file);
    if (list) {
      list.push(e);
    } else {
      byFile.set(e.file, [e]);
    }
  }

  const result: HashEntry[] = [];
  for (const fileEntries of byFile.values()) {
    fileEntries.sort((a, b) => a.startToken - b.startToken);

    let last: HashEntry | undefined;
    for (const e of fileEntries) {
      if (!last || e.startToken > last.endToken) {
        result.push(e);
        last = e;
      }
    }
  }

  return result;
};

/**
 * Merge groups whose instances overlap or are adjacent in the same file pairs.
 */
const mergeAdjacentGroups = (groups: MutableGroup[]): MutableGroup[] => {
  if (groups.length === 0) return [];

  // Normalize instance order within each group for consistent comparison
  for (const g of groups) {
    g.instances.sort(
      (a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine,
    );
  }

  // Sort groups by first instance file then start line
  const sorted = [...groups].sort((a, b) => {
    const aInst = a.instances[0]!;
    const bInst = b.instances[0]!;
    const fileCmp = aInst.file.localeCompare(bInst.file);
    if (fileCmp !== 0) return fileCmp;
    return aInst.startLine - bInst.startLine;
  });

  const result: MutableGroup[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const prev = result[result.length - 1]!;

    if (canMerge(prev, current)) {
      // Merge by expanding both line and token ranges
      prev.instances = prev.instances.map((prevInst, j) => {
        const curInst = current.instances[j]!;
        return {
          file: prevInst.file,
          startLine: Math.min(prevInst.startLine, curInst.startLine),
          endLine: Math.max(prevInst.endLine, curInst.endLine),
          startToken: Math.min(prevInst.startToken, curInst.startToken),
          endToken: Math.max(prevInst.endToken, curInst.endToken),
        };
      });
      prev.lineCount =
        prev.instances[0]!.endLine - prev.instances[0]!.startLine + 1;
      prev.tokenCount =
        prev.instances[0]!.endToken - prev.instances[0]!.startToken + 1;
    } else {
      result.push(current);
    }
  }

  return result;
};

/** Check if two groups can be merged (same files, adjacent/overlapping lines). */
const canMerge = (a: MutableGroup, b: MutableGroup): boolean => {
  if (a.instances.length !== b.instances.length) return false;

  for (let i = 0; i < a.instances.length; i++) {
    if (a.instances[i]!.file !== b.instances[i]!.file) return false;
  }

  for (let i = 0; i < a.instances.length; i++) {
    const aInst = a.instances[i]!;
    const bInst = b.instances[i]!;
    if (bInst.startLine > aInst.endLine + 1) return false;
    if (aInst.startLine > bInst.endLine + 1) return false;
  }

  return true;
};

/** Remove groups whose instances are fully contained within larger groups. */
const removeNestedGroups = (groups: MutableGroup[]): DuplicateGroup[] => {
  const sorted = [...groups].sort((a, b) => b.lineCount - a.lineCount);
  const kept: MutableGroup[] = [];

  for (const group of sorted) {
    const isNested = kept.some((larger) => isFullyContained(group, larger));
    if (!isNested) {
      kept.push(group);
    }
  }

  // Convert to readonly output, re-number IDs
  return kept.map(
    (g, i): DuplicateGroup => ({
      id: i + 1,
      instances: g.instances.map(
        (inst): CloneInstance => ({
          file: inst.file,
          startLine: inst.startLine,
          endLine: inst.endLine,
        }),
      ),
      tokenCount: g.tokenCount,
      lineCount: g.lineCount,
    }),
  );
};

/** Check if all instances of `inner` are contained within instances of `outer`. */
const isFullyContained = (
  inner: MutableGroup,
  outer: MutableGroup,
): boolean => {
  for (const iInst of inner.instances) {
    const contained = outer.instances.some(
      (oInst) =>
        oInst.file === iInst.file &&
        oInst.startLine <= iInst.startLine &&
        oInst.endLine >= iInst.endLine,
    );
    if (!contained) return false;
  }
  return true;
};
