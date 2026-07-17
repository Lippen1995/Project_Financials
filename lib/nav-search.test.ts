import { describe, expect, it } from "vitest";

import {
  DEFAULT_NAV_AI_SEARCH_ENABLED,
  buildNavSearchHref,
  canShowNavSearchSuggestions,
} from "@/lib/nav-search";

describe("nav search", () => {
  it("defaults AI search to off", () => {
    expect(DEFAULT_NAV_AI_SEARCH_ENABLED).toBe(false);
  });

  it("uses regular search unless AI search is explicitly enabled", () => {
    expect(buildNavSearchHref("analyse av markedet", false)).toBe(
      "/search/resolve?query=analyse%20av%20markedet&scope=all",
    );
  });

  it("opens AI chat for searches submitted with AI enabled", () => {
    expect(buildNavSearchHref("analyse av markedet", true)).toBe(
      "/search?query=analyse%20av%20markedet&ai=1",
    );
  });

  it("disables company suggestions while AI search is enabled", () => {
    expect(canShowNavSearchSuggestions("analyse av markedet", true)).toBe(false);
    expect(canShowNavSearchSuggestions("analyse av markedet", false)).toBe(true);
  });
});
