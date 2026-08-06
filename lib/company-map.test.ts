import { describe, expect, it } from "vitest";

import {
  companyMapCompaniesQuerySchema,
  companyMapCoverageQuerySchema,
} from "@/lib/company-map";

describe("public company-map query", () => {
  it("defaults to the active AS/ASA address universe", () => {
    expect(companyMapCoverageQuerySchema.parse(new URLSearchParams())).toEqual({
      organisationForms: ["AS", "ASA"],
      companyStatuses: ["ACTIVE"],
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
    });
  });

  it("accepts every organisation form explicitly", () => {
    expect(
      companyMapCoverageQuerySchema.parse(
        new URLSearchParams({ organisationForms: "ALL" }),
      ),
    ).toEqual({
      organisationForms: null,
      companyStatuses: ["ACTIVE"],
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
    expect(companyMapCompaniesQuerySchema.parse(new URLSearchParams())).toEqual({
      organisationForms: ["AS", "ASA"],
      companyStatuses: ["ACTIVE"],
      statementScope: "COMPANY",
      currency: "NOK",
      limit: 100,
      offset: 0,
    });
  });

  it("accepts the consolidated scope and bounded pagination", () => {
    expect(
      companyMapCompaniesQuerySchema.parse(
        new URLSearchParams({
          statementScope: "CONSOLIDATED",
          currency: "EUR",
          limit: "50",
          offset: "100",
        }),
      ),
    ).toMatchObject({
      statementScope: "CONSOLIDATED",
      currency: "EUR",
      limit: 50,
      offset: 100,
    });
  });

  it("rejects unbounded page sizes", () => {
    expect(() =>
      companyMapCompaniesQuerySchema.parse(
        new URLSearchParams({ limit: "501" }),
      ),
    ).toThrow();
  });
});
