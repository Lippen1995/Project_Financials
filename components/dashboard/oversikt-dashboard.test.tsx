import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OversiktDashboard } from "@/components/dashboard/oversikt-dashboard";
import {
  financialDisclosureFor,
  SIMULATED_FINANCIALS_NOTICE,
} from "@/lib/financial-simulation-disclosure";

describe("OversiktDashboard search scopes", () => {
  it("renders the shortcuts as filters in the shared search form", () => {
    globalThis.React = React;
    const html = renderToStaticMarkup(
      <OversiktDashboard
        firstName=""
        dateLabel=""
        watch={[]}
        news={[]}
        bankruptcies={[]}
        bankruptciesLastWeek={0}
      />,
    );

    expect(html).toContain('action="/search/resolve"');
    expect(html).toContain('name="searchEventId"');
    expect(html).toContain('name="scope" value="all"');
    expect(html).toContain('aria-label="Avgrens søket"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('placeholder="Søk etter selskap, person eller rolle…"');

    for (const label of ["ALLE", "SELSKAPER", "BRANSJER", "PERSONER", "ROLLER", "KONKURS"]) {
      expect(html).toContain(`>${label}</button>`);
    }

    expect(html).not.toContain('href="/market/distress"');
  });

  it("labels dashboard figures and charts when the live dataset is simulated", () => {
    globalThis.React = React;
    const html = renderToStaticMarkup(
      <OversiktDashboard
        firstName="Ada"
        dateLabel="10. AUGUST 2026"
        watch={[{ name: "Demo AS", slug: "demo-as", revenueSeries: [100, 120], revenueOrigins: ["reported", "synthetic"] }]}
        news={[]}
        bankruptcies={[
          {
            name: "Eksempel AS",
            slug: "eksempel-as",
            sector: "Industri",
            filedDaysAgo: 3,
            latestRevenue: 90,
            latestRevenueOrigin: "synthetic",
            revenueSeries: [100, 90],
            revenueOrigins: ["reported", "synthetic"],
            ebitMarginSeries: [12, 8],
            ebitMarginOrigins: ["reported", "synthetic"],
          },
        ]}
        bankruptciesLastWeek={1}
        financialDisclosure={financialDisclosureFor(
          "simulated",
          "simulated:investor-2026-08:1",
        )}
      />,
    );

    expect(html).toContain(SIMULATED_FINANCIALS_NOTICE);
    expect(html).toContain("simulated:investor-2026-08:1");
    expect(html).toContain('role="note"');
    expect(html).toContain('data-value-origin="synthetic"');
  });
});
