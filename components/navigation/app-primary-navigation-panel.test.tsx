import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppPrimaryNavigationPanel } from "@/components/navigation/app-primary-navigation-panel";
import { buildGlobalNavItems, buildGlobalNavMenuCategories } from "@/lib/navigation";

const categories = buildGlobalNavMenuCategories(buildGlobalNavItems(null));

describe("AppPrimaryNavigationPanel", () => {
  it("shows only Utforsk destinations when Utforsk is selected", () => {
    const html = renderToStaticMarkup(
      <AppPrimaryNavigationPanel
        activeCategory="explore"
        categories={categories}
        pathname="/company-map"
        onCategoryChange={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('href="/company-map"');
    expect(html).toContain('href="/people"');
    expect(html).toContain('href="/watchlist"');
    expect(html).toContain('href="/market/distress"');
    expect(html).not.toContain('href="/analyses"');
    expect(html).not.toContain('href="/market/oil-gas"');
  });

  it("replaces the panel with Analyse destinations when Analyse is selected", () => {
    const html = renderToStaticMarkup(
      <AppPrimaryNavigationPanel
        activeCategory="analysis"
        categories={categories}
        pathname="/analyses"
        onCategoryChange={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(html).toContain('aria-labelledby="primary-nav-tab-analysis"');
    expect(html).toContain('href="/analyses"');
    expect(html).toContain(">Analyse<");
    expect(html).toContain('href="/market/oil-gas"');
    expect(html).toContain("Olje og gass");
    expect(html).not.toContain('href="/company-map"');
    expect(html).not.toContain('href="/people"');
    expect(html).not.toContain('href="/watchlist"');
    expect(html).not.toContain('href="/market/distress"');
  });
});
