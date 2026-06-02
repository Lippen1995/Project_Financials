import { describe, expect, it } from "vitest";

import { canonicalizeUrl, createContentHash, createTitleFingerprint, inferExternalId } from "@/server/news/source-document-normalization";

describe("source document normalization", () => {
  it("canonicalizes URLs without removing meaningful query parameters", () => {
    expect(
      canonicalizeUrl(
        "https://WWW.EIA.gov/pressroom/releases/press588.php/?utm_source=x&year=2026&fbclid=noise",
      ),
    ).toBe("https://www.eia.gov/pressroom/releases/press588.php?year=2026");
  });

  it("creates stable title fingerprints across punctuation and Norwegian variants", () => {
    expect(createTitleFingerprint("Equinor ASA: Tilbakekjøp av egne aksjer")).toBe(
      createTitleFingerprint("Equinor ASA - tilbakekjøp av egne aksjer!"),
    );
  });

  it("hashes content deterministically", () => {
    expect(createContentHash("same content")).toBe(createContentHash("same content"));
    expect(createContentHash("same content")).not.toBe(createContentHash("other content"));
  });

  it("infers external ids from source-specific URL parameters before falling back to title", () => {
    expect(
      inferExternalId({
        sourceId: "brreg-announcements",
        url: "https://w2.brreg.no/kunngjoring/hent_en.jsp?kid=123",
        title: "Kunngjøring",
      }),
    ).toBe("brreg-announcements:123");
  });
});
