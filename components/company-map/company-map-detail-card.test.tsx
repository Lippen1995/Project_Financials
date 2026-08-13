import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CompanyMapDetailCard } from "@/components/company-map/company-map-detail-card";
import type { CompanyMapCompany } from "@/components/company-map/company-map-types";

const company: CompanyMapCompany = {
  orgNumber: "923609016",
  name: "Equinor ASA",
  organisationForm: "ASA",
  employeeCount: 22_821,
  municipality: "Stavanger",
  officialAddressId: "addr-1",
  latitude: 58.97,
  longitude: 5.733,
  groupLabel: "Morselskap i Equinor-konsernet",
  fiscalYear: 2024,
  currency: "NOK",
  revenue: "1245000000000",
  ebit: "311000000000",
  preTaxProfit: "300000000000",
  netIncome: "-275000000000",
  equity: "400000000000",
  totalAssets: "900000000000",
  profileHref: "/companies/923609016",
  statementScope: "COMPANY",
  preTaxProfitStatus: "AVAILABLE",
  financialSource: {
    sourceSystem: "BRREG",
    publishedAt: "2025-06-01T00:00:00.000Z",
    fetchedAt: "2025-06-02T00:00:00.000Z",
    normalizedAt: "2025-06-02T00:00:00.000Z",
  },
};

function render(overrides: { isAuthenticated: boolean }) {
  return renderToStaticMarkup(
    <CompanyMapDetailCard
      company={company}
      groupTaxYear={2023}
      isAuthenticated={overrides.isAuthenticated}
      onClose={() => {}}
      onRequestSignIn={() => {}}
    />,
  );
}

describe("CompanyMapDetailCard", () => {
  it("names the statement scope, the fiscal year and the source", () => {
    const html = render({ isAuthenticated: false });

    expect(html).toContain("SELSKAPSREGNSKAP · 2024");
    expect(html).toContain("Brønnøysundregistrene");
    expect(html).toContain("Eierstruktur per 31. desember 2023");
  });

  it("shows a loss in the negative tone and rounds to readable magnitudes", () => {
    const html = render({ isAuthenticated: false });

    // nb-NO groups with a non-breaking space, so compare on a normalised copy.
    const plain = html.replace(/ /g, " ");
    expect(plain).toContain("1 245 mrd NOK");
    expect(plain).toContain("−275 mrd NOK");
    expect(html).toContain("var(--px-error)");
  });

  it("offers the follow prompt only to signed-out visitors", () => {
    expect(render({ isAuthenticated: false })).toContain("Følg");
    expect(render({ isAuthenticated: true })).not.toContain(">Følg<");
  });
});
