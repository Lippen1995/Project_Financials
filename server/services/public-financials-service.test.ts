import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicCompanyFinancials } from "@/server/services/public-financials-service";
import {
  applyPublicFinancialSourcePolicy,
  getPublicCompanyFinancials,
} from "@/server/services/public-financials-service";

const timestamp = new Date("2026-07-24T00:00:00.000Z");

vi.mock("@/lib/env", () => ({
  default: { betaStructuredFinancialsOnly: true },
}));

const getPublishedAnnualReportFinancials = vi.fn();
const readStructuredFinancialsState = vi.fn();
const ensureStructuredFinancialsForCompany = vi.fn();
const enqueueStructuredFinancialsFetch = vi.fn();

vi.mock("@/server/financials/published-financials-reader", () => ({
  getPublishedAnnualReportFinancials: (orgNumber: string) =>
    getPublishedAnnualReportFinancials(orgNumber),
}));

vi.mock("@/server/services/structured-financials-service", () => ({
  readStructuredFinancialsState: (orgNumber: string) =>
    readStructuredFinancialsState(orgNumber),
  ensureStructuredFinancialsForCompany: (orgNumber: string) =>
    ensureStructuredFinancialsForCompany(orgNumber),
}));

vi.mock("@/server/services/structured-financials-queue-service", () => ({
  STRUCTURED_FETCH_STATUS_PENDING: "PENDING",
  enqueueStructuredFinancialsFetch: (orgNumber: string) =>
    enqueueStructuredFinancialsFetch(orgNumber),
}));

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

  it("keeps the Brreg statement when a non-Brreg consolidated row shares the year", () => {
    // getHeadlineFinancialStatements picks one statement per year and prefers
    // CONSOLIDATED. A company with an outside consolidated statement and a Brreg
    // company statement for the same year therefore had the outside row win the
    // year, only to be filtered out here — reporting "not available" for a
    // company whose official Brreg figures we held. Hit four real companies,
    // among them NORGESGRUPPEN, REITAN and REACH SUBSEA.
    const brregCompany = sourceRecord("structuredAnnualAccounts", 2024);
    brregCompany.rawPayload = { canonicalValues: { total_assets: 881938000 } };
    const outsideConsolidated = sourceRecord("annualReportConsolidatedFinancialStatement", 2024);
    outsideConsolidated.statementScope = "CONSOLIDATED";
    outsideConsolidated.sourceSystem = "REACH_SUBSEA_IR";

    const result = applyPublicFinancialSourcePolicy(
      {
        // Mirrors the reader: `statements` is already deduped with the
        // consolidated row winning 2024.
        statements: [outsideConsolidated],
        allScopeStatements: [outsideConsolidated, brregCompany],
        lineItems: [],
        documents: [],
        availability: { available: true, sourceSystem: "BRREG" },
      },
      true,
    );

    expect(result.availability.available).toBe(true);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]).toMatchObject({
      fiscalYear: 2024,
      statementScope: "COMPANY",
      sourceEntityType: "structuredAnnualAccounts",
    });
  });

  it("still prefers consolidated when Brreg supplies both scopes for a year", () => {
    const company = sourceRecord("structuredAnnualAccounts", 2024);
    const consolidated = sourceRecord("structuredAnnualAccounts", 2024);
    consolidated.statementScope = "CONSOLIDATED";

    const result = applyPublicFinancialSourcePolicy(
      {
        statements: [consolidated],
        allScopeStatements: [company, consolidated],
        lineItems: [],
        documents: [],
        availability: { available: true, sourceSystem: "BRREG" },
      },
      true,
    );

    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]?.statementScope).toBe("CONSOLIDATED");
    expect(result.allScopeStatements).toHaveLength(2);
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

function emptyPublished(): PublicCompanyFinancials {
  return {
    statements: [],
    allScopeStatements: [],
    lineItems: [],
    documents: [],
    availability: { available: false, sourceSystem: "BRREG" },
  };
}

function publishedWithStructured(): PublicCompanyFinancials {
  const structured = sourceRecord("structuredAnnualAccounts", 2025);
  return {
    statements: [structured],
    allScopeStatements: [structured],
    lineItems: [],
    documents: [],
    availability: { available: true, sourceSystem: "BRREG" },
  };
}

function fetchState(overrides: Record<string, unknown> = {}) {
  return {
    companyId: "company-1",
    hasStructuredStatements: false,
    latestStatementFetchedAt: null,
    latestStructuredFiscalYear: null,
    state: {
      status: "UNAVAILABLE",
      unavailableReason: "Strukturert regnskap er ikke tilgjengelig.",
      nextCheckAt: timestamp,
      failureCount: 0,
      latestFiscalYear: null,
      lastErrorCode: null,
      sourceSystem: "BRREG",
      sourceEntityType: "structuredAnnualAccounts",
      sourceId: "912345678",
      fetchedAt: timestamp,
      normalizedAt: timestamp,
      ...overrides,
    },
  };
}

describe("getPublicCompanyFinancials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueStructuredFinancialsFetch.mockResolvedValue("queued");
  });

  it("never calls the read-through Brreg fetch from the request path", async () => {
    getPublishedAnnualReportFinancials.mockResolvedValue(emptyPublished());
    readStructuredFinancialsState.mockResolvedValue(null);

    await getPublicCompanyFinancials("912345678");

    expect(ensureStructuredFinancialsForCompany).not.toHaveBeenCalled();
  });

  it("enqueues and reports PENDING when the company has never been fetched", async () => {
    getPublishedAnnualReportFinancials.mockResolvedValue(emptyPublished());
    readStructuredFinancialsState.mockResolvedValue(null);

    const result = await getPublicCompanyFinancials("912345678");

    expect(enqueueStructuredFinancialsFetch).toHaveBeenCalledWith("912345678");
    expect(result.availability.status).toBe("PENDING");
    expect(result.availability.available).toBe(false);
    expect(result.availability.message).toContain("ikke lastet inn i databasen");
    expect(result.statements).toEqual([]);
  });

  it("reports PENDING without re-enqueueing a company already in the queue", async () => {
    getPublishedAnnualReportFinancials.mockResolvedValue(emptyPublished());
    readStructuredFinancialsState.mockResolvedValue(fetchState({ status: "PENDING" }));

    const result = await getPublicCompanyFinancials("912345678");

    expect(enqueueStructuredFinancialsFetch).not.toHaveBeenCalled();
    expect(result.availability.status).toBe("PENDING");
  });

  it("distinguishes an honest empty source from a queued company", async () => {
    getPublishedAnnualReportFinancials.mockResolvedValue(emptyPublished());
    readStructuredFinancialsState.mockResolvedValue(fetchState({ status: "UNAVAILABLE" }));

    const result = await getPublicCompanyFinancials("912345678");

    expect(enqueueStructuredFinancialsFetch).not.toHaveBeenCalled();
    expect(result.availability.status).toBe("UNAVAILABLE");
    expect(result.availability.message).toContain("ikke tilgjengelig");
  });

  it("never leaks a raw transport reason into user-facing copy", async () => {
    getPublishedAnnualReportFinancials.mockResolvedValue(emptyPublished());
    readStructuredFinancialsState.mockResolvedValue(
      fetchState({ status: "UNAVAILABLE", unavailableReason: "HTTP 404: ingen regnskap" }),
    );

    const result = await getPublicCompanyFinancials("912345678");

    expect(result.availability.message).not.toContain("HTTP");
    expect(result.availability.message).not.toContain("404");
    expect(result.availability.message).toContain("ikke tilgjengelige");
  });

  it("surfaces a reason that genuinely explains the gap to a user", async () => {
    getPublishedAnnualReportFinancials.mockResolvedValue(emptyPublished());
    readStructuredFinancialsState.mockResolvedValue(
      fetchState({
        status: "UNAVAILABLE",
        unavailableReason: "Bare avviklingsregnskap er tilgjengelig.",
      }),
    );

    const result = await getPublicCompanyFinancials("912345678");

    expect(result.availability.message).toContain("Avviklingsregnskap");
  });

  it("serves stored numbers as AVAILABLE without enqueueing", async () => {
    getPublishedAnnualReportFinancials.mockResolvedValue(publishedWithStructured());
    readStructuredFinancialsState.mockResolvedValue(fetchState({ status: "AVAILABLE" }));

    const result = await getPublicCompanyFinancials("912345678");

    expect(enqueueStructuredFinancialsFetch).not.toHaveBeenCalled();
    expect(result.availability.status).toBe("AVAILABLE");
    expect(result.statements).toHaveLength(1);
  });

  it("marks stored numbers STALE when the last fetch errored", async () => {
    getPublishedAnnualReportFinancials.mockResolvedValue(publishedWithStructured());
    readStructuredFinancialsState.mockResolvedValue(
      fetchState({ status: "ERROR", lastErrorCode: "BRREG_UNAVAILABLE" }),
    );

    const result = await getPublicCompanyFinancials("912345678");

    expect(result.availability.status).toBe("STALE");
    expect(result.availability.available).toBe(true);
    expect(result.statements).toHaveLength(1);
  });

  it("reports ERROR when the fetch failed and no numbers are stored", async () => {
    getPublishedAnnualReportFinancials.mockResolvedValue(emptyPublished());
    readStructuredFinancialsState.mockResolvedValue(
      fetchState({ status: "ERROR", lastErrorCode: "BRREG_UNAVAILABLE" }),
    );

    const result = await getPublicCompanyFinancials("912345678");

    expect(result.availability.status).toBe("ERROR");
    expect(result.availability.available).toBe(false);
    expect(result.statements).toEqual([]);
  });
});
