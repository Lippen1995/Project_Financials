import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CompanyMapExplorer } from "@/components/company-map/company-map-explorer";

describe("CompanyMapExplorer", () => {
  it("provides an account-free list alternative and explicit account scope", () => {
    const html = renderToStaticMarkup(<CompanyMapExplorer />);

    expect(html).toContain("without creating an account");
    expect(html).toContain("Skip to list");
    expect(html).toContain("See consolidated");
    expect(html).toContain("Company accounts");
    expect(html).toContain("Revenue descending");
    expect(html).toContain("Registered companies ordered by revenue");
  });

  it("exposes labelled native filters and the address omission section", () => {
    const html = renderToStaticMarkup(<CompanyMapExplorer />);

    expect(html).toContain("Organisation forms");
    expect(html).toContain("All registered entities");
    expect(html).toContain("Coverage metric");
    expect(html).toContain("Address coverage");
  });
});
