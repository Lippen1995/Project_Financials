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
          legalForm: "AS",
          companyStatus: "ACTIVE",
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
          legalForm: "ENK",
          companyStatus: "ACTIVE",
          unavailableReason: "HTTP 404: ingen regnskap",
          latestFiscalYear: null,
          statement: null,
        },
        {
          status: "ERROR",
          legalForm: "AS",
          companyStatus: "BANKRUPT",
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
      stale: 0,
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
    expect(report.legalForms).toEqual([
      { legalForm: "AS", count: 2 },
      { legalForm: "ENK", count: 1 },
    ]);
    expect(report.companyStatuses).toEqual([
      { companyStatus: "ACTIVE", count: 2 },
      { companyStatus: "BANKRUPT", count: 1 },
    ]);
    expect(report.availabilityByLegalForm).toEqual([
      {
        legalForm: "AS",
        checked: 2,
        available: 1,
        unavailable: 0,
        stale: 0,
        error: 1,
        availabilityPercent: 50,
      },
      {
        legalForm: "ENK",
        checked: 1,
        available: 0,
        unavailable: 1,
        stale: 0,
        error: 0,
        availabilityPercent: 0,
      },
    ]);
    expect(report.availabilityByCompanyStatus[0]).toEqual({
      companyStatus: "ACTIVE",
      checked: 2,
      available: 1,
      unavailable: 1,
      stale: 0,
      error: 0,
      availabilityPercent: 50,
    });
  });

  it("formats a CEO-readable report without company identities", () => {
    const report = buildStructuredFinancialCoverageReport(
      [],
      new Date("2026-07-27T11:00:00.000Z"),
    );
    const markdown = formatStructuredFinancialCoverageMarkdown(report);

    expect(markdown).toContain("# Sprint 2 – dekning i åpent Brreg-regnskaps-API");
    expect(markdown).toContain("Kontrollerte virksomheter | 0");
    expect(markdown).toContain("Utvalgsfordeling");
    expect(markdown).toContain("Rapporten inneholder ikke selskapsnavn");
  });

  it("includes the reproducible sample profile and stratum audit", () => {
    const report = buildStructuredFinancialCoverageReport(
      [],
      new Date("2026-07-27T11:00:00.000Z"),
      {
        profile: "sprint-2-closeout-stratified@1",
        targetSize: 150,
        selectedSize: 150,
        shortfall: 0,
        poolSize: 300,
        poolFingerprint: "pool-hash",
        selectionFingerprint: "selection-hash",
        strata: [
          {
            id: "as-active",
            label: "AS – aktiv",
            target: 40,
            available: 100,
            selected: 40,
          },
        ],
      },
    );

    const markdown = formatStructuredFinancialCoverageMarkdown(report);

    expect(report.sample?.profile).toBe("sprint-2-closeout-stratified@1");
    expect(markdown).toContain("Utvalgsprofil:** sprint-2-closeout-stratified@1");
    expect(markdown).toContain("Utvalgsfingeravtrykk:** selection-hash");
    expect(markdown).toContain("| AS – aktiv | 40 | 40 |");
  });

  it("counts stale source checks explicitly instead of hiding them", () => {
    const report = buildStructuredFinancialCoverageReport([
      {
        status: "STALE",
        legalForm: "AS",
        companyStatus: "ACTIVE",
        unavailableReason: null,
        latestFiscalYear: 2024,
        statement: null,
      },
    ]);

    expect(report.statusCounts).toEqual({
      available: 0,
      unavailable: 0,
      stale: 1,
      error: 0,
    });
    expect(report.availabilityByLegalForm[0]).toMatchObject({
      checked: 1,
      stale: 1,
    });
  });
});
