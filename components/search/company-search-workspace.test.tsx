import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  calculateNjordReservedWidth,
  CompanySearchWorkspace,
} from "@/components/search/company-search-workspace";

const searchParams = new URLSearchParams("query=konkurrenter&ai=1");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

describe("CompanySearchWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    searchParams.set("query", "konkurrenter");
    searchParams.set("ai", "1");
  });

  it("shows the AI chat panel when AI search is enabled", () => {
    const html = renderToStaticMarkup(
      <CompanySearchWorkspace
        rows={[]}
        params={{
          query: "konkurrenter",
          industryCode: "",
          city: "",
          legalForm: "",
          status: "",
          aiEnabled: true,
        }}
        searchError={null}
      />,
    );

    expect(html).toContain('aria-label="AI-søk samtale"');
    expect(html).toContain('aria-label="Tilbakestill størrelse"');
    expect(html).toContain('aria-label="Minimer"');
    expect(html).toContain('aria-label="Lukk"');
    expect(html).not.toContain("--njord-panel-width");
    expect(html).toContain("sm:pr-[var(--njord-reserved-width)]");
    expect(html).not.toContain("Direkte oppslag – AI var ikke nødvendig.");
  });

  it("reserves only the part of the standard chat that overlaps the centered workspace", () => {
    expect(calculateNjordReservedWidth(1_437, 1_700, 400)).toBe(161);
    expect(calculateNjordReservedWidth(1_700, 1_700, 400)).toBe(400);
    expect(calculateNjordReservedWidth(1_437, 1_700, 720)).toBe(161);
  });

  it("keeps the AI chat panel hidden for a regular search", () => {
    const html = renderToStaticMarkup(
      <CompanySearchWorkspace
        rows={[]}
        params={{
          query: "konkurrenter",
          industryCode: "",
          city: "",
          legalForm: "",
          status: "",
          aiEnabled: false,
        }}
        searchError={null}
      />,
    );

    expect(html).not.toContain('aria-label="AI-søk samtale"');
  });

  it("shows a parent's own employees separately from the consolidated group count", () => {
    const rows = [{
      orgNumber: "922493626",
      name: "REACH SUBSEA ASA",
      status: "ACTIVE" as const,
      industry: "71.122 Geologiske undersøkelser",
      city: "HAUGESUND",
      revenue: null,
      revenueFiscalYear: null,
      operatingProfit: null,
      netIncome: null,
      employeeCount: 5,
      groupEmployeeCount: 307,
      groupEmployeeCountComplete: true,
      groupEmployeeCompanyCount: 2,
      groupEmployeeOwnershipYear: 2025,
    }];
    const html = renderToStaticMarkup(
      <CompanySearchWorkspace
        rows={rows}
        params={{
          query: "Reach Subsea",
          industryCode: "",
          city: "",
          legalForm: "",
          status: "",
          aiEnabled: false,
        }}
        searchError={null}
      />,
    );

    expect(html).toContain(">5<");
    expect(html).toContain("Konsern 307");
  });

  it("labels a partially covered group employee total as a minimum", () => {
    const html = renderToStaticMarkup(
      <CompanySearchWorkspace
        rows={[{
          orgNumber: "PARENT",
          name: "PARENT ASA",
          status: "ACTIVE",
          industry: null,
          city: null,
          revenue: null,
          revenueFiscalYear: null,
          operatingProfit: null,
          netIncome: null,
          employeeCount: 5,
          groupEmployeeCount: 307,
          groupEmployeeCountComplete: false,
          groupEmployeeCompanyCount: 3,
          groupEmployeeOwnershipYear: 2025,
        }]}
        params={{
          query: "Parent",
          industryCode: "",
          city: "",
          legalForm: "",
          status: "",
          aiEnabled: false,
        }}
        searchError={null}
      />,
    );

    expect(html).toContain("Konsern minst 307");
  });

  it("says which former name a hit came from", () => {
    const html = renderToStaticMarkup(
      <CompanySearchWorkspace
        rows={[
          {
            orgNumber: "922493626",
            name: "REACH SUBSEA ASA",
            status: "ACTIVE",
            industry: null,
            city: "HAUGESUND",
            matchedPreviousName: "GREEN REEFERS ASA",
            revenue: null,
            revenueFiscalYear: null,
            operatingProfit: null,
            netIncome: null,
            employeeCount: 5,
          },
        ]}
        params={{
          query: "Green Reefers",
          industryCode: "",
          city: "",
          legalForm: "",
          status: "",
          aiEnabled: false,
        }}
        searchError={null}
      />,
    );

    expect(html).toContain("REACH SUBSEA ASA");
    expect(html).toContain("GREEN REEFERS ASA");
    expect(html).toContain("Tidligere");
  });

  it("leaves the former-name line out for a plain current-name hit", () => {
    const html = renderToStaticMarkup(
      <CompanySearchWorkspace
        rows={[
          {
            orgNumber: "922493626",
            name: "REACH SUBSEA ASA",
            status: "ACTIVE",
            industry: null,
            city: "HAUGESUND",
            matchedPreviousName: null,
            revenue: null,
            revenueFiscalYear: null,
            operatingProfit: null,
            netIncome: null,
            employeeCount: 5,
          },
        ]}
        params={{
          query: "Reach Subsea",
          industryCode: "",
          city: "",
          legalForm: "",
          status: "",
          aiEnabled: false,
        }}
        searchError={null}
      />,
    );

    expect(html).not.toContain("Tidligere");
  });
});
