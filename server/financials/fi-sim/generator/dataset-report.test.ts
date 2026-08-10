import { describe, expect, it } from "vitest";

import { buildDatasetReport } from "./dataset-report";
import { generateCompanyFinancials, type FiSimCompanyInput } from "./generator";

function input(statementScope: "COMPANY" | "CONSOLIDATED"): FiSimCompanyInput {
  return {
    companyId: "company-1",
    orgNumber: "912345678",
    registeredAt: new Date("2005-03-14T00:00:00.000Z"),
    signals: { industryCode: "62.010", organisationForm: "AS" },
    fiscalYears: [2024, 2025],
    latestCompletedFiscalYear: 2025,
    statementScope,
    currency: "NOK",
    unitScale: 1,
    anchorsByFiscalYear: {},
  };
}

describe("FI-SIM dataset report", () => {
  it("counts one company once when the dataset contains both scopes", () => {
    const summary = buildDatasetReport([
      generateCompanyFinancials(input("COMPANY")),
      generateCompanyFinancials(input("CONSOLIDATED")),
    ]);

    expect(summary).toMatchObject({
      companiesAttempted: 1,
      companiesWithPackages: 1,
      companiesFullyExcluded: 0,
      scopeCounts: { COMPANY: 2, CONSOLIDATED: 2 },
    });
  });

  it("reports only periods the immutable dataset writer can publish", () => {
    const generation = generateCompanyFinancials(input("COMPANY"));
    const withManualReview = {
      ...generation,
      packages: generation.packages.map((pkg, index) =>
        index === 0
          ? { ...pkg, validationStatus: "MANUAL_REVIEW" as const, residualAmount: 17n }
          : pkg,
      ),
    };

    const generated = buildDatasetReport([withManualReview]);
    const persisted = buildDatasetReport([withManualReview], { publishableOnly: true });

    expect(generated.packages).toBe(2);
    expect(persisted.packages).toBe(1);
    expect(persisted.statements).toBe(2);
    expect(persisted.manualReviewPackages).toEqual([
      { orgNumber: "912345678", statementScope: "COMPANY", fiscalYear: 2024, amount: "17" },
    ]);
  });
});
