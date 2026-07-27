import { describe, expect, it, vi } from "vitest";

import type { StructuredAnnualAccountsResult } from "@/integrations/brreg/brreg-financials-provider";
import type { StructuredAnnualAccounts } from "@/integrations/brreg/structured-regnskap";
import {
  createStructuredFinancialsService,
  type StructuredFinancialsRepository,
} from "@/server/services/structured-financials-service";

const now = new Date("2026-07-27T10:00:00.000Z");
const sourceMetadata = {
  sourceSystem: "BRREG",
  sourceEntityType: "structuredAnnualAccountsResponse",
  sourceId: "000000000",
  fetchedAt: now,
  normalizedAt: now,
  rawPayload: { httpStatus: 200 },
};

function account(): StructuredAnnualAccounts {
  return {
    sourceSystem: "BRREG",
    sourceEntityType: "structuredAnnualAccounts",
    sourceId: "journal-test",
    fetchedAt: now,
    normalizedAt: now,
    rawPayload: {},
    modelVersion: "brreg-structured-annual-accounts@1",
    fiscalYear: 2025,
    period: { from: "2025-01-01", to: "2025-12-31" },
    statementScope: "COMPANY",
    currency: "NOK",
    amountUnit: "WHOLE_CURRENCY_UNITS",
    unitScale: 1,
    isLiquidationAccounts: false,
    isParentCompany: false,
    oppstillingsplan: "store",
    journalnr: "journal-test",
    sourceEntryId: 1,
    revenue: 1000,
    operatingProfit: 100,
    netIncome: 80,
    equity: 400,
    assets: 900,
    canonicalValues: { total_operating_income: 1000 },
  };
}

function result(
  overrides: Partial<StructuredAnnualAccountsResult> = {},
): StructuredAnnualAccountsResult {
  return {
    ...sourceMetadata,
    status: "AVAILABLE",
    accounts: [account()],
    unavailableReason: null,
    ...overrides,
  };
}

function repository(
  context: Awaited<ReturnType<StructuredFinancialsRepository["loadContext"]>>,
): StructuredFinancialsRepository {
  return {
    loadContext: vi.fn().mockResolvedValue(context),
    publish: vi.fn().mockResolvedValue("published"),
    saveFetchState: vi.fn().mockResolvedValue(undefined),
  };
}

describe("structured financials service", () => {
  it("uses a fresh availability cache without contacting Brreg again", async () => {
    const repo = repository({
      companyId: "company-test",
      hasStructuredStatements: true,
      latestStatementFetchedAt: now,
      state: {
        status: "AVAILABLE",
        unavailableReason: null,
        nextCheckAt: new Date("2026-07-28T10:00:00.000Z"),
        failureCount: 0,
        latestFiscalYear: 2025,
        lastErrorCode: null,
        ...sourceMetadata,
      },
    });
    const provider = { fetchStructuredAnnualAccounts: vi.fn() };
    const service = createStructuredFinancialsService({
      repository: repo,
      provider,
      now: () => now,
    });

    const ingestion = await service.ensureForCompany("000000000");

    expect(ingestion).toMatchObject({
      status: "AVAILABLE",
      available: true,
      fromCache: true,
      fiscalYears: [2025],
    });
    expect(provider.fetchStructuredAnnualAccounts).not.toHaveBeenCalled();
    expect(repo.publish).not.toHaveBeenCalled();
  });

  it("publishes real accounts and records a 24-hour refresh boundary", async () => {
    const repo = repository({
      companyId: "company-test",
      hasStructuredStatements: false,
      latestStatementFetchedAt: null,
      state: null,
    });
    const provider = { fetchStructuredAnnualAccounts: vi.fn().mockResolvedValue(result()) };
    const service = createStructuredFinancialsService({
      repository: repo,
      provider,
      now: () => now,
    });

    const ingestion = await service.ensureForCompany("000000000");

    expect(ingestion).toMatchObject({
      status: "AVAILABLE",
      available: true,
      fromCache: false,
      published: 1,
      fiscalYears: [2025],
    });
    expect(repo.publish).toHaveBeenCalledWith("company-test", account());
    expect(repo.saveFetchState).toHaveBeenCalledWith(
      "company-test",
      expect.objectContaining({
        status: "AVAILABLE",
        nextCheckAt: new Date("2026-07-28T10:00:00.000Z"),
        latestFiscalYear: 2025,
        failureCount: 0,
        sourceSystem: "BRREG",
      }),
    );
  });

  it("deduplicates simultaneous read-through fetches for the same company", async () => {
    const repo = repository({
      companyId: "company-test",
      hasStructuredStatements: false,
      latestStatementFetchedAt: null,
      state: null,
    });
    const provider = {
      fetchStructuredAnnualAccounts: vi.fn().mockResolvedValue(result()),
    };
    const service = createStructuredFinancialsService({
      repository: repo,
      provider,
      now: () => now,
    });

    const [first, second] = await Promise.all([
      service.ensureForCompany("000000000"),
      service.ensureForCompany("000000000"),
    ]);

    expect(first).toEqual(second);
    expect(provider.fetchStructuredAnnualAccounts).toHaveBeenCalledTimes(1);
    expect(repo.publish).toHaveBeenCalledTimes(1);
  });

  it("caches a source-confirmed empty state without publishing values", async () => {
    const repo = repository({
      companyId: "company-test",
      hasStructuredStatements: false,
      latestStatementFetchedAt: null,
      state: null,
    });
    const provider = {
      fetchStructuredAnnualAccounts: vi.fn().mockResolvedValue(
        result({
          status: "UNAVAILABLE",
          accounts: [],
          unavailableReason: "HTTP 404: ingen regnskap",
        }),
      ),
    };
    const service = createStructuredFinancialsService({
      repository: repo,
      provider,
      now: () => now,
    });

    const ingestion = await service.ensureForCompany("000000000");

    expect(ingestion).toMatchObject({
      status: "UNAVAILABLE",
      available: false,
      unavailableReason: "HTTP 404: ingen regnskap",
    });
    expect(repo.publish).not.toHaveBeenCalled();
    expect(repo.saveFetchState).toHaveBeenCalledWith(
      "company-test",
      expect.objectContaining({
        status: "UNAVAILABLE",
        nextCheckAt: new Date("2026-08-03T10:00:00.000Z"),
      }),
    );
  });

  it("keeps the last official snapshot as stale when Brreg is temporarily down", async () => {
    const repo = repository({
      companyId: "company-test",
      hasStructuredStatements: true,
      latestStatementFetchedAt: new Date("2026-07-20T10:00:00.000Z"),
      state: {
        status: "AVAILABLE",
        unavailableReason: null,
        nextCheckAt: new Date("2026-07-26T10:00:00.000Z"),
        failureCount: 0,
        latestFiscalYear: 2025,
        lastErrorCode: null,
        ...sourceMetadata,
      },
    });
    const provider = {
      fetchStructuredAnnualAccounts: vi
        .fn()
        .mockRejectedValue(new Error("Failed to fetch structured annual accounts: 503")),
    };
    const service = createStructuredFinancialsService({
      repository: repo,
      provider,
      now: () => now,
    });

    const ingestion = await service.ensureForCompany("000000000");

    expect(ingestion).toMatchObject({
      status: "STALE",
      available: true,
      fromCache: true,
      errorCode: "BRREG_UNAVAILABLE",
      fiscalYears: [2025],
    });
    expect(repo.saveFetchState).toHaveBeenCalledWith(
      "company-test",
      expect.objectContaining({
        status: "ERROR",
        failureCount: 1,
        lastErrorCode: "BRREG_UNAVAILABLE",
        nextCheckAt: new Date("2026-07-27T10:15:00.000Z"),
      }),
    );
  });

  it("returns a controlled error without inventing values when no snapshot exists", async () => {
    const repo = repository({
      companyId: "company-test",
      hasStructuredStatements: false,
      latestStatementFetchedAt: null,
      state: null,
    });
    const provider = {
      fetchStructuredAnnualAccounts: vi
        .fn()
        .mockRejectedValue(new Error("network unavailable")),
    };
    const service = createStructuredFinancialsService({
      repository: repo,
      provider,
      now: () => now,
    });

    const ingestion = await service.ensureForCompany("000000000");

    expect(ingestion).toMatchObject({
      status: "ERROR",
      available: false,
      fromCache: false,
      fiscalYears: [],
      errorCode: "BRREG_UNAVAILABLE",
    });
    expect(repo.publish).not.toHaveBeenCalled();
  });
});
