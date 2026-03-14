import type { Dependency, Ecosystem, Vulnerability } from "../types";
import { mapWithConcurrency } from "../utils/concurrency";
import { fetchJson, fetchWithRetry } from "../utils/http";
import { extractBaseVersion } from "../utils/semver";

const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_VULN_URL = "https://api.osv.dev/v1/vulns";
const BATCH_SIZE = 1000;
const VULN_DETAIL_CONCURRENCY = 10;

const ECOSYSTEM_MAP: Record<Ecosystem, string> = {
  npm: "npm",
  pypi: "PyPI",
  go: "Go",
  cargo: "crates.io",
  rubygems: "RubyGems",
  maven: "Maven",
  nuget: "NuGet",
  packagist: "Packagist",
  cocoapods: "CocoaPods",
  pub: "Pub",
  conan: "ConanCenter",
};

interface OsvQuery {
  package: { name: string; ecosystem: string };
  version: string;
}

interface OsvVulnerability {
  id: string;
  summary?: string;
  severity?: Array<{ type: string; score: string }>;
  database_specific?: { severity?: string };
  affected?: Array<{
    ranges?: Array<{ events?: Array<{ fixed?: string }> }>;
    versions?: string[];
  }>;
}

interface OsvBatchResponse {
  results: Array<{ vulns?: OsvVulnerability[] }>;
}

export const getVulnerabilityLookupKey = (dependency: Dependency): string => {
  const version =
    dependency.resolvedVersion ?? extractBaseVersion(dependency.currentVersion);
  return `${dependency.ecosystem}:${dependency.name}@${version}`;
};

/**
 * Extract the numeric base score from a CVSS score field.
 * The field can be either a plain number ("7.5") or a CVSS vector
 * string ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N").
 */
const extractCvssScore = (scoreStr: string): number => {
  // Try plain numeric first
  const plain = Number.parseFloat(scoreStr);
  if (!Number.isNaN(plain)) return plain;

  // Parse CVSS vector — extract base score from metric values
  // Use a simplified scoring: count high-impact metrics
  const metrics = scoreStr.split("/");
  let score = 5.0; // default moderate

  for (const m of metrics) {
    if (m === "AV:N") score += 1.0; // network = higher risk
    if (m === "AC:L") score += 0.5; // low complexity
    if (m === "PR:N") score += 0.5; // no privileges
    if (m === "UI:N") score += 0.5; // no user interaction
    if (m === "S:C") score += 0.5; // changed scope
    if (m === "C:H") score += 1.0; // high confidentiality impact
    if (m === "I:H") score += 0.5; // high integrity impact
    if (m === "A:H") score += 0.5; // high availability impact
  }

  return Math.min(10.0, score);
};

const mapSeverity = (vuln: OsvVulnerability): Vulnerability["severity"] => {
  // Try CVSS score first
  const sev = vuln.severity?.[0];
  if (
    sev &&
    (sev.type === "CVSS_V3" || sev.type === "CVSS_V2" || sev.type === "CVSS_V4")
  ) {
    const score = extractCvssScore(sev.score);
    if (score >= 9.0) return "CRITICAL";
    if (score >= 7.0) return "HIGH";
    if (score >= 4.0) return "MODERATE";
    return "LOW";
  }

  // Fall back to database_specific.severity (GitHub Advisory DB)
  const dbSeverity = vuln.database_specific?.severity?.toUpperCase();
  if (dbSeverity === "CRITICAL") return "CRITICAL";
  if (dbSeverity === "HIGH") return "HIGH";
  if (dbSeverity === "MODERATE" || dbSeverity === "MEDIUM") return "MODERATE";
  if (dbSeverity === "LOW") return "LOW";

  return "UNKNOWN";
};

const extractFixedVersion = (vuln: OsvVulnerability): string | undefined => {
  for (const affected of vuln.affected ?? []) {
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) return event.fixed;
      }
    }
  }
  return undefined;
};

/**
 * Fetch full vulnerability details from the individual endpoint.
 * The batch API strips severity data, so we need to follow up.
 */
const fetchVulnDetail = async (
  id: string,
): Promise<OsvVulnerability | undefined> => {
  return fetchJson<OsvVulnerability>(
    `${OSV_VULN_URL}/${encodeURIComponent(id)}`,
  );
};

/**
 * Enrich batch vulnerabilities with full details (severity, affected ranges).
 * Fetches individual vuln details concurrently for all unique vuln IDs.
 */
const enrichVulnerabilities = async (
  batchVulns: Map<string, OsvVulnerability[]>,
): Promise<Map<string, OsvVulnerability[]>> => {
  // Collect all unique vuln IDs
  const allIds = new Set<string>();
  for (const vulns of batchVulns.values()) {
    for (const v of vulns) allIds.add(v.id);
  }

  if (allIds.size === 0) return batchVulns;

  // Fetch full details for all unique IDs
  const detailMap = new Map<string, OsvVulnerability>();
  const ids = [...allIds];
  const details = await mapWithConcurrency(
    ids,
    VULN_DETAIL_CONCURRENCY,
    fetchVulnDetail,
  );
  for (let i = 0; i < ids.length; i++) {
    const detail = details[i];
    if (detail) detailMap.set(ids[i]!, detail);
  }

  // Replace batch vulns with enriched versions
  const enriched = new Map<string, OsvVulnerability[]>();
  for (const [dependencyKey, vulns] of batchVulns) {
    enriched.set(
      dependencyKey,
      vulns.map((v) => detailMap.get(v.id) ?? v),
    );
  }

  return enriched;
};

/**
 * Query OSV.dev for vulnerabilities affecting the given dependencies.
 * Returns a map of dependency lookup key -> vulnerabilities.
 */
export const queryVulnerabilities = async (
  dependencies: readonly Dependency[],
): Promise<Map<string, Vulnerability[]>> => {
  const results = new Map<string, Vulnerability[]>();

  // Build queries
  const queries: Array<{ key: string; query: OsvQuery }> = dependencies.map(
    (dep) => ({
      key: getVulnerabilityLookupKey(dep),
      query: {
        package: {
          name: dep.name,
          ecosystem: ECOSYSTEM_MAP[dep.ecosystem],
        },
        version: dep.resolvedVersion ?? extractBaseVersion(dep.currentVersion),
      },
    }),
  );

  // Collect batch results (minimal data from batch API)
  const batchResults = new Map<string, OsvVulnerability[]>();

  // Process in batches
  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetchWithRetry(OSV_BATCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: batch.map((q) => q.query) }),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as OsvBatchResponse;

      for (let j = 0; j < batch.length; j++) {
        const vulns = data.results[j]?.vulns;
        if (!vulns?.length) continue;

        const dependencyKey = batch[j]!.key;
        const existing = batchResults.get(dependencyKey) ?? [];
        batchResults.set(dependencyKey, [...existing, ...vulns]);
      }
    } catch {
      // Continue scanning even if security check fails for a batch
    }
  }

  // Enrich with full vulnerability details (severity, affected ranges)
  const enrichedResults = await enrichVulnerabilities(batchResults);

  // Map to final Vulnerability type
  for (const [dependencyKey, vulns] of enrichedResults) {
    const mapped: Vulnerability[] = vulns.map((v) => ({
      id: v.id,
      summary: v.summary ?? "No description available",
      severity: mapSeverity(v),
      affectedVersions: v.affected?.[0]?.versions?.join(", ") ?? "unknown",
      fixedVersion: extractFixedVersion(v),
    }));

    results.set(dependencyKey, mapped);
  }

  return results;
};
