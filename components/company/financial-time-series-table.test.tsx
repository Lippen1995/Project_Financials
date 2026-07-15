import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { describe, expect, it } from "vitest";

import { FinancialTimeSeriesTable } from "@/components/company/financial-time-series-table";
import type {
  NormalizedFinancialLineItem,
  NormalizedFinancialStatement,
} from "@/lib/types";

const source = {
  sourceSystem: "REACH_SUBSEA_IR",
  sourceEntityType: "annualReportConsolidatedFinancialStatement",
  sourceId: "reach-2025",
  fetchedAt: new Date("2026-07-15T17:00:00.000Z"),
  normalizedAt: new Date("2026-07-15T17:00:00.000Z"),
};

describe("FinancialTimeSeriesTable", () => {
  it("renders every published filing row in Som rapportert instead of a fixed summary template", () => {
    const statements: NormalizedFinancialStatement[] = [{
      ...source,
      rawPayload: null,
      fiscalYear: 2025,
      currency: "NOK",
      statementScope: "CONSOLIDATED",
      revenue: 2_677_042_000,
      operatingProfit: 149_431_000,
      netIncome: 108_102_000,
      equity: 1_218_266_000,
      assets: 3_605_794_000,
    }];
    const lineItems: NormalizedFinancialLineItem[] = [
      {
        id: "line-1",
        filingId: "filing-1",
        fiscalYear: 2025,
        statementType: "INCOME_STATEMENT",
        statementScope: "CONSOLIDATED",
        metricKey: "as_reported_procurement_expenses",
        label: "Procurement expenses",
        originalValue: "(750 000)",
        value: -750_000_000,
        currency: "NOK",
        unitScale: 1_000,
        sourcePage: 87,
        sortOrder: 4,
        publicationSource: "MANUAL_REVIEW",
        sourceSystem: "REACH_SUBSEA_IR",
        sourceEntityType: "annualReportConsolidatedFinancialStatement",
        sourceId: "reach-2025:p87:r4",
      },
      {
        id: "line-2",
        filingId: "filing-1",
        fiscalYear: 2025,
        statementType: "INCOME_STATEMENT",
        statementScope: "CONSOLIDATED",
        metricKey: "as_reported_impairment",
        label: "Impairment",
        originalValue: "22 883",
        value: 22_883_000,
        currency: "NOK",
        unitScale: 1_000,
        sourcePage: 87,
        sortOrder: 6,
        publicationSource: "MANUAL_REVIEW",
        sourceSystem: "REACH_SUBSEA_IR",
        sourceEntityType: "annualReportConsolidatedFinancialStatement",
        sourceId: "reach-2025:p87:r6",
      },
    ];

    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={statements}
        documents={[]}
        lineItems={lineItems}
        companySlug="922493626"
      />,
    );

    expect(html).toContain("Som rapportert");
    expect(html).toContain("Procurement expenses");
    expect(html).toContain("Impairment");
    expect(html).toContain("Linjenavn og rekkefølge følger den nyeste publiserte hovedoppstillingen");
  });

  it("keeps note-page rows out of the as-reported primary statements", () => {
    const statements: NormalizedFinancialStatement[] = [{
      ...source,
      rawPayload: null,
      fiscalYear: 2025,
      currency: "NOK",
      statementScope: "CONSOLIDATED",
      revenue: 2_674_629_000,
      operatingProfit: 149_431_000,
      netIncome: 108_102_000,
      equity: 1_218_266_000,
      assets: 3_605_794_000,
    }];
    const makeLine = (
      id: string,
      label: string,
      metricKey: string,
      sourcePage: number,
      sortOrder: number,
      fiscalYear = 2025,
    ): NormalizedFinancialLineItem => ({
      id,
      filingId: "filing-1",
      fiscalYear,
      statementType: "INCOME_STATEMENT",
      statementScope: "CONSOLIDATED",
      metricKey,
      label,
      originalValue: "100",
      value: 100_000,
      currency: "NOK",
      unitScale: 1_000,
      sourcePage,
      sortOrder,
      publicationSource: "MANUAL_REVIEW",
      ...source,
      sourceId: `reach-2025:p${sourcePage}:r${sortOrder}`,
    });
    const lineItems = [
      makeLine("line-revenue", "Revenues", "revenue", 16, 1),
      makeLine("line-operating", "Operating profit", "operating_profit", 16, 2),
      makeLine("line-profit", "Profit (loss) for the year", "net_income", 16, 3),
      makeLine("line-eps", "Earnings (loss) per share", "earnings_per_share", 87, 4),
      makeLine("line-note-operating", "Operating result", "operating_profit", 48, 5),
      makeLine("line-equity-method", "for using the equity method", "equity_method", 47, 6),
      makeLine("line-old-fee", "Amortized termination fee", "amortized_termination_fee", 44, 7, 2024),
    ];

    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={statements}
        documents={[]}
        lineItems={lineItems}
        companySlug="922493626"
      />,
    );

    expect(html).toContain("Profit (loss) for the year");
    expect(html).not.toContain("Earnings (loss) per share");
    expect(html).not.toContain("for using the equity method");
    expect(html).not.toContain("Operating result");
    expect(html).not.toContain("Amortized termination fee");
  });

  it("emphasizes cash-flow totals and separates the activity groups", () => {
    const statements: NormalizedFinancialStatement[] = [{
      ...source,
      rawPayload: null,
      fiscalYear: 2025,
      currency: "NOK",
      statementScope: "CONSOLIDATED",
      revenue: 2_674_629_000,
      operatingProfit: 149_431_000,
      netIncome: 108_102_000,
      equity: 1_218_266_000,
      assets: 3_605_794_000,
    }];
    const rows = [
      ["Profit before tax", "cash_flow_profit_before_tax"],
      ["Net cash flow from operating activities", "net_cash_from_operating_activities"],
      ["Purchase of equipment", "purchase_of_equipment"],
      ["Net cash flow from investment activities", "net_cash_from_investing_activities"],
      ["Proceeds from bank loan", "proceeds_from_bank_loan"],
      ["Net cash flow from financing activities", "net_cash_from_financing_activities"],
      ["Net cash flow for the year", "net_change_in_cash"],
      ["Cash and cash equivalents 1/1", "opening_cash_and_cash_equivalents"],
      ["Translation differences", "translation_differences"],
      ["Cash and cash equivalents 31/12", "closing_cash_and_cash_equivalents"],
    ];
    const lineItems: NormalizedFinancialLineItem[] = rows.map(([label, metricKey], index) => ({
      id: `cash-${index}`,
      filingId: "filing-1",
      fiscalYear: 2025,
      statementType: "CASH_FLOW",
      statementScope: "CONSOLIDATED",
      metricKey,
      label,
      originalValue: "100",
      value: 100_000,
      currency: "NOK",
      unitScale: 1_000,
      sourcePage: 90,
      sortOrder: index,
      publicationSource: "MANUAL_REVIEW",
      ...source,
      sourceId: `reach-2025:p90:r${index}`,
    }));

    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={statements}
        documents={[]}
        lineItems={lineItems}
        companySlug="922493626"
      />,
    );

    expect(html.match(/data-financial-row-kind="cash-flow-total"/g)).toHaveLength(5);
    expect(html.match(/data-cash-flow-group-break="true"/g)).toHaveLength(4);
  });
});
