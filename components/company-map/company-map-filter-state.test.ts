import { describe, expect, it } from "vitest";

import {
  buildCompanyMapFilterParams,
  countActiveCompanyMapFilters,
  createDefaultCompanyMapFilters,
} from "@/components/company-map/company-map-filter-state";

describe("company-map filter state", () => {
  it("sends only the register defaults when nothing has been touched", () => {
    const params = buildCompanyMapFilterParams(
      createDefaultCompanyMapFilters(),
    );

    expect(params.toString()).toBe(
      "organisationForms=AS%2CASA&companyStatuses=ACTIVE",
    );
    expect(countActiveCompanyMapFilters(createDefaultCompanyMapFilters())).toBe(
      0,
    );
  });

  it("converts money entered in thousands into kroner", () => {
    const filters = createDefaultCompanyMapFilters();
    filters.ranges.revenue = { min: "5000", max: "" };
    filters.ranges.employees = { min: "", max: "250" };
    filters.ranges.ebitMargin = { min: "-12,5", max: "" };

    const params = buildCompanyMapFilterParams(filters);

    expect(params.get("revenueMin")).toBe("5000000");
    expect(params.get("revenueMax")).toBeNull();
    expect(params.get("employeesMax")).toBe("250");
    expect(params.get("ebitMarginMin")).toBe("-12.5");
    expect(countActiveCompanyMapFilters(filters)).toBe(3);
  });

  it("passes search, fylke and the toggles through untouched", () => {
    const filters = createDefaultCompanyMapFilters();
    filters.search = "  Equinor  ";
    filters.county = "11";
    filters.onlyGroupMembers = true;
    filters.requirePublishedFinancials = true;
    filters.companyStatuses = ["BANKRUPT", "ACTIVE"];

    const params = buildCompanyMapFilterParams(filters);

    expect(params.get("search")).toBe("Equinor");
    expect(params.get("counties")).toBe("11");
    expect(params.get("onlyGroupMembers")).toBe("true");
    expect(params.get("requirePublishedFinancials")).toBe("true");
    expect(params.get("companyStatuses")).toBe("ACTIVE,BANKRUPT");
    expect(countActiveCompanyMapFilters(filters)).toBe(3);
  });
});
