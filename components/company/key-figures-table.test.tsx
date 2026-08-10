import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SIMULATED_FINANCIALS_NOTICE } from "@/lib/financial-simulation-disclosure";
import type { NormalizedFinancialLineItem, NormalizedFinancialStatement } from "@/lib/types";
import { KeyFiguresTable } from "./key-figures-table";

const statement: NormalizedFinancialStatement = {
  sourceSystem: "FI-SIM",
  sourceEntityType: "simulatedFinancialStatement",
  sourceId: "simulated:demo-1:company-1:2025:COMPANY",
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

const lineItems: NormalizedFinancialLineItem[] = [
  ["total_operating_income", "LIVE_REPORTED"],
  ["operating_profit", "FI_SIM"],
  ["net_income", "FI_SIM"],
  ["total_equity", "FI_SIM"],
  ["total_assets", "FI_SIM"],
].map(([metricKey, publicationSource], index) => ({
  id: `line-${index}`,
  filingId: null,
  fiscalYear: 2025,
  statementType: index < 3 ? "INCOME_STATEMENT" : "BALANCE_SHEET",
  statementScope: "COMPANY",
  metricKey,
  label: metricKey,
  originalValue: null,
  value: index === 0 ? 1_000 : 1,
  currency: "NOK",
  unitScale: 1,
  sourcePage: null,
  sortOrder: index,
  publicationSource,
  sourceSystem: publicationSource === "FI_SIM" ? "FI-SIM" : "BRREG",
  sourceEntityType: null,
  sourceId: null,
})) as NormalizedFinancialLineItem[];

describe("KeyFiguresTable simulated disclosure", () => {
  it("labels the calculated table and every available simulated figure", () => {
    const html = renderToStaticMarkup(
      <KeyFiguresTable
        statements={[statement]}
        lineItems={lineItems}
        disclosure={{
          financialDatasetMode: "simulated",
          financialDatasetVersion: "simulated:demo-1:3",
          simulated: true,
          notice: SIMULATED_FINANCIALS_NOTICE,
        }}
      />,
    );

    expect(html).toContain(SIMULATED_FINANCIALS_NOTICE);
    expect(html).toContain("simulated:demo-1:3");
    expect(html).toContain('role="note"');
    expect(html).toContain('data-value-origin="synthetic"');
  });
});
