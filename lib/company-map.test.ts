import { describe, expect, it } from "vitest";

import {
  companyMapCompaniesQuerySchema,
  companyMapCoverageQuerySchema,
  companyMapViewportQuerySchema,
} from "@/lib/company-map";

describe("public company-map query", () => {
  it("defaults to the active AS/ASA address universe", () => {
    expect(companyMapCoverageQuerySchema.parse(new URLSearchParams())).toEqual({
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
      organisationForms: null,
      companyStatuses: ["ACTIVE"],
      statementScope: "COMPANY",
      currency: "NOK",
      metric: "revenue",
    });
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
        organisationForms: ["AS", "ASA"],
        companyStatuses: ["ACTIVE"],
        statementScope: "COMPANY",
        currency: "NOK",
        limit: 100,
        offset: 0,
        officialAddressId: null,
      },
    );
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
      organisationForms: ["AS", "ASA"],
      companyStatuses: ["ACTIVE"],
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
