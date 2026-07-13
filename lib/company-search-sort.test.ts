import { describe, expect, it } from "vitest";

import {
  sortCompanySearchRows,
  type CompanySearchRow,
} from "@/lib/company-search-sort";

function row(overrides: Partial<CompanySearchRow>): CompanySearchRow {
  return {
    orgNumber: "000000000",
    name: "Virksomhet",
    status: "ACTIVE",
    industry: null,
    city: null,
    revenue: null,
    revenueFiscalYear: null,
    operatingProfit: null,
    netIncome: null,
    employeeCount: null,
    ...overrides,
  };
}

describe("sortCompanySearchRows", () => {
  it("sorts names using Norwegian collation", () => {
    const rows = [row({ name: "Åsen" }), row({ name: "Bergen" }), row({ name: "Økern" })];

    expect(sortCompanySearchRows(rows, "company", "asc").map((item) => item.name)).toEqual([
      "Bergen",
      "Økern",
      "Åsen",
    ]);
  });

  it("sorts numeric columns and keeps missing values last in both directions", () => {
    const rows = [
      row({ name: "Mangler", revenue: null }),
      row({ name: "Lav", revenue: 10 }),
      row({ name: "Høy", revenue: 20 }),
    ];

    expect(sortCompanySearchRows(rows, "revenue", "asc").map((item) => item.name)).toEqual([
      "Lav",
      "Høy",
      "Mangler",
    ]);
    expect(sortCompanySearchRows(rows, "revenue", "desc").map((item) => item.name)).toEqual([
      "Høy",
      "Lav",
      "Mangler",
    ]);
  });

  it("does not mutate the server-provided result order", () => {
    const rows = [row({ name: "B" }), row({ name: "A" })];

    sortCompanySearchRows(rows, "company", "asc");

    expect(rows.map((item) => item.name)).toEqual(["B", "A"]);
  });

  it("sorts status by the visible Norwegian labels", () => {
    const rows = [
      row({ name: "Konkurs", status: "BANKRUPT" }),
      row({ name: "Avviklet", status: "DISSOLVED" }),
      row({ name: "Aktiv", status: "ACTIVE" }),
    ];

    expect(sortCompanySearchRows(rows, "status", "asc").map((item) => item.name)).toEqual([
      "Aktiv",
      "Avviklet",
      "Konkurs",
    ]);
  });
});
