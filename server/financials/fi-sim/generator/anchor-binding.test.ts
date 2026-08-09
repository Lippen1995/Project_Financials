import { describe, expect, it } from "vitest";

import type { LiveFinancialLine, LiveFinancialStatement } from "@/server/financials/live-financials-contract";
import { FI_SIM_ANCHOR_BINDINGS, loadReportedAnchors } from "./anchor-binding";

const timestamp = new Date("2026-08-09T00:00:00.000Z");

function line(overrides: Partial<LiveFinancialLine>): LiveFinancialLine {
  return {
    liveLineId: "reported:line-1",
    liveStatementId: "reported:statement-1",
    reportedFinancialLineItemId: "line-1",
    statementType: "INCOME_STATEMENT",
    conceptKey: null,
    sourceLabel: "Sum driftsinntekter",
    metricKey: "total_operating_income",
    value: 1_000n,
    valueOrigin: "reported",
    statementOrigin: "reported",
    financialDatasetVersion: "reported:7",
    taxonomyVersion: null,
    generatorVersion: null,
    currency: "NOK",
    unitScale: 1,
    sortOrder: 10,
    reportedSourceSystem: "BRREG",
    reportedSourceId: "source-1",
    sourceSystem: "BRREG",
    sourceEntityType: "annual-account-line",
    sourceId: "source-1",
    fetchedAt: timestamp,
    normalizedAt: timestamp,
    rawPayload: null,
    derivationRuleId: null,
    ...overrides,
  };
}

function statement(lines: LiveFinancialLine[], fiscalYear = 2025): LiveFinancialStatement {
  return {
    liveStatementId: "reported:statement-1",
    reportedStatementId: "statement-1",
    companyId: "company-1",
    fiscalYear,
    statementScope: "COMPANY",
    statementOrigin: "reported",
    financialDatasetVersion: "reported:7",
    taxonomyVersion: null,
    generatorVersion: null,
    sourceSystem: "BRREG",
    sourceEntityType: "annual-account",
    sourceId: "statement-1",
    fetchedAt: timestamp,
    normalizedAt: timestamp,
    rawPayload: null,
    currency: "NOK",
    unitScale: 1,
    periodStart: null,
    periodEnd: null,
    revenue: 1_000n,
    operatingProfit: 200n,
    netIncome: 150n,
    equity: 600n,
    assets: 1_000n,
    lines,
  };
}

function repositoryReturning(
  statements: LiveFinancialStatement[],
  datasetMode: "reported" | "simulated" = "reported",
) {
  return {
    async getCompaniesFinancials() {
      return {
        datasetMode,
        financialDatasetVersion: (datasetMode === "reported"
          ? "reported:7"
          : "simulated:dataset-1:2") as `reported:${number}`,
        statements,
      };
    },
  };
}

describe("FI-SIM anchor binding", () => {
  it("binds a reported line as a reference, never as a value to copy", async () => {
    const snapshot = await loadReportedAnchors(
      { companyIds: ["company-1"], fiscalYears: [2025], statementScope: "COMPANY" },
      repositoryReturning([statement([line({})])]),
    );

    expect(snapshot.companies.get("company-1")?.anchorsByFiscalYear[2025]).toEqual([
      {
        conceptKey: "OperatingIncomeTotal",
        reportedFinancialLineItemId: "line-1",
        value: 1_000n,
        currency: "NOK",
        unitScale: 1,
      },
    ]);
    expect(snapshot.financialDatasetVersion).toBe("reported:7");
  });

  it("refuses to take anchors from a simulated dataset", async () => {
    await expect(
      loadReportedAnchors(
        { companyIds: ["company-1"], fiscalYears: [2025], statementScope: "COMPANY" },
        repositoryReturning([], "simulated"),
      ),
    ).rejects.toThrow(/reported dataset/i);
  });

  it("leaves a concept unbound when two reported lines both claim it", async () => {
    // Picking one would make the anchor depend on row order, and the other reported figure would
    // silently disappear from a statement that claims to be built on reported anchors.
    const snapshot = await loadReportedAnchors(
      { companyIds: ["company-1"], fiscalYears: [2025], statementScope: "COMPANY" },
      repositoryReturning([
        statement([
          line({}),
          line({ liveLineId: "reported:line-2", reportedFinancialLineItemId: "line-2", value: 900n }),
        ]),
      ]),
    );
    const company = snapshot.companies.get("company-1");

    expect(company?.anchorsByFiscalYear[2025]).toBeUndefined();
    expect(company?.ambiguous).toEqual([
      { fiscalYear: 2025, metricKey: "total_operating_income", count: 2 },
    ]);
  });

  it("skips lines with no metric key, no value or no reported reference", async () => {
    const snapshot = await loadReportedAnchors(
      { companyIds: ["company-1"], fiscalYears: [2025], statementScope: "COMPANY" },
      repositoryReturning([
        statement([
          line({ metricKey: null }),
          line({ liveLineId: "reported:line-2", metricKey: "total_assets", value: null }),
          line({
            liveLineId: "reported:line-3",
            metricKey: "total_equity",
            reportedFinancialLineItemId: null,
          }),
          line({ liveLineId: "reported:line-4", metricKey: "an_unbound_metric" }),
        ]),
      ]),
    );

    expect(snapshot.companies.get("company-1")?.anchorsByFiscalYear).toEqual({});
  });

  it("ignores years the caller did not ask for", async () => {
    const snapshot = await loadReportedAnchors(
      { companyIds: ["company-1"], fiscalYears: [2025], statementScope: "COMPANY" },
      repositoryReturning([statement([line({})], 2019)]),
    );

    expect(snapshot.companies.get("company-1")?.anchorsByFiscalYear).toEqual({});
  });

  it("binds every metric key to a concept that exists and to only one concept", () => {
    const conceptKeys = Object.values(FI_SIM_ANCHOR_BINDINGS);
    expect(new Set(conceptKeys).size).toBe(conceptKeys.length);
    // Guessing which revenue line a company's turnover belongs to is exactly the mistake the
    // profile exists to avoid, so the ambiguous top-line metric stays out of the table.
    expect(FI_SIM_ANCHOR_BINDINGS.revenue).toBeUndefined();
    expect(FI_SIM_ANCHOR_BINDINGS.total_equity_and_liabilities).toBeUndefined();
  });
});
