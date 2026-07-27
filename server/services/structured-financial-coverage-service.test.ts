import { describe, expect, it } from "vitest";

import {
  buildStructuredFinancialCoverageReport,
  formatStructuredFinancialCoverageMarkdown,
} from "@/server/services/structured-financial-coverage-service";

describe("structured financial coverage report", () => {
  it("separates source availability from field-level coverage", () => {
    const report = buildStructuredFinancialCoverageReport(
      [
        {
          status: "AVAILABLE",
          unavailableReason: null,
          latestFiscalYear: 2025,
          statement: {
            fiscalYear: 2025,
            revenue: 1000n,
            operatingProfit: 100n,
            netIncome: null,
            equity: 400n,
            assets: 900n,
            rawPayload: { oppstillingsplan: "store" },
          },
        },
        {
          status: "UNAVAILABLE",
          unavailableReason: "HTTP 404: ingen regnskap",
          latestFiscalYear: null,
          statement: null,
        },
        {
          status: "ERROR",
          unavailableReason: null,
          latestFiscalYear: 2024,
          statement: {
            fiscalYear: 2024,
            revenue: null,
            operatingProfit: null,
            netIncome: 25n,
            equity: null,
            assets: 500n,
            rawPayload: { oppstillingsplan: "smaa" },
          },
        },
      ],
      new Date("2026-07-27T11:00:00.000Z"),
    );

    expect(report.checkedCompanies).toBe(3);
    expect(report.statusCounts).toEqual({
      available: 1,
      unavailable: 1,
      error: 1,
    });
    expect(report.companiesWithStoredStatement).toBe(2);
    expect(report.fieldCoverage.revenue).toEqual({
      present: 1,
      totalStatements: 2,
      percent: 50,
    });
    expect(report.fieldCoverage.assets.percent).toBe(100);
    expect(report.unavailableReasons).toEqual([
      { reason: "HTTP 404: ingen regnskap", count: 1 },
    ]);
    expect(report.layouts).toEqual([
      { layout: "smaa", count: 1 },
      { layout: "store", count: 1 },
    ]);
  });

  it("formats a CEO-readable report without company identities", () => {
    const report = buildStructuredFinancialCoverageReport(
      [],
      new Date("2026-07-27T11:00:00.000Z"),
    );
    const markdown = formatStructuredFinancialCoverageMarkdown(report);

    expect(markdown).toContain("# Sprint 2 – dekning i åpent Brreg-regnskaps-API");
    expect(markdown).toContain("Kontrollerte virksomheter | 0");
    expect(markdown).toContain("Rapporten inneholder ikke selskapsnavn");
  });
});
