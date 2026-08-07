import { describe, expect, it } from "vitest";

import { parseLiveFinancialStatement } from "@/server/financials/live-financials-contract";

function reportedStatement() {
  return {
    liveStatementId: "reported:statement-1",
    reportedStatementId: "statement-1",
    companyId: "company-1",
    fiscalYear: 2025,
    statementScope: "COMPANY",
    statementOrigin: "reported",
    financialDatasetVersion: "reported:14",
    taxonomyVersion: null,
    generatorVersion: null,
    sourceSystem: "BRREG",
    sourceEntityType: "structuredAnnualAccounts",
    sourceId: "journal-1",
    fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
    normalizedAt: new Date("2026-08-06T00:01:00.000Z"),
    rawPayload: { modelVersion: "brreg-structured-annual-accounts@1" },
    currency: "NOK",
    unitScale: 1,
    periodStart: null,
    periodEnd: null,
    revenue: 100n,
    operatingProfit: 20n,
    netIncome: 15n,
    equity: 60n,
    assets: 100n,
    lines: [
      {
        liveLineId: "reported:line-1",
        liveStatementId: "reported:statement-1",
        reportedFinancialLineItemId: "line-1",
        statementType: "INCOME_STATEMENT",
        conceptKey: null,
        sourceLabel: "Sum driftsinntekter",
        metricKey: "total_operating_revenue",
        value: 100n,
        valueOrigin: "reported",
        statementOrigin: "reported",
        financialDatasetVersion: "reported:14",
        taxonomyVersion: null,
        generatorVersion: null,
        currency: "NOK",
        unitScale: 1,
        sortOrder: 10,
        reportedSourceSystem: "brreg",
        reportedSourceId: "source-line-1",
        sourceSystem: "brreg",
        sourceEntityType: "structuredAnnualAccountsLine",
        sourceId: "source-line-1",
        fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
        normalizedAt: new Date("2026-08-06T00:01:00.000Z"),
        rawPayload: null,
        derivationRuleId: null as string | null,
      },
    ],
  };
}

describe("parseLiveFinancialStatement", () => {
  it("accepts a fully reported statement with source-bound IDs", () => {
    expect(parseLiveFinancialStatement(reportedStatement())).toEqual(reportedStatement());
  });

  it("rejects a synthetic line that omits simulation provenance", () => {
    const input = reportedStatement();
    input.liveStatementId = "simulated:statement-1";
    input.reportedStatementId = null as unknown as string;
    input.statementOrigin = "simulated";
    input.financialDatasetVersion = "simulated:dataset-1:2";
    input.lines = [
      {
        ...input.lines[0],
        liveLineId: "simulated:line-1",
        liveStatementId: "simulated:statement-1",
        reportedFinancialLineItemId: null as unknown as string,
        valueOrigin: "synthetic",
        statementOrigin: "simulated",
        financialDatasetVersion: "simulated:dataset-1:2",
        sourceSystem: "FI-SIM",
        sourceEntityType: "simulatedFinancialLine",
        sourceId: "simulated:line-1",
        derivationRuleId: "residual-1",
      },
    ];

    expect(() => parseLiveFinancialStatement(input)).toThrow(/taxonomyVersion/);
  });

  it("rejects a reported statement with a simulated line identity", () => {
    const input = reportedStatement();
    input.lines[0].liveLineId = "simulated:line-1";

    expect(() => parseLiveFinancialStatement(input)).toThrow(/liveLineId/);
  });

  it("accepts a hybrid statement that references its reported anchor", () => {
    const input = {
      ...reportedStatement(),
      liveStatementId: "simulated:statement-2",
      reportedStatementId: null,
      statementOrigin: "hybrid",
      financialDatasetVersion: "simulated:dataset-1:2",
      taxonomyVersion: "FI-SIM-2026.1",
      generatorVersion: "generator-1",
      sourceSystem: "FI-SIM",
      sourceEntityType: "simulatedFinancialStatement",
      sourceId: "simulated:statement-2",
      lines: [
        {
          ...reportedStatement().lines[0],
          liveLineId: "simulated:line-anchor",
          liveStatementId: "simulated:statement-2",
          conceptKey: "OperatingIncomeTotal",
          financialDatasetVersion: "simulated:dataset-1:2",
          taxonomyVersion: "FI-SIM-2026.1",
          generatorVersion: "generator-1",
          statementOrigin: "hybrid",
        },
        {
          liveLineId: "simulated:line-synthetic",
          liveStatementId: "simulated:statement-2",
          reportedFinancialLineItemId: null,
          statementType: "INCOME_STATEMENT",
          conceptKey: "PersonnelExpense",
          sourceLabel: "Personalkostnader",
          metricKey: null,
          value: 40n,
          valueOrigin: "synthetic",
          statementOrigin: "hybrid",
          financialDatasetVersion: "simulated:dataset-1:2",
          taxonomyVersion: "FI-SIM-2026.1",
          generatorVersion: "generator-1",
          currency: "NOK",
          unitScale: 1,
          sortOrder: 20,
          reportedSourceSystem: null,
          reportedSourceId: null,
          sourceSystem: "FI-SIM",
          sourceEntityType: "simulatedFinancialLine",
          sourceId: "simulated:line-synthetic",
          fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
          normalizedAt: new Date("2026-08-06T00:01:00.000Z"),
          rawPayload: { derivationRuleId: "personnel-residual-1" },
          derivationRuleId: "personnel-residual-1",
        },
      ],
    };

    expect(parseLiveFinancialStatement(input).statementOrigin).toBe("hybrid");
  });

  it("rejects reported source metadata on a synthetic line", () => {
    const input = {
      ...reportedStatement(),
      liveStatementId: "simulated:statement-3",
      reportedStatementId: null,
      statementOrigin: "simulated",
      financialDatasetVersion: "simulated:dataset-1:3",
      taxonomyVersion: "FI-SIM-2026.1",
      generatorVersion: "generator-1",
      sourceSystem: "FI-SIM",
      sourceEntityType: "simulatedFinancialStatement",
      sourceId: "simulated:statement-3",
      lines: [
        {
          ...reportedStatement().lines[0],
          liveLineId: "simulated:line-3",
          liveStatementId: "simulated:statement-3",
          reportedFinancialLineItemId: null,
          valueOrigin: "synthetic",
          statementOrigin: "simulated",
          financialDatasetVersion: "simulated:dataset-1:3",
          taxonomyVersion: "FI-SIM-2026.1",
          generatorVersion: "generator-1",
          sourceSystem: "FI-SIM",
          sourceEntityType: "simulatedFinancialLine",
          sourceId: "simulated:line-3",
          derivationRuleId: "residual-1",
        },
      ],
    };

    expect(() => parseLiveFinancialStatement(input)).toThrow(/reportedSourceSystem/);
  });

  it("rejects reported statement provenance on a simulated statement", () => {
    const input = {
      ...reportedStatement(),
      liveStatementId: "simulated:statement-4",
      reportedStatementId: null,
      statementOrigin: "simulated",
      financialDatasetVersion: "simulated:dataset-1:4",
      taxonomyVersion: "FI-SIM-2026.1",
      generatorVersion: "generator-1",
      lines: [],
    };

    expect(() => parseLiveFinancialStatement(input)).toThrow(/sourceSystem/);
  });
});
