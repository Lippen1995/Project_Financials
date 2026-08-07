import { describe, expect, it } from "vitest";

import {
  companyUniverseQuerySchema,
  rankScreenedCompanies,
  screenCompanyUniverse,
  type CompanyUniverseCandidate,
} from "./company-analysis-domain";

function candidate(
  orgNumber: string,
  overrides: Partial<CompanyUniverseCandidate> = {},
): CompanyUniverseCandidate {
  return {
    orgNumber,
    name: `Company ${orgNumber}`,
    legalForm: "AS",
    status: "ACTIVE",
    naceCode: "62.010",
    municipalityNumber: "0301",
    employeeCount: 20,
    companySource: {
      sourceSystem: "BRREG",
      sourceEntityType: "company",
      sourceId: orgNumber,
      fetchedAt: "2026-07-27T00:00:00.000Z",
      normalizedAt: "2026-07-27T00:00:00.000Z",
    },
    financials: {
      fiscalYear: 2024,
      revenue: 100_000_000,
      operatingProfit: 10_000_000,
      operatingMarginBps: 1_000,
      statementOrigin: "reported",
      financialDatasetVersion: "reported:21",
      source: {
        sourceSystem: "BRREG",
        sourceEntityType: "annual-account",
        sourceId: `statement-${orgNumber}`,
        fetchedAt: "2026-07-27T00:00:00.000Z",
        normalizedAt: "2026-07-27T00:00:00.000Z",
      },
    },
    ...overrides,
  };
}

describe("company analysis domain", () => {
  it("validates a versioned universe query and rejects inverted thresholds", () => {
    const parsed = companyUniverseQuerySchema.safeParse({
      version: "company-universe-v1",
      workflow: "MNA_SCREENING",
      statuses: ["ACTIVE"],
      minRevenue: 200,
      maxRevenue: 100,
      missingDataPolicy: "INCLUDE_WITH_GAP",
      limit: 100,
    });

    expect(parsed.success).toBe(false);
  });

  it("keeps missing financials as a visible gap instead of treating them as zero", () => {
    const query = companyUniverseQuerySchema.parse({
      version: "company-universe-v1",
      workflow: "SOURCING",
      statuses: ["ACTIVE"],
      minRevenue: 50_000_000,
      missingDataPolicy: "INCLUDE_WITH_GAP",
      limit: 100,
    });
    const result = screenCompanyUniverse([
      candidate("100000001"),
      candidate("100000002", { financials: null }),
      candidate("100000003", {
        financials: {
          ...candidate("100000003").financials!,
          revenue: 10_000_000,
        },
      }),
    ], query);

    expect(result.included.map((row) => row.orgNumber)).toEqual(["100000001", "100000002"]);
    expect(result.included[1].dataGaps).toContain("REVENUE_NOT_AVAILABLE");
    expect(result.excluded[0]).toMatchObject({
      orgNumber: "100000003",
      reasons: ["REVENUE_BELOW_MINIMUM"],
      sourceBasis: [
        expect.objectContaining({ sourceEntityType: "company" }),
        expect.objectContaining({ sourceEntityType: "annual-account" }),
      ],
    });
  });

  it("ranks deterministically with an auditable calculation trace and no missing-data penalty", () => {
    const rows = [
      candidate("100000001", { employeeCount: 10 }),
      candidate("100000002", {
        employeeCount: 30,
        financials: {
          ...candidate("100000002").financials!,
          revenue: 200_000_000,
          operatingProfit: 10_000_000,
          operatingMarginBps: 500,
        },
      }),
      candidate("100000003", { employeeCount: null, financials: null }),
    ].map((company) => ({ ...company, inclusionReasons: ["MATCHED"], dataGaps: [] }));

    const criteria = [
      { metric: "REVENUE" as const, direction: "HIGHER_BETTER" as const, weight: 60 },
      { metric: "OPERATING_MARGIN_BPS" as const, direction: "HIGHER_BETTER" as const, weight: 40 },
    ];
    const first = rankScreenedCompanies(rows, criteria);
    const second = rankScreenedCompanies([...rows].reverse(), criteria);

    expect(first).toEqual(second);
    expect(first.map((row) => row.orgNumber)).toEqual([
      "100000002",
      "100000001",
      "100000003",
    ]);
    expect(first[0]).toMatchObject({
      rank: 1,
      calculationVersion: "company-ranking-v1",
      fiscalYear: 2024,
      coveragePercent: 100,
    });
    expect(first[2]).toMatchObject({
      score: null,
      coveragePercent: 0,
      dataGaps: expect.arrayContaining(["RANKING_DATA_NOT_AVAILABLE"]),
    });
  });
});
