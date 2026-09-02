import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NjordIntroPage } from "@/components/njord/njord-intro-page";
import { NJORD_CHAPTERS, njordAskHref } from "@/lib/njord-intro";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("NjordIntroPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("renders every chapter of the Njord story with a stable anchor", () => {
    const html = renderToStaticMarkup(<NjordIntroPage />);

    expect(NJORD_CHAPTERS).toHaveLength(7);
    for (const chapter of NJORD_CHAPTERS) {
      expect(html).toContain(`id="kapittel-${chapter.n}"`);
      expect(html).toContain(chapter.title);
    }
  });

  it("sends the reader to the real AI search instead of simulating an answer", () => {
    const html = renderToStaticMarkup(<NjordIntroPage />);

    expect(html).toContain('href="/search?ai=1"');
    // Ingen påstander om navngitte selskaper eller regnskapstall på introsiden.
    expect(html).toContain("Svarformat · ikke et svar");
    expect(html).toContain("Skjematisk · uten tall");
  });
});

describe("njordAskHref", () => {
  it("opens AI search without a query when nothing is typed", () => {
    expect(njordAskHref()).toBe("/search?ai=1");
    expect(njordAskHref("   ")).toBe("/search?ai=1");
  });

  it("carries the question into the search as an encoded query", () => {
    expect(njordAskHref(" Hvem eier selskapet? ")).toBe(
      "/search?ai=1&query=Hvem%20eier%20selskapet%3F",
    );
  });
});
