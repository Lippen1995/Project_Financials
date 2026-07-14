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
});
