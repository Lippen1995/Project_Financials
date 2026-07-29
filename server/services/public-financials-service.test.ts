import { describe, expect, it } from "vitest";

import type { PublicCompanyFinancials } from "@/server/services/public-financials-service";
import { applyPublicFinancialSourcePolicy } from "@/server/services/public-financials-service";

const timestamp = new Date("2026-07-24T00:00:00.000Z");

function sourceRecord(
  sourceEntityType: string,
  fiscalYear: number,
): PublicCompanyFinancials["statements"][number] {
  return {
    fiscalYear,
    statementScope: "COMPANY",
    currency: "NOK",
    revenue: null,
    operatingProfit: null,
    netIncome: null,
    equity: null,
    assets: null,
    sourceSystem: "BRREG",
    sourceEntityType,
    sourceId: `${sourceEntityType}:${fiscalYear}`,
    fetchedAt: timestamp,
    normalizedAt: timestamp,
  };
}

describe("public financial source policy", () => {
  it("keeps structured Brreg statements and removes PDF/OCR surfaces in beta mode", () => {
    const structured = sourceRecord("structuredAnnualAccounts", 2025);
    structured.rawPayload = {
      modelVersion: "brreg-structured-annual-accounts@1",
      period: { from: "2025-01-01", to: "2025-12-31" },
      amountUnit: "WHOLE_CURRENCY_UNITS",
      canonicalValues: { total_operating_income: 1000 },
      entry: { shouldNotReachTheFrontend: true },
    };
    const extracted = sourceRecord("annualReportFinancialStatement", 2024);
    const financials: PublicCompanyFinancials = {
      statements: [structured, extracted],
      allScopeStatements: [structured, extracted],
      lineItems: [
        {
          id: "line",
          filingId: "filing",
          fiscalYear: 2024,
          statementType: "INCOME_STATEMENT",
          statementScope: "COMPANY",
          metricKey: "revenue",
          label: "Driftsinntekter",
          originalValue: null,
          value: null,
          currency: "NOK",
          unitScale: 1,
          sourcePage: null,
          sortOrder: 0,
          publicationSource: "MACHINE_EXTRACTION",
          sourceSystem: "BRREG",
          sourceEntityType: "annualReportLineItem",
          sourceId: "line",
        },
      ],
      documents: [
        {
          year: 2024,
          files: [
            {
              type: "aarsregnskap",
              id: "document",
              label: "Årsregnskap",
              url: "https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/",
            },
          ],
          sourceSystem: "BRREG",
          sourceEntityType: "annualReportDocument",
          sourceId: "document",
          fetchedAt: timestamp,
          normalizedAt: timestamp,
        },
      ],
      availability: { available: true, sourceSystem: "BRREG" },
    };

    const result = applyPublicFinancialSourcePolicy(financials, true);

    expect(result.statements[0]).toMatchObject({
      modelVersion: "brreg-structured-annual-accounts@1",
      period: { from: "2025-01-01", to: "2025-12-31" },
      amountUnit: "WHOLE_CURRENCY_UNITS",
      unitScale: 1,
      financialValues: { total_operating_income: 1000 },
    });
    expect(result.statements[0]?.rawPayload).toBeUndefined();
    expect(result.allScopeStatements[0]?.rawPayload).toBeUndefined();
    expect(result.lineItems).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.availability).toMatchObject({
      available: true,
      sourceSystem: "BRREG",
      sourceEntityType: "structuredAnnualAccounts",
      sourceId: "structuredAnnualAccounts:2025",
      fetchedAt: timestamp,
      normalizedAt: timestamp,
      status: "AVAILABLE",
    });
    expect(result.availability.message).toContain("PDF og OCR brukes ikke som fallback");
  });

  it("returns an honest unavailable state when only extracted statements exist", () => {
    const extracted = sourceRecord("annualReportFinancialStatement", 2024);
    const result = applyPublicFinancialSourcePolicy(
      {
        statements: [extracted],
        allScopeStatements: [extracted],
        lineItems: [],
        documents: [],
        availability: { available: true, sourceSystem: "BRREG" },
      },
      true,
    );

    expect(result.statements).toEqual([]);
    expect(result.allScopeStatements).toEqual([]);
    expect(result.availability.available).toBe(false);
    expect(result.availability.message).toContain("ikke tilgjengelige");
  });

  it("preserves the existing public result when structured-only mode is disabled", () => {
    const extracted = sourceRecord("annualReportFinancialStatement", 2024);
    const financials: PublicCompanyFinancials = {
      statements: [extracted],
      allScopeStatements: [extracted],
      lineItems: [],
      documents: [],
      availability: { available: true, sourceSystem: "BRREG" },
    };

    expect(applyPublicFinancialSourcePolicy(financials, false)).toBe(financials);
  });
});
