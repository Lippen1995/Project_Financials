import { describe, expect, it, vi } from "vitest";

import { BrregFinancialsProvider } from "@/integrations/brreg/brreg-financials-provider";
import type { StructuredAnnualAccounts } from "@/integrations/brreg/structured-regnskap";
import type { NormalizedFinancialStatement } from "@/lib/types";
import {
  applyPublicFinancialSourcePolicy,
  type PublicCompanyFinancials,
} from "@/server/services/public-financials-service";
import {
  createStructuredFinancialsService,
  type StructuredFinancialFetchStateInput,
  type StructuredFinancialFetchStateRecord,
  type StructuredFinancialsRepository,
} from "@/server/services/structured-financials-service";

const now = new Date("2026-07-27T12:00:00.000Z");

function createRepository() {
  const published: StructuredAnnualAccounts[] = [];
  let state: StructuredFinancialFetchStateRecord | null = null;
  const repository: StructuredFinancialsRepository = {
    async loadContext() {
      return {
        companyId: "test-company",
        hasStructuredStatements: published.length > 0,
        latestStatementFetchedAt: published[0]?.fetchedAt ?? null,
        latestStructuredFiscalYear: published[0]?.fiscalYear ?? null,
        state,
      };
    },
    async publish(_companyId, accounts) {
      published.push(accounts);
      return "published";
    },
    async saveFetchState(_companyId, input: StructuredFinancialFetchStateInput) {
      state = input;
    },
  };
  return { repository, published, getState: () => state };
}

function publicFinancials(
  accounts: StructuredAnnualAccounts[],
): PublicCompanyFinancials {
  const statements: NormalizedFinancialStatement[] = accounts.map((account) => ({
    sourceSystem: account.sourceSystem,
    sourceEntityType: account.sourceEntityType,
    sourceId: account.sourceId,
    fetchedAt: account.fetchedAt,
    normalizedAt: account.normalizedAt,
    fiscalYear: account.fiscalYear,
    currency: account.currency,
    statementScope: account.statementScope,
    revenue: account.revenue,
    operatingProfit: account.operatingProfit,
    netIncome: account.netIncome,
    equity: account.equity,
    assets: account.assets,
    rawPayload: {
      modelVersion: account.modelVersion,
      period: account.period,
      amountUnit: account.amountUnit,
      unitScale: account.unitScale,
      canonicalValues: account.canonicalValues,
    },
  }));
  return {
    statements,
    allScopeStatements: statements,
    lineItems: [],
    documents: [],
    availability: { available: statements.length > 0 },
  };
}

describe("structured financials integration chain", () => {
  it("normalizes a provider response, publishes it and exposes only the public contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            journalnr: "test-journal",
            regnskapstype: "SELSKAP",
            avviklingsregnskap: false,
            valuta: "NOK",
            regnskapsperiode: {
              fraDato: "2025-01-01",
              tilDato: "2025-12-31",
            },
            resultatregnskapResultat: {
              driftsresultat: {
                driftsinntekter: { sumDriftsinntekter: 1234 },
                driftsresultat: 234,
              },
              aarsresultat: 200,
            },
            egenkapitalGjeld: { egenkapital: { sumEgenkapital: 500 } },
            eiendeler: { sumEiendeler: 900 },
          },
        ]),
        { status: 200 },
      ),
    );
    const provider = new BrregFinancialsProvider({
      fetch: fetchMock,
      now: () => now,
    });
    const inMemory = createRepository();
    const service = createStructuredFinancialsService({
      repository: inMemory.repository,
      provider,
      now: () => now,
    });

    const ingestion = await service.ensureForCompany("000000000");
    const publicResult = applyPublicFinancialSourcePolicy(
      publicFinancials(inMemory.published),
      true,
    );

    expect(ingestion).toMatchObject({
      status: "AVAILABLE",
      published: 1,
      sourceSystem: "BRREG",
    });
    expect(publicResult.statements[0]).toMatchObject({
      revenue: 1234,
      operatingProfit: 234,
      netIncome: 200,
      equity: 500,
      assets: 900,
      modelVersion: "brreg-structured-annual-accounts@1",
      financialValues: expect.objectContaining({
        total_operating_income: 1234,
      }),
    });
    expect(publicResult.statements[0]?.rawPayload).toBeUndefined();
  });

  it("propagates source-confirmed absence through ingest without publishing fallback data", async () => {
    const provider = new BrregFinancialsProvider({
      fetch: vi.fn().mockResolvedValue(new Response("", { status: 404 })),
      now: () => now,
    });
    const inMemory = createRepository();
    const service = createStructuredFinancialsService({
      repository: inMemory.repository,
      provider,
      now: () => now,
    });

    const ingestion = await service.ensureForCompany("000000000");
    const publicResult = applyPublicFinancialSourcePolicy(
      publicFinancials(inMemory.published),
      true,
    );

    expect(ingestion).toMatchObject({
      status: "UNAVAILABLE",
      available: false,
      published: 0,
    });
    expect(inMemory.getState()).toMatchObject({
      status: "UNAVAILABLE",
      sourceSystem: "BRREG",
    });
    expect(publicResult.statements).toEqual([]);
    expect(publicResult.documents).toEqual([]);
    expect(publicResult.lineItems).toEqual([]);
  });

  it("turns a changed successful source contract into a controlled ingest error", async () => {
    const provider = new BrregFinancialsProvider({
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      ),
      now: () => now,
    });
    const inMemory = createRepository();
    const service = createStructuredFinancialsService({
      repository: inMemory.repository,
      provider,
      now: () => now,
    });

    const ingestion = await service.ensureForCompany("000000000");

    expect(ingestion).toMatchObject({
      status: "ERROR",
      available: false,
      published: 0,
      errorCode: "BRREG_CONTRACT_ERROR",
    });
    expect(inMemory.published).toEqual([]);
  });
});
