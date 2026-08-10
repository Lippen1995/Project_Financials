import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { financialDisclosureFor } from "@/lib/financial-simulation-disclosure";
import type { NormalizedFinancialLineItem, NormalizedFinancialStatement } from "@/lib/types";
import { OverviewCharts } from "./overview-charts";

const statement: NormalizedFinancialStatement = {
  sourceSystem: "FI-SIM",
  sourceEntityType: "simulatedFinancialStatement",
  sourceId: "simulated:demo:company:2025:COMPANY",
  fetchedAt: new Date("2026-08-10T00:00:00.000Z"),
  normalizedAt: new Date("2026-08-10T00:00:00.000Z"),
  fiscalYear: 2025,
  currency: "NOK",
  statementScope: "COMPANY",
  revenue: 1_000,
  operatingProfit: 100,
  netIncome: 80,
  equity: 400,
  assets: 900,
};

const lineItems: NormalizedFinancialLineItem[] = ["total_operating_income", "operating_profit", "net_income", "total_equity", "total_assets"].map((metricKey, index) => ({
  id: `line-${index}`, filingId: null, fiscalYear: 2025,
  statementType: index < 3 ? "INCOME_STATEMENT" : "BALANCE_SHEET",
  statementScope: "COMPANY", metricKey, label: metricKey, originalValue: null,
  value: 1, currency: "NOK", unitScale: 1, sourcePage: null, sortOrder: index,
  publicationSource: "FI_SIM", sourceSystem: "FI-SIM", sourceEntityType: null, sourceId: null,
}));

describe("OverviewCharts provenance", () => {
  it("marks simulated picker values and does not attribute them to BRREG", () => {
    const html = renderToStaticMarkup(
      <OverviewCharts
        statements={[statement]}
        lineItems={lineItems}
        disclosure={financialDisclosureFor("simulated", "simulated:demo:1")}
      />,
    );

    expect(html).toContain('data-value-origin="synthetic"');
    expect(html).toContain("Kilde: FI-SIM demonstrasjonsdatasett");
    expect(html).not.toContain("Kilde: BRREG");
  });
});
