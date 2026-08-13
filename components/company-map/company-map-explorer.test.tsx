import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CompanyMapExplorer } from "@/components/company-map/company-map-explorer";

describe("CompanyMapExplorer", () => {
  it("puts search, fylke and the filter panel in the toolbar", () => {
    const html = renderToStaticMarkup(<CompanyMapExplorer />);

    expect(html).toContain("Søk navn eller org.nr");
    expect(html).toContain("Hele Norge");
    expect(html).toContain("Flere filtre");
    expect(html).toContain("Nullstill");
  });

  it("keeps the account-free list and its map-free instructions", () => {
    const html = renderToStaticMarkup(<CompanyMapExplorer />);

    expect(html).toContain("Selskaper i utsnittet");
    expect(html).toContain("SORTERT ETTER OMSETNING");
    expect(html).toContain(
      "Listen under kartet gir den samme informasjonen uten",
    );
  });

  it("labels the map encoding by company count rather than by a financial figure", () => {
    const html = renderToStaticMarkup(<CompanyMapExplorer />);

    expect(html).toContain("STØRRELSE = ANTALL SELSKAPER PÅ ADRESSEN");
    expect(html).toContain("I UTSNITTET");
  });

  it("offers the coverage metric and the statement scope beside the map", () => {
    const html = renderToStaticMarkup(<CompanyMapExplorer />);

    expect(html).toContain("DEKNINGSTALL");
    expect(html).toContain("Konsernregnskap");
    expect(html).toContain("Selskapsregnskap");
  });

  it("scopes the rail to the filter selection, not to the map viewport", () => {
    const html = renderToStaticMarkup(<CompanyMapExplorer />);

    expect(html).toContain("HOVEDSIGNALER · FILTERUTVALG");
    expect(html).toContain(
      "Tallene gjelder hele filterutvalget, ikke bare kartutsnittet.",
    );
  });

});
