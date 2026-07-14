import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OversiktDashboard } from "@/components/dashboard/oversikt-dashboard";

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

    for (const label of ["ALLE", "SELSKAPER", "BRANSJER", "PERSONER", "ROLLER", "KONKURS"]) {
      expect(html).toContain(`>${label}</button>`);
    }

    expect(html).not.toContain('href="/market/distress"');
  });
});
