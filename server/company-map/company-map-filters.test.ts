import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  companyMapEntityPredicate,
  companyMapFinancialRangePredicate,
  companyMapNeedsFinancialRows,
  type CompanyMapFilterSelection,
} from "@/server/company-map/company-map-filters";

const ENTITY = Prisma.raw("entity");

function selection(
  overrides: Partial<CompanyMapFilterSelection> = {},
): CompanyMapFilterSelection {
  return {
    organisationForms: ["AS", "ASA"],
    companyStatuses: ["ACTIVE"],
    search: null,
    counties: null,
    onlyGroupMembers: false,
    requirePublishedFinancials: false,
    ranges: [],
    ...overrides,
  };
}

describe("company-map entity predicate", () => {
  it("parameterises the register filters rather than inlining them", () => {
    const predicate = companyMapEntityPredicate({
      alias: ENTITY,
      filters: selection(),
    });

    expect(predicate.sql).toContain('entity."organisationForm" IN');
    expect(predicate.sql).toContain('entity."companyStatus"::text IN');
    expect(predicate.values).toEqual(["AS", "ASA", "ACTIVE"]);
  });

  it("matches an organisation number by prefix only for a numeric search", () => {
    const numeric = companyMapEntityPredicate({
      alias: ENTITY,
      filters: selection({ search: "923 609" }),
    });
    expect(numeric.sql).toContain('entity."orgNumber" LIKE');
    expect(numeric.values).toContain("923609%");

    const byName = companyMapEntityPredicate({
      alias: ENTITY,
      filters: selection({ search: "Equinor" }),
    });
    expect(byName.sql).not.toContain('entity."orgNumber" LIKE');
    expect(byName.values).toContain("%Equinor%");
  });

  it("escapes wildcards so a search cannot widen its own match", () => {
    const predicate = companyMapEntityPredicate({
      alias: ENTITY,
      filters: selection({ search: "100%_a" }),
    });

    expect(predicate.values).toContain("%100\\%\\_a%");
  });

  it("reads the fylke from the municipality number prefix", () => {
    const predicate = companyMapEntityPredicate({
      alias: ENTITY,
      filters: selection({ counties: ["03", "46"] }),
    });

    expect(predicate.sql).toContain('left(entity."municipalityNumber", 2) IN');
    expect(predicate.values).toContain("03");
    expect(predicate.values).toContain("46");
  });

  it("answers the employee range on the entity row and leaves money to the statements", () => {
    const filters = selection({
      ranges: [
        { key: "employees", min: 10, max: null },
        { key: "revenue", min: 5_000_000, max: null },
      ],
    });

    const predicate = companyMapEntityPredicate({ alias: ENTITY, filters });
    expect(predicate.sql).toContain('entity."employeeCount" >=');
    expect(predicate.sql).not.toContain('entity."revenue"');
    expect(companyMapNeedsFinancialRows(filters)).toBe(true);
  });
});

describe("company-map financial range predicate", () => {
  it("is absent when the caller set no financial condition", () => {
    expect(
      companyMapFinancialRangePredicate({
        alias: ENTITY,
        filters: selection(),
      }),
    ).toBeNull();
  });

  it("derives a ratio only against a positive denominator", () => {
    const predicate = companyMapFinancialRangePredicate({
      alias: ENTITY,
      filters: selection({
        ranges: [{ key: "ebitMargin", min: 5, max: 40 }],
      }),
    });

    expect(predicate?.sql).toContain('CASE WHEN entity."revenue" > 0');
    expect(predicate?.values).toEqual([5, 40]);
  });

  it("requires a published revenue when the caller asked for one", () => {
    const predicate = companyMapFinancialRangePredicate({
      alias: ENTITY,
      filters: selection({ requirePublishedFinancials: true }),
    });

    expect(predicate?.sql).toContain('entity."revenue" IS NOT NULL');
  });
});
