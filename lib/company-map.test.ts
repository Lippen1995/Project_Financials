import { describe, expect, it } from "vitest";

import {
  collectCompanyMapRanges,
  companyMapCompaniesQuerySchema,
  companyMapCoverageQuerySchema,
  companyMapViewportQuerySchema,
  COMPANY_MAP_RANGE_KEYS,
} from "@/lib/company-map";

/** Every optional filter in its "not filtering" state, so the exact-shape assertions stay exact. */
const NO_FILTERS = {
  search: null,
  counties: null,
  onlyGroupMembers: false,
  requirePublishedFinancials: false,
  ...Object.fromEntries(
    COMPANY_MAP_RANGE_KEYS.flatMap((key) => [
      [`${key}Min`, null],
      [`${key}Max`, null],
    ]),
  ),
};

describe("public company-map query", () => {
  it("defaults to the active AS/ASA address universe", () => {
    expect(companyMapCoverageQuerySchema.parse(new URLSearchParams())).toEqual({
      ...NO_FILTERS,
      organisationForms: ["AS", "ASA"],
      companyStatuses: ["ACTIVE"],
      statementScope: "COMPANY",
      currency: "NOK",
      metric: "revenue",
    });
  });

  it("accepts explicit filter-aware coverage selections", () => {
    expect(
      companyMapCoverageQuerySchema.parse(
        new URLSearchParams({
          organisationForms: "AS,ENK",
          companyStatuses: "ACTIVE,DISSOLVED",
        }),
      ),
    ).toEqual({
      ...NO_FILTERS,
      organisationForms: ["AS", "ENK"],
      companyStatuses: ["ACTIVE", "DISSOLVED"],
      statementScope: "COMPANY",
      currency: "NOK",
      metric: "revenue",
    });
  });

  it("accepts employee coverage as a map metric", () => {
    expect(
      companyMapCoverageQuerySchema.parse(
        new URLSearchParams({ metric: "employees" }),
      ).metric,
    ).toBe("employees");
  });

  it("accepts every organisation form explicitly", () => {
    expect(
      companyMapCoverageQuerySchema.parse(
        new URLSearchParams({ organisationForms: "ALL" }),
      ),
    ).toEqual({
      ...NO_FILTERS,
      organisationForms: null,
      companyStatuses: ["ACTIVE"],
      statementScope: "COMPANY",
      currency: "NOK",
      metric: "revenue",
    });
  });

  it("treats a blank parameter as no filter at all", () => {
    const query = companyMapCoverageQuerySchema.parse(
      new URLSearchParams({ search: "   ", counties: "", revenueMin: "" }),
    );

    expect(query.search).toBeNull();
    expect(query.counties).toBeNull();
    expect(collectCompanyMapRanges(query)).toEqual([]);
  });

  it("collects only the bounds the caller actually set", () => {
    const query = companyMapCoverageQuerySchema.parse(
      new URLSearchParams({
        revenueMin: "5000000",
        employeesMax: "250",
        ebitMarginMin: "-12.5",
      }),
    );

    expect(collectCompanyMapRanges(query)).toEqual([
      { key: "revenue", min: 5_000_000, max: null },
      { key: "employees", min: null, max: 250 },
      { key: "ebitMargin", min: -12.5, max: null },
    ]);
  });

  it("accepts known fylke codes and rejects invented ones", () => {
    expect(
      companyMapCoverageQuerySchema.parse(
        new URLSearchParams({ counties: "03,46,03" }),
      ).counties,
    ).toEqual(["03", "46"]);

    expect(() =>
      companyMapCoverageQuerySchema.parse(
        new URLSearchParams({ counties: "99" }),
      ),
    ).toThrow();
  });

  it("rejects ALL combined with a specific organisation form", () => {
    expect(() =>
      companyMapCoverageQuerySchema.parse(
        new URLSearchParams({ organisationForms: "ALL,AS" }),
      ),
    ).toThrow();
  });

  it("rejects unbounded filter lists", () => {
    expect(() =>
      companyMapCoverageQuerySchema.parse(
        new URLSearchParams({ organisationForms: "AS,ASA,ENK,NUF,ANS,DA,SA" }),
      ),
    ).toThrow();
  });
});

describe("public company-map company list query", () => {
  it("defaults to company accounts ranked in NOK", () => {
    expect(companyMapCompaniesQuerySchema.parse(new URLSearchParams())).toEqual(
      {
        ...NO_FILTERS,
        organisationForms: ["AS", "ASA"],
        companyStatuses: ["ACTIVE"],
        statementScope: "COMPANY",
        currency: "NOK",
        limit: 100,
        offset: 0,
        officialAddressId: null,
        west: null,
        south: null,
        east: null,
        north: null,
      },
    );
  });

  it("accepts a complete map viewport and rejects a partial one", () => {
    expect(
      companyMapCompaniesQuerySchema.parse(
        new URLSearchParams({
          west: "10",
          south: "59",
          east: "11",
          north: "60",
        }),
      ),
    ).toMatchObject({ west: 10, south: 59, east: 11, north: 60 });

    expect(() =>
      companyMapCompaniesQuerySchema.parse(
        new URLSearchParams({ west: "10", south: "59" }),
      ),
    ).toThrow();
  });

  it("accepts the consolidated scope and bounded pagination", () => {
    expect(
      companyMapCompaniesQuerySchema.parse(
        new URLSearchParams({
          statementScope: "CONSOLIDATED",
          currency: "EUR",
          limit: "50",
          offset: "100",
          officialAddressId: "addr_123:unit-4",
        }),
      ),
    ).toMatchObject({
      statementScope: "CONSOLIDATED",
      currency: "EUR",
      limit: 50,
      offset: 100,
      officialAddressId: "addr_123:unit-4",
    });
  });

  it("rejects unsafe official address identifiers", () => {
    expect(() =>
      companyMapCompaniesQuerySchema.parse(
        new URLSearchParams({ officialAddressId: "address id; DROP" }),
      ),
    ).toThrow();
  });

  it("rejects unbounded page sizes", () => {
    expect(() =>
      companyMapCompaniesQuerySchema.parse(
        new URLSearchParams({ limit: "501" }),
      ),
    ).toThrow();
  });
});

describe("public company-map viewport query", () => {
  it("accepts a bounded Norway viewport with the default AS/ASA filter", () => {
    expect(
      companyMapViewportQuerySchema.parse(
        new URLSearchParams({
          west: "4.5",
          south: "57.8",
          east: "31.5",
          north: "71.5",
          zoom: "4",
        }),
      ),
    ).toEqual({
      ...NO_FILTERS,
      organisationForms: ["AS", "ASA"],
      companyStatuses: ["ACTIVE"],
      statementScope: "COMPANY",
      currency: "NOK",
      west: 4.5,
      south: 57.8,
      east: 31.5,
      north: 71.5,
      zoom: 4,
      limit: 1_000,
    });
  });

  it("rejects inverted or unbounded viewports", () => {
    expect(() =>
      companyMapViewportQuerySchema.parse(
        new URLSearchParams({
          west: "31.5",
          south: "57.8",
          east: "4.5",
          north: "71.5",
          zoom: "4",
        }),
      ),
    ).toThrow();

    expect(() =>
      companyMapViewportQuerySchema.parse(
        new URLSearchParams({
          west: "4.5",
          south: "57.8",
          east: "31.5",
          north: "71.5",
          zoom: "2",
        }),
      ),
    ).toThrow();
  });

  it("caps the number of returned map features", () => {
    expect(() =>
      companyMapViewportQuerySchema.parse(
        new URLSearchParams({
          west: "4.5",
          south: "57.8",
          east: "31.5",
          north: "71.5",
          zoom: "10",
          limit: "2001",
        }),
      ),
    ).toThrow();
  });
});
