import { describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { company: { findUnique } } }));

const { getPublishedAnnualReportFinancials } = await import(
  "@/server/financials/published-financials-reader"
);

const timestamp = new Date("2026-08-06T00:00:00.000Z");

function statement(overrides: Record<string, unknown> = {}) {
  return {
    fiscalYear: 2024,
    statementScope: "CONSOLIDATED",
    currency: "NOK",
    revenue: 112_806_000_000n,
    operatingProfit: null,
    netIncome: null,
    equity: null,
    assets: 115_004_000_000n,
    sourceSystem: "BRREG",
    sourceEntityType: "structuredAnnualAccounts",
    sourceId: "journal-1",
    fetchedAt: timestamp,
    normalizedAt: timestamp,
    rawPayload: null,
    ...overrides,
  };
}

function lineItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "li-1",
    filingId: "filing-1",
    fiscalYear: 2024,
    statementType: "INCOME_STATEMENT",
    statementScope: "CONSOLIDATED",
    metricKey: "total_operating_income",
    rawLabel: "Sum driftsinntekter",
    originalLabel: null,
    originalValue: null,
    value: 111_274_000_000n,
    finalInput: 111_274_000_000n,
    currency: "NOK",
    unitScale: 1,
    sourcePage: null,
    sortOrder: 0,
    publicationSource: "MANUAL_REVIEW",
    sourceSystem: null,
    sourceEntityType: null,
    sourceId: null,
    ...overrides,
  };
}

function mockCompany(statements: unknown[], publishedLineItems: unknown[]) {
  findUnique.mockResolvedValue({
    id: "company-1",
    orgNumber: "912609987",
    name: "REITAN AS",
    financialStatements: statements,
    publishedLineItems,
    annualReportFilings: [],
    financialCoverage: null,
  });
}

describe("getPublishedAnnualReportFinancials", () => {
  it("never lets an extracted line item overwrite a Brreg statement's figure", async () => {
    // REITAN's 2024 group revenue read 111,274,000,000 from a MANUAL_REVIEW
    // line item while the registry said 112,806,000,000. The statement still
    // declared sourceSystem BRREG, so the public source gate saw approved
    // provenance carrying extracted numbers.
    mockCompany([statement()], [lineItem()]);

    const result = await getPublishedAnnualReportFinancials("912609987");

    expect(result.statements[0]?.revenue).toBe(112_806_000_000);
    expect(result.statements[0]?.assets).toBe(115_004_000_000);
  });

  it("still applies as-reported values to a non-Brreg statement", async () => {
    // The override exists for extracted statements, where the headline column
    // is derived and the line item is what the filing actually said.
    mockCompany(
      [
        statement({
          sourceSystem: "REACH_SUBSEA_IR",
          sourceEntityType: "annualReportConsolidatedFinancialStatement",
          revenue: 999n,
        }),
      ],
      [lineItem()],
    );

    const result = await getPublishedAnnualReportFinancials("912609987");

    expect(result.statements[0]?.revenue).toBe(111_274_000_000);
  });

  it("reports an honest empty result for an unknown company", async () => {
    findUnique.mockResolvedValue(null);

    const result = await getPublishedAnnualReportFinancials("000000000");

    expect(result.statements).toEqual([]);
    expect(result.availability.available).toBe(false);
  });
});
