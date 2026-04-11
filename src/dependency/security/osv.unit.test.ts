import { beforeEach, describe, expect, it, vi } from "bun:test";
import type { Dependency } from "../types";

const mockFetchWithRetry = vi.fn();
const mockFetchJson = vi.fn();

vi.mock("../utils/http.js", () => ({
  fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

const { getVulnerabilityLookupKey, queryVulnerabilities } = await import(
  "./osv.js"
);

const makeDep = (name: string, version = "1.0.0"): Dependency => ({
  name,
  currentVersion: version,
  ecosystem: "npm",
  manifestPath: "package.json",
  isDev: false,
  isOptional: false,
});

const getLookup = (name: string, version = "1.0.0") =>
  getVulnerabilityLookupKey(makeDep(name, version));

const okResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

const notOkResponse = (): Response =>
  ({
    ok: false,
    status: 500,
    json: () => Promise.resolve({}),
  }) as unknown as Response;

beforeEach(() => {
  mockFetchWithRetry.mockReset();
  mockFetchJson.mockReset();
  // By default, enrichment returns the same data (no extra details)
  mockFetchJson.mockResolvedValue(undefined);
});

describe("queryVulnerabilities", () => {
  it("returns empty map when no vulnerabilities found", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({ results: [{ vulns: [] }, {}] }),
    );

    const deps = [makeDep("safe-pkg"), makeDep("another-safe")];
    const result = await queryVulnerabilities(deps);

    expect(result.size).toBe(0);
  });

  it("maps CVSS_V3 score >= 9.0 to CRITICAL via enrichment", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-1" }],
          },
        ],
      }),
    );

    // Enrichment returns full details
    mockFetchJson.mockResolvedValueOnce({
      id: "GHSA-1",
      summary: "Critical issue",
      severity: [{ type: "CVSS_V3", score: "9.5" }],
    });

    const result = await queryVulnerabilities([makeDep("vuln-pkg")]);
    const vulns = result.get(getLookup("vuln-pkg"));

    expect(vulns).toHaveLength(1);
    expect(vulns![0]!.severity).toBe("CRITICAL");
    expect(vulns![0]!.id).toBe("GHSA-1");
  });

  it("maps CVSS_V3 score >= 7.0 to HIGH", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-2" }],
          },
        ],
      }),
    );

    mockFetchJson.mockResolvedValueOnce({
      id: "GHSA-2",
      severity: [{ type: "CVSS_V3", score: "7.5" }],
    });

    const result = await queryVulnerabilities([makeDep("high-pkg")]);
    expect(result.get(getLookup("high-pkg"))![0]!.severity).toBe("HIGH");
  });

  it("maps CVSS_V3 score >= 4.0 to MODERATE", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-3" }],
          },
        ],
      }),
    );

    mockFetchJson.mockResolvedValueOnce({
      id: "GHSA-3",
      severity: [{ type: "CVSS_V3", score: "5.0" }],
    });

    const result = await queryVulnerabilities([makeDep("mod-pkg")]);
    expect(result.get(getLookup("mod-pkg"))![0]!.severity).toBe("MODERATE");
  });

  it("maps CVSS_V3 score < 4.0 to LOW", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-4" }],
          },
        ],
      }),
    );

    mockFetchJson.mockResolvedValueOnce({
      id: "GHSA-4",
      severity: [{ type: "CVSS_V3", score: "2.0" }],
    });

    const result = await queryVulnerabilities([makeDep("low-pkg")]);
    expect(result.get(getLookup("low-pkg"))![0]!.severity).toBe("LOW");
  });

  it("maps CVSS_V4 vector string to severity", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-V4" }],
          },
        ],
      }),
    );

    mockFetchJson.mockResolvedValueOnce({
      id: "GHSA-V4",
      severity: [
        {
          type: "CVSS_V4",
          score: "CVSS:4.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
        },
      ],
    });

    const result = await queryVulnerabilities([makeDep("v4-pkg")]);
    // AV:N(+1) + AC:L(+0.5) + PR:N(+0.5) + UI:N(+0.5) + C:H(+1) + I:H(+0.5) + A:H(+0.5) = 5+4.5 = 9.5
    expect(result.get(getLookup("v4-pkg"))![0]!.severity).toBe("CRITICAL");
  });

  it("falls back to database_specific.severity", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-DB" }],
          },
        ],
      }),
    );

    mockFetchJson.mockResolvedValueOnce({
      id: "GHSA-DB",
      summary: "DB severity",
      database_specific: { severity: "MODERATE" },
    });

    const result = await queryVulnerabilities([makeDep("db-pkg")]);
    expect(result.get(getLookup("db-pkg"))![0]!.severity).toBe("MODERATE");
  });

  it("falls back to database_specific.severity MEDIUM as MODERATE", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-MED" }],
          },
        ],
      }),
    );

    mockFetchJson.mockResolvedValueOnce({
      id: "GHSA-MED",
      database_specific: { severity: "MEDIUM" },
    });

    const result = await queryVulnerabilities([makeDep("med-pkg")]);
    expect(result.get(getLookup("med-pkg"))![0]!.severity).toBe("MODERATE");
  });

  it("returns UNKNOWN when enrichment fails", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-5", summary: "No severity" }],
          },
        ],
      }),
    );

    // fetchJson returns undefined (enrichment failed)
    mockFetchJson.mockResolvedValueOnce(undefined);

    const result = await queryVulnerabilities([makeDep("unk-pkg")]);
    expect(result.get(getLookup("unk-pkg"))![0]!.severity).toBe("UNKNOWN");
  });

  it("handles batch chunking for more than 1000 dependencies", async () => {
    const deps = Array.from({ length: 1500 }, (_, i) =>
      makeDep(`pkg-${i}`, "1.0.0"),
    );

    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: Array.from({ length: 1000 }, () => ({})),
      }),
    );
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: Array.from({ length: 500 }, () => ({})),
      }),
    );

    const result = await queryVulnerabilities(deps);

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(0);

    const firstCallBody = JSON.parse(
      mockFetchWithRetry.mock.calls[0]![1]!.body as string,
    );
    expect(firstCallBody.queries).toHaveLength(1000);

    const secondCallBody = JSON.parse(
      mockFetchWithRetry.mock.calls[1]![1]!.body as string,
    );
    expect(secondCallBody.queries).toHaveLength(500);
  });

  it("continues scanning if API returns non-OK status", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(notOkResponse());

    const result = await queryVulnerabilities([makeDep("fail-pkg")]);
    expect(result.size).toBe(0);
  });

  it("continues scanning if fetch throws an error", async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new Error("Network failure"));

    const result = await queryVulnerabilities([makeDep("error-pkg")]);
    expect(result.size).toBe(0);
  });

  it("extracts fixedVersion from enriched vulnerability", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-6" }],
          },
        ],
      }),
    );

    mockFetchJson.mockResolvedValueOnce({
      id: "GHSA-6",
      summary: "Has fix",
      severity: [{ type: "CVSS_V3", score: "8.0" }],
      affected: [
        {
          ranges: [
            {
              events: [{ introduced: "0" }, { fixed: "2.1.0" }],
            },
          ],
          versions: ["1.0.0", "1.5.0", "2.0.0"],
        },
      ],
    });

    const result = await queryVulnerabilities([makeDep("fix-pkg")]);
    const vulns = result.get(getLookup("fix-pkg"))!;

    expect(vulns).toHaveLength(1);
    expect(vulns[0]!.fixedVersion).toBe("2.1.0");
    expect(vulns[0]!.affectedVersions).toBe("1.0.0, 1.5.0, 2.0.0");
  });

  it("uses default summary when none is provided", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-8" }],
          },
        ],
      }),
    );

    mockFetchJson.mockResolvedValueOnce(undefined);

    const result = await queryVulnerabilities([makeDep("no-summary")]);
    expect(result.get(getLookup("no-summary"))![0]!.summary).toBe(
      "No description available",
    );
  });

  it("deduplicates enrichment fetches for same vuln ID across deps", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          { vulns: [{ id: "SHARED-1" }] },
          { vulns: [{ id: "SHARED-1" }] },
        ],
      }),
    );

    mockFetchJson.mockResolvedValueOnce({
      id: "SHARED-1",
      summary: "Shared vuln",
      severity: [{ type: "CVSS_V3", score: "8.0" }],
    });

    const result = await queryVulnerabilities([
      makeDep("pkg-a"),
      makeDep("pkg-b"),
    ]);

    // Only one fetch for the shared vuln ID
    expect(mockFetchJson).toHaveBeenCalledTimes(1);
    expect(result.get(getLookup("pkg-a"))![0]!.severity).toBe("HIGH");
    expect(result.get(getLookup("pkg-b"))![0]!.severity).toBe("HIGH");
  });

  it("keeps vulnerability results isolated per dependency version", async () => {
    const oldDep = makeDep("shared-pkg", "1.0.0");
    const newDep = makeDep("shared-pkg", "2.0.0");

    mockFetchWithRetry.mockResolvedValueOnce(
      okResponse({
        results: [
          {
            vulns: [{ id: "GHSA-OLD" }],
          },
          {},
        ],
      }),
    );

    mockFetchJson.mockResolvedValueOnce({
      id: "GHSA-OLD",
      severity: [{ type: "CVSS_V3", score: "9.0" }],
    });

    const result = await queryVulnerabilities([oldDep, newDep]);

    expect(result.get(getVulnerabilityLookupKey(oldDep))).toHaveLength(1);
    expect(result.get(getVulnerabilityLookupKey(newDep))).toBeUndefined();
  });
});
