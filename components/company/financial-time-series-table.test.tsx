import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { describe, expect, it } from "vitest";

import {
  SIMULATED_FINANCIALS_NOTICE,
  SIMULATED_LINE_MARKER,
  SIMULATED_LINE_NOTICE,
} from "@/lib/financial-simulation-disclosure";
import { FinancialTimeSeriesTable } from "@/components/company/financial-time-series-table";
import type {
  DataAvailability,
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
  it("shows the official structured source and fetch date", () => {
    const statements: NormalizedFinancialStatement[] = [
      {
        sourceSystem: "BRREG",
        sourceEntityType: "structuredAnnualAccounts",
        sourceId: "journal-test",
        fetchedAt: new Date("2026-07-27T10:00:00.000Z"),
        normalizedAt: new Date("2026-07-27T10:00:01.000Z"),
        fiscalYear: 2025,
        currency: "NOK",
        statementScope: "COMPANY",
        revenue: 1000,
        operatingProfit: 100,
        netIncome: 80,
        equity: 400,
        assets: 900,
      },
    ];

    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={statements}
        documents={[]}
        companySlug="company-test"
      />,
    );

    expect(html).toContain("Brønnøysundregistrene");
    expect(html).toContain("27. juli 2026");
    expect(html).toContain("strukturert API");
  });

  it("uses the controlled availability message when no figures exist", () => {
    const availability: DataAvailability = {
      available: false,
      status: "UNAVAILABLE",
      sourceSystem: "BRREG",
      message: "Ingen strukturerte regnskapstall er tilgjengelige fra kilden.",
    };

    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={[]}
        documents={[]}
        companySlug="company-test"
        availability={availability}
      />,
    );

    expect(html).toContain(availability.message);
  });

  it("marks stale official figures next to the displayed source", () => {
    const statements: NormalizedFinancialStatement[] = [
      {
        sourceSystem: "BRREG",
        sourceEntityType: "structuredAnnualAccounts",
        sourceId: "journal-test",
        fetchedAt: new Date("2026-07-27T10:00:00.000Z"),
        normalizedAt: new Date("2026-07-27T10:00:01.000Z"),
        fiscalYear: 2025,
        currency: "NOK",
        statementScope: "COMPANY",
        revenue: 1000,
        operatingProfit: 100,
        netIncome: 80,
        equity: 400,
        assets: 900,
      },
    ];

    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={statements}
        documents={[]}
        companySlug="company-test"
        availability={{ available: true, status: "STALE" }}
      />,
    );

    expect(html).toContain("utdatert snapshot");
  });

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

  it("ranks income-statement subtotals and adds space after each group", () => {
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
      ["Revenues", "revenue"],
      ["Operating income, in total", "total_operating_income"],
      ["Procurement expenses", "as_reported_procurement_expenses"],
      ["Operating cost, in total", "total_operating_expenses"],
      ["Operating results", "operating_profit"],
      ["Interest income", "as_reported_interest_income"],
      ["Finance items - net", "net_financial_items"],
      ["Profit (loss) before taxes", "profit_before_tax"],
      ["Taxes", "tax_expense"],
      ["Profit (loss) for the year", "net_income"],
    ];
    const lineItems: NormalizedFinancialLineItem[] = rows.map(([label, metricKey], index) => ({
      id: `income-${index}`,
      filingId: "filing-1",
      fiscalYear: 2025,
      statementType: "INCOME_STATEMENT",
      statementScope: "CONSOLIDATED",
      metricKey,
      label,
      originalValue: "100",
      value: 100_000,
      currency: "NOK",
      unitScale: 1_000,
      sourcePage: 87,
      sortOrder: index,
      publicationSource: "MANUAL_REVIEW",
      ...source,
      sourceId: `reach-2025:p87:r${index}`,
    }));

    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={statements}
        documents={[]}
        lineItems={lineItems}
        companySlug="922493626"
      />,
    );

    expect(html.match(/data-financial-row-kind="income-section-subtotal"/g)).toHaveLength(3);
    expect(html.match(/data-financial-row-kind="income-key-subtotal"/g)).toHaveLength(2);
    expect(html.match(/data-financial-row-kind="income-result"/g)).toHaveLength(1);
    expect(html).toContain('data-financial-metric-key="operating_profit"');
    expect(html).toContain('data-financial-metric-key="total_operating_expenses"');
    expect(html.match(/data-income-group-break="true"/g)).toHaveLength(5);

    const rowMarkup = (metricKey: string) => html.match(
      new RegExp(`<tr[^>]*data-financial-metric-key="${metricKey}"[^>]*>`),
    )?.[0] ?? "";
    expect(rowMarkup("total_operating_income")).toContain("font-semibold");
    expect(rowMarkup("total_operating_income")).not.toContain("border-t");
    expect(rowMarkup("total_operating_income")).not.toContain("bg-[");
    expect(rowMarkup("operating_profit")).toContain("font-semibold");
    expect(rowMarkup("operating_profit")).toContain("border-t");
    expect(rowMarkup("operating_profit")).not.toContain("bg-[");
    expect(rowMarkup("net_income")).toContain("font-bold");
    expect(rowMarkup("net_income")).toContain("border-t");
    expect(rowMarkup("net_income")).toContain("bg-[var(--px-accent-soft)]");
  });

  it("applies the same three-level subtotal hierarchy to the balance sheet", () => {
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
      ["Goodwill", "as_reported_goodwill"],
      ["Property, plant and equipment, in total", "as_reported_property_plant_equipment_total"],
      ["Non-current assets, in total", "total_non_current_assets"],
      ["Cash and cash equivalents", "cash_and_cash_equivalents"],
      ["Current assets, in total", "total_current_assets"],
      ["Total assets", "total_assets"],
      ["Share capital", "as_reported_share_capital"],
      ["Equity, in total", "total_equity"],
      ["Non-current liabilities, in total", "long_term_liabilities"],
      ["Total current liabilities", "current_liabilities"],
      ["Total equity and liabilities", "total_equity_and_liabilities"],
    ];
    const lineItems: NormalizedFinancialLineItem[] = rows.map(([label, metricKey], index) => ({
      id: `balance-${index}`,
      filingId: "filing-1",
      fiscalYear: 2025,
      statementType: "BALANCE_SHEET",
      statementScope: "CONSOLIDATED",
      metricKey,
      label,
      originalValue: "100",
      value: 100_000,
      currency: "NOK",
      unitScale: 1_000,
      sourcePage: 88,
      sortOrder: index,
      publicationSource: "MANUAL_REVIEW",
      ...source,
      sourceId: `reach-2025:p88:r${index}`,
    }));

    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={statements}
        documents={[]}
        lineItems={lineItems}
        companySlug="922493626"
      />,
    );
    const rowMarkup = (metricKey: string) => html.match(
      new RegExp(`<tr[^>]*data-financial-metric-key="${metricKey}"[^>]*>`),
    )?.[0] ?? "";

    expect(rowMarkup("total_current_assets")).toContain("font-semibold");
    expect(rowMarkup("total_current_assets")).not.toContain("border-t");
    expect(rowMarkup("total_current_assets")).not.toContain("bg-[");
    expect(rowMarkup("as_reported_property_plant_equipment_total")).toContain("font-semibold");
    expect(rowMarkup("as_reported_property_plant_equipment_total")).not.toContain("border-t");
    expect(rowMarkup("total_equity")).toContain("font-semibold");
    expect(rowMarkup("total_equity")).toContain("border-t");
    expect(rowMarkup("total_equity")).not.toContain("bg-[");
    expect(rowMarkup("total_assets")).toContain("font-bold");
    expect(rowMarkup("total_assets")).toContain("border-t");
    expect(rowMarkup("total_assets")).toContain("bg-[var(--px-accent-soft)]");
    expect(rowMarkup("total_equity_and_liabilities")).toContain("font-bold");
    expect(rowMarkup("total_equity_and_liabilities")).toContain("bg-[var(--px-accent-soft)]");
  });
});

describe("FinancialTimeSeriesTable simulated disclosure", () => {
  const simulatedStatement: NormalizedFinancialStatement = {
    sourceSystem: "FI-SIM",
    sourceEntityType: "simulatedFinancialStatement",
    sourceId: "simulated:demo-1:company-1:2025:COMPANY",
    fetchedAt: new Date("2026-08-09T10:00:00.000Z"),
    normalizedAt: new Date("2026-08-09T10:00:00.000Z"),
    fiscalYear: 2025,
    currency: "NOK",
    statementScope: "COMPANY",
    revenue: 1_000,
    operatingProfit: 100,
    netIncome: 80,
    equity: 400,
    assets: 900,
  };

  function simulatedLine(
    overrides: Partial<NormalizedFinancialLineItem> = {},
  ): NormalizedFinancialLineItem {
    return {
      id: "simulated:line-1",
      filingId: null,
      fiscalYear: 2025,
      statementType: "INCOME_STATEMENT",
      statementScope: "COMPANY",
      metricKey: null,
      label: "Sum driftsinntekter",
      originalValue: null,
      value: 1_000,
      currency: "NOK",
      unitScale: 1,
      sourcePage: null,
      sortOrder: 60,
      publicationSource: "FI_SIM",
      sourceSystem: "FI-SIM",
      sourceEntityType: "simulatedFinancialLine",
      sourceId: "simulated:line-1",
      ...overrides,
    };
  }

  const disclosure = {
    financialDatasetMode: "simulated" as const,
    financialDatasetVersion: "simulated:demo-1:3" as const,
    simulated: true,
    notice: SIMULATED_FINANCIALS_NOTICE,
  };

  it("shows a persistent banner naming the dataset above the statements", () => {
    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={[simulatedStatement]}
        documents={[]}
        lineItems={[simulatedLine()]}
        companySlug="company-test"
        disclosure={disclosure}
      />,
    );

    expect(html).toContain(SIMULATED_FINANCIALS_NOTICE);
    expect(html).toContain("simulated:demo-1:3");
    expect(html).toContain('role="note"');
    expect(html).toContain("FI-SIM-visning");
    expect(html).not.toContain("Som rapportert");
    expect(html).toContain("FI-SIM-konseptkatalogen");
    expect(html.match(/title="Simulert linje/g) ?? []).toHaveLength(1);
  });

  it("shows no banner on reported figures", () => {
    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={[{ ...simulatedStatement, sourceSystem: "BRREG" }]}
        documents={[]}
        companySlug="company-test"
        disclosure={{
          financialDatasetMode: "reported",
          financialDatasetVersion: "reported:21",
          simulated: false,
          notice: null,
        }}
      />,
    );

    expect(html).not.toContain(SIMULATED_FINANCIALS_NOTICE);
  });

  it("marks a synthetic figure in text a screen reader can announce, not by colour", () => {
    // FI-SIM-2026.1 section 12 requires every synthetic line to be marked. A marker that only
    // exists as a class name or a colour would pass a visual review and fail a real reader.
    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={[simulatedStatement]}
        documents={[]}
        lineItems={[simulatedLine()]}
        companySlug="company-test"
        disclosure={disclosure}
      />,
    );

    expect(html).toContain('data-value-origin="synthetic"');
    expect(html).toContain(SIMULATED_LINE_MARKER);
    expect(html).toContain(SIMULATED_LINE_NOTICE);
    expect(html).toContain("sr-only");
  });

  it("marks only the years whose figure is synthetic", () => {
    const html = renderToStaticMarkup(
      <FinancialTimeSeriesTable
        statements={[
          simulatedStatement,
          { ...simulatedStatement, fiscalYear: 2024, sourceSystem: "BRREG" },
        ]}
        documents={[]}
        lineItems={[
          simulatedLine(),
          simulatedLine({
            id: "reported:line-2",
            fiscalYear: 2024,
            filingId: "statement-2024",
            publicationSource: "LIVE_REPORTED",
            sourceSystem: "BRREG",
            sourceEntityType: "structuredAnnualAccountsLine",
            sourceId: "reported:line-2",
          }),
        ]}
        companySlug="company-test"
        disclosure={disclosure}
      />,
    );

    // One marked cell for the simulated year, and no second one for the reported year.
    expect(html.match(/<td data-value-origin="synthetic"/g) ?? []).toHaveLength(1);
  });
});
