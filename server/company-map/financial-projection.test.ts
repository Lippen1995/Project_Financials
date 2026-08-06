import { describe, expect, it } from "vitest";

import {
  loadReportedCompanyMapFinancialProjection,
  restrictReportedCompanyMapFinancialProjection,
} from "@/server/company-map/financial-projection";

describe("reported company-map financial projection", () => {
  it("retains independent latest company and consolidated scopes", async () => {
    const projection = await loadReportedCompanyMapFinancialProjection({
      async listLatestReportedCompanyMetrics() {
        return {
          financialDatasetVersion: "reported:7",
          statements: [
            {
              companyId: "company-1",
              orgNumber: "999999999",
              fiscalYear: 2025,
              statementScope: "COMPANY" as const,
              currency: "NOK",
              unitScale: 1,
              revenue: 1_000n,
              ebit: 100n,
              preTaxProfit: 90n,
              netIncome: 70n,
              equity: 400n,
              totalAssets: 800n,
              financialDatasetVersion: "reported:7",
              valueOrigin: "reported" as const,
            },
            {
              companyId: "company-1",
              orgNumber: "999999999",
              fiscalYear: 2024,
              statementScope: "CONSOLIDATED" as const,
              currency: "NOK",
              unitScale: 1,
              revenue: 2_000n,
              ebit: null,
              preTaxProfit: 225n,
              netIncome: 175n,
              equity: 700n,
              totalAssets: 1_400n,
              financialDatasetVersion: "reported:7",
              valueOrigin: "reported" as const,
            },
          ],
        };
      },
    });

    expect(projection.financialDatasetVersion).toBe("reported:7");
    expect(projection.statementCount).toBe(2);
    expect(projection.financialEntityCount).toBe(1);
    expect(projection.metricCount).toBe(11);
    expect(projection.companyStatementCount).toBe(1);
    expect(projection.consolidatedStatementCount).toBe(1);
    expect(projection.statements.map((row) => row.statementScope)).toEqual([
      "COMPANY",
      "CONSOLIDATED",
    ]);
  });

  it("fails closed when the reported live view has no statements", async () => {
    await expect(
      loadReportedCompanyMapFinancialProjection({
        async listLatestReportedCompanyMetrics() {
          return { financialDatasetVersion: "reported:7", statements: [] };
        },
      }),
    ).rejects.toThrow("no reported statements");
  });

  it("audits reported statements outside the current registry universe", async () => {
    const source = await loadReportedCompanyMapFinancialProjection({
      async listLatestReportedCompanyMetrics() {
        return {
          financialDatasetVersion: "reported:7",
          statements: [
            {
              companyId: "current-company",
              orgNumber: "999999999",
              fiscalYear: 2025,
              statementScope: "COMPANY" as const,
              currency: "NOK",
              unitScale: 1,
              revenue: 1_000n,
              ebit: 100n,
              preTaxProfit: 90n,
              netIncome: 70n,
              equity: 400n,
              totalAssets: 800n,
              financialDatasetVersion: "reported:7",
              valueOrigin: "reported" as const,
            },
            {
              companyId: "historical-company",
              orgNumber: "888888888",
              fiscalYear: 2024,
              statementScope: "COMPANY" as const,
              currency: "NOK",
              unitScale: 1,
              revenue: 500n,
              ebit: null,
              preTaxProfit: null,
              netIncome: 25n,
              equity: 200n,
              totalAssets: 350n,
              financialDatasetVersion: "reported:7",
              valueOrigin: "reported" as const,
            },
          ],
        };
      },
    });

    const restricted = restrictReportedCompanyMapFinancialProjection(
      source,
      new Set(["999999999"]),
    );

    expect(restricted.statementCount).toBe(1);
    expect(restricted.financialEntityCount).toBe(1);
    expect(restricted.metricCount).toBe(6);
    expect(restricted.sourceStatementCount).toBe(2);
    expect(restricted.excludedStatementCount).toBe(1);
    expect(restricted.excludedEntityCount).toBe(1);
    expect(restricted.statements.map((row) => row.orgNumber)).toEqual([
      "999999999",
    ]);
  });
});
