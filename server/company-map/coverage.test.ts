import { describe, expect, it } from "vitest";

import { calculateCompanyMapCoverage } from "@/server/company-map/coverage";

describe("company-map coverage", () => {
  it("uses the active AS/ASA universe by default and keeps financial coverage separate", () => {
    const coverage = calculateCompanyMapCoverage([
      { organisationForm: "AS", companyStatus: "ACTIVE", resolutionStatus: "MATCHED", hasMetric: true },
      { organisationForm: "ASA", companyStatus: "ACTIVE", resolutionStatus: "MATCHED", hasMetric: false },
      { organisationForm: "AS", companyStatus: "ACTIVE", resolutionStatus: "NO_EXACT_MATCH", hasMetric: true },
      { organisationForm: "ENK", companyStatus: "ACTIVE", resolutionStatus: "PRIVACY_WITHHELD", hasMetric: true },
      { organisationForm: "AS", companyStatus: "DISSOLVED", resolutionStatus: "MATCHED", hasMetric: true },
    ]);

    expect(coverage).toEqual({
      eligible: 3,
      plotted: 2,
      omitted: 1,
      coveragePercent: 66.7,
      omissions: { NO_EXACT_MATCH: 1 },
      financialCoverage: {
        plottedWithMetric: 1,
        plottedWithoutMetric: 1,
        metricCoveragePercent: 50,
      },
    });
  });

  it("recalculates the denominator for explicit organisation-form and status filters", () => {
    const coverage = calculateCompanyMapCoverage(
      [
        { organisationForm: "AS", companyStatus: "ACTIVE", resolutionStatus: "MATCHED", hasMetric: false },
        { organisationForm: "ENK", companyStatus: "ACTIVE", resolutionStatus: "PRIVACY_WITHHELD", hasMetric: false },
      ],
      { organisationForms: ["ENK"], companyStatuses: ["ACTIVE"] },
    );

    expect(coverage.eligible).toBe(1);
    expect(coverage.plotted).toBe(0);
    expect(coverage.omitted).toBe(1);
    expect(coverage.coveragePercent).toBe(0);
    expect(coverage.omissions).toEqual({ PRIVACY_WITHHELD: 1 });
  });
});
