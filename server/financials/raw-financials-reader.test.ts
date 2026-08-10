import { describe, expect, it, vi } from "vitest";

import {
  SIMULATED_EXPORT_DISCLAIMER,
  SIMULATED_FINANCIALS_NOTICE,
} from "@/lib/financial-simulation-disclosure";
import { createRawFinancialsReader } from "./raw-financials-reader";

const observedAt = new Date("2026-08-07T00:00:00.000Z");

function reportedSnapshot() {
  return {
    datasetMode: "reported" as const,
    financialDatasetVersion: "reported:24" as const,
    statements: [{
      liveStatementId: "reported:statement-1",
      reportedStatementId: "statement-1",
      companyId: "company-1",
      fiscalYear: 2025,
      statementScope: "COMPANY" as const,
      statementOrigin: "reported" as const,
      financialDatasetVersion: "reported:24" as const,
      taxonomyVersion: null,
      generatorVersion: null,
      sourceSystem: "BRREG",
      sourceEntityType: "structuredAnnualAccounts",
      sourceId: "statement-source-1",
      fetchedAt: observedAt,
      normalizedAt: observedAt,
      rawPayload: null,
      currency: "NOK",
      unitScale: 1,
      periodStart: new Date("2025-01-01T00:00:00.000Z"),
      periodEnd: new Date("2025-12-31T00:00:00.000Z"),
      revenue: 100n,
      operatingProfit: 20n,
      netIncome: 15n,
      equity: 60n,
      assets: 100n,
      lines: [{
        liveLineId: "reported:line-1",
        liveStatementId: "reported:statement-1",
        reportedFinancialLineItemId: "line-1",
        statementType: "INCOME_STATEMENT" as const,
        conceptKey: null,
        sourceLabel: "Sum driftsinntekter",
        metricKey: "total_operating_revenue",
        value: 100n,
        valueOrigin: "reported" as const,
        statementOrigin: "reported" as const,
        financialDatasetVersion: "reported:24" as const,
        taxonomyVersion: null,
        generatorVersion: null,
        currency: "NOK",
        unitScale: 1_000,
        sortOrder: 10,
        reportedSourceSystem: "BRREG",
        reportedSourceId: "line-source-1",
        sourceSystem: "BRREG",
        sourceEntityType: "structuredAnnualAccountsLine",
        sourceId: "line-source-1",
        fetchedAt: observedAt,
        normalizedAt: observedAt,
        rawPayload: null,
        derivationRuleId: null,
      }],
    }],
  };
}

function simulatedSnapshot() {
  const reported = reportedSnapshot().statements[0]!;
  const liveStatementId = "simulated:dataset-1:company-1:2025:COMPANY";
  return {
    datasetMode: "simulated" as const,
    financialDatasetVersion: "simulated:dataset-1:5" as const,
    statements: [{
      ...reported,
      liveStatementId,
      reportedStatementId: null,
      statementOrigin: "hybrid" as const,
      financialDatasetVersion: "simulated:dataset-1:5" as const,
      taxonomyVersion: "FI-SIM-2026.1",
      generatorVersion: "generator-1",
      sourceSystem: "FI-SIM",
      sourceEntityType: "simulatedFinancialStatement",
      sourceId: liveStatementId,
      rawPayload: { internal: "must-not-leak" },
      lines: [
        {
          ...reported.lines[0]!,
          liveLineId: "simulated:line-reported",
          liveStatementId,
          statementOrigin: "hybrid" as const,
          financialDatasetVersion: "simulated:dataset-1:5" as const,
          taxonomyVersion: "FI-SIM-2026.1",
          generatorVersion: "generator-1",
        },
        {
          ...reported.lines[0]!,
          liveLineId: "simulated:line-synthetic",
          liveStatementId,
          reportedFinancialLineItemId: null,
          conceptKey: "PersonnelExpense",
          sourceLabel: "Personalkostnader",
          metricKey: null,
          value: 80n,
          valueOrigin: "synthetic" as const,
          statementOrigin: "hybrid" as const,
          financialDatasetVersion: "simulated:dataset-1:5" as const,
          taxonomyVersion: "FI-SIM-2026.1",
          generatorVersion: "generator-1",
          reportedSourceSystem: null,
          reportedSourceId: null,
          sourceSystem: "FI-SIM",
          sourceEntityType: "simulatedFinancialLine",
          sourceId: "simulated:line-synthetic",
          rawPayload: { derivationRuleId: "personnel-residual-1" },
          derivationRuleId: "personnel-residual-1",
        },
      ],
    }],
  };
}

describe("raw financials reader", () => {
  it("returns reported live lines with exact values and dataset provenance", async () => {
    const findCompany = vi.fn().mockResolvedValue({ id: "company-1" });
    const getCompaniesFinancials = vi.fn().mockResolvedValue(reportedSnapshot());
    const reader = createRawFinancialsReader(
      { findCompany },
      { getCompaniesFinancials },
    );

    const result = await reader.readCompany({
      companyReference: "931075268",
      fiscalYear: 2025,
    });

    expect(findCompany).toHaveBeenCalledWith("931075268");
    expect(getCompaniesFinancials).toHaveBeenCalledWith({
      companyIds: ["company-1"],
      fiscalYear: 2025,
    });
    expect(result).toMatchObject({
      source: "live",
      datasetMode: "reported",
      financialDatasetVersion: "reported:24",
      statements: [{
        liveStatementId: "reported:statement-1",
        statementOrigin: "reported",
        financialDatasetVersion: "reported:24",
      }],
      data: [{
        id: "reported:line-1",
        originalLabel: "Sum driftsinntekter",
        originalValue: "100",
        parsedValue: "100",
        unitScale: 1_000,
        valueOrigin: "reported",
        statementOrigin: "reported",
        financialDatasetVersion: "reported:24",
        sourceId: "line-source-1",
      }],
    });
  });

  it("marks the simulated statement and every synthetic line without leaking raw payloads", async () => {
    const reader = createRawFinancialsReader(
      { findCompany: vi.fn().mockResolvedValue({ id: "company-1" }) },
      { getCompaniesFinancials: vi.fn().mockResolvedValue(simulatedSnapshot()) },
    );

    const result = await reader.readCompany({ companyReference: "931075268" });

    expect(result).toMatchObject({
      datasetMode: "simulated",
      financialDatasetVersion: "simulated:dataset-1:5",
      statements: [{
        statementOrigin: "hybrid",
        taxonomyVersion: "FI-SIM-2026.1",
        generatorVersion: "generator-1",
      }],
      data: [
        {
          valueOrigin: "reported",
          statementOrigin: "hybrid",
          financialDatasetVersion: "simulated:dataset-1:5",
          publicationSource: "LIVE_REPORTED",
        },
        {
          originalLabel: "Personalkostnader",
          canonicalKey: null,
          valueOrigin: "synthetic",
          statementOrigin: "hybrid",
          financialDatasetVersion: "simulated:dataset-1:5",
          publicationSource: "FI_SIM",
          derivationRuleId: "personnel-residual-1",
        },
      ],
    });
    expect(result).not.toHaveProperty("rawPayload");
    expect(result?.statements[0]).not.toHaveProperty("rawPayload");
    expect(result?.data[1]).not.toHaveProperty("rawPayload");
  });

  it("excludes reported PDF and OCR statements from the structured beta response", async () => {
    const snapshot = reportedSnapshot();
    const structured = snapshot.statements[0]!;
    const ocrStatementId = "reported:statement-ocr";
    const ocrStatement = {
      ...structured,
      liveStatementId: ocrStatementId,
      reportedStatementId: "statement-ocr",
      sourceEntityType: "annualReportOcr",
      sourceId: "statement-source-ocr",
      lines: structured.lines.map((line) => ({
        ...line,
        liveLineId: "reported:line-ocr",
        liveStatementId: ocrStatementId,
        reportedFinancialLineItemId: "line-ocr",
        sourceEntityType: "annualReportOcrLine",
        sourceId: "line-source-ocr",
      })),
    };
    const reader = createRawFinancialsReader(
      { findCompany: vi.fn().mockResolvedValue({ id: "company-1" }) },
      {
        getCompaniesFinancials: vi.fn().mockResolvedValue({
          ...snapshot,
          statements: [ocrStatement, structured],
        }),
      },
    );

    const result = await reader.readCompany({ companyReference: "931075268" });

    expect(result?.statements.map((statement) => statement.liveStatementId)).toEqual([
      "reported:statement-1",
    ]);
    expect(result?.data.map((line) => line.liveLineId)).toEqual([
      "reported:line-1",
    ]);
  });

  it("preserves the legacy year, scope, statement-type, and row ordering", async () => {
    const snapshot = reportedSnapshot();
    const latest = snapshot.statements[0]!;
    const balanceLine = {
      ...latest.lines[0]!,
      liveLineId: "reported:line-balance",
      reportedFinancialLineItemId: "line-balance",
      statementType: "BALANCE_SHEET" as const,
      sourceLabel: "Sum eiendeler",
      metricKey: "total_assets",
      sortOrder: 1,
    };
    const earlierIncomeLine = {
      ...latest.lines[0]!,
      liveLineId: "reported:line-income-earlier",
      reportedFinancialLineItemId: "line-income-earlier",
      sourceLabel: "Salgsinntekter",
      metricKey: "sales_revenue",
      sortOrder: 5,
    };
    const consolidatedStatementId = "reported:statement-consolidated";
    const consolidated = {
      ...latest,
      liveStatementId: consolidatedStatementId,
      reportedStatementId: "statement-consolidated",
      statementScope: "CONSOLIDATED" as const,
      sourceId: "statement-source-consolidated",
      lines: latest.lines.map((line) => ({
        ...line,
        liveLineId: "reported:line-consolidated",
        liveStatementId: consolidatedStatementId,
        reportedFinancialLineItemId: "line-consolidated",
        sourceId: "line-source-consolidated",
      })),
    };
    const olderStatementId = "reported:statement-older";
    const older = {
      ...latest,
      liveStatementId: olderStatementId,
      reportedStatementId: "statement-older",
      fiscalYear: 2024,
      sourceId: "statement-source-older",
      lines: latest.lines.map((line) => ({
        ...line,
        liveLineId: "reported:line-older",
        liveStatementId: olderStatementId,
        reportedFinancialLineItemId: "line-older",
        fiscalYear: 2024,
        sourceId: "line-source-older",
      })),
    };
    const reader = createRawFinancialsReader(
      { findCompany: vi.fn().mockResolvedValue({ id: "company-1" }) },
      {
        getCompaniesFinancials: vi.fn().mockResolvedValue({
          ...snapshot,
          statements: [
            older,
            consolidated,
            { ...latest, lines: [balanceLine, ...latest.lines, earlierIncomeLine] },
          ],
        }),
      },
    );

    const result = await reader.readCompany({ companyReference: "931075268" });

    expect(result?.data.map((line) => line.liveLineId)).toEqual([
      "reported:line-income-earlier",
      "reported:line-1",
      "reported:line-balance",
      "reported:line-consolidated",
      "reported:line-older",
    ]);
  });
});

describe("raw financials export disclosure", () => {
  it("carries the export disclaimer and dataset metadata inside the extract", async () => {
    // A raw extract is the surface most likely to be pasted somewhere else, so the disclaimer has
    // to be inside the payload rather than added by whoever renders it.
    const reader = createRawFinancialsReader(
      { findCompany: vi.fn().mockResolvedValue({ id: "company-1" }) },
      { getCompaniesFinancials: vi.fn().mockResolvedValue(simulatedSnapshot()) },
    );

    const result = await reader.readCompany({ companyReference: "931075268" });

    expect(result?.disclosure).toEqual({
      financialDatasetMode: "simulated",
      financialDatasetVersion: "simulated:dataset-1:5",
      simulated: true,
      notice: SIMULATED_FINANCIALS_NOTICE,
      disclaimer: SIMULATED_EXPORT_DISCLAIMER,
    });
  });

  it("adds no disclaimer to a reported extract", async () => {
    const reader = createRawFinancialsReader(
      { findCompany: vi.fn().mockResolvedValue({ id: "company-1" }) },
      { getCompaniesFinancials: vi.fn().mockResolvedValue(reportedSnapshot()) },
    );

    const result = await reader.readCompany({ companyReference: "931075268" });

    expect(result?.disclosure).toMatchObject({
      simulated: false,
      notice: null,
      disclaimer: null,
    });
  });

  it("never serialises a synthetic line as a reported one", async () => {
    // The API contract port: a synthetic value must not reach a caller wearing reported clothes,
    // and must never carry a filing, document or submission reference it does not have.
    const reader = createRawFinancialsReader(
      { findCompany: vi.fn().mockResolvedValue({ id: "company-1" }) },
      { getCompaniesFinancials: vi.fn().mockResolvedValue(simulatedSnapshot()) },
    );

    const result = await reader.readCompany({ companyReference: "931075268" });
    const synthetic = result!.data.filter((line) => line.valueOrigin === "synthetic");

    expect(synthetic.length).toBeGreaterThan(0);
    for (const line of synthetic) {
      expect(line.publicationSource).toBe("FI_SIM");
      expect(line.sourceSystem).toBe("FI-SIM");
      expect(line.reportedFinancialLineItemId).toBeNull();
      expect(line.sourcePage).toBeNull();
      expect(line.sourceExtractionRunId).toBeNull();
      expect(line.publishedAt).toBeNull();
      expect(line.derivationRuleId).not.toBeNull();
      expect(line.financialDatasetVersion.startsWith("simulated:")).toBe(true);
    }
    for (const statement of result!.statements) {
      expect(statement.statementOrigin).not.toBe("reported");
      expect(statement.reportedStatementId).toBeNull();
    }
  });
});
