import { describe, expect, it } from "vitest";

import { createCompanyEventFingerprint, normalizeTitleCore } from "@/server/news/company-event-fingerprinting";

describe("company event fingerprinting", () => {
  it("normalizes title cores for stable event clustering", () => {
    expect(normalizeTitleCore("Equinor ASA: Share buy-back - second tranche for 2026")).toBe(
      normalizeTitleCore("Equinor ASA announces share buyback second tranche 2026"),
    );
  });

  it("creates stable fingerprints for the same event inside a date window", () => {
    const first = createCompanyEventFingerprint({
      companyId: "eqnr",
      eventType: "buyback",
      title: "Equinor ASA: Share buy-back - second tranche for 2026",
      eventDate: new Date("2026-05-21T08:00:00Z"),
    });
    const second = createCompanyEventFingerprint({
      companyId: "eqnr",
      eventType: "buyback",
      title: "Equinor ASA announces share buyback second tranche 2026",
      eventDate: new Date("2026-05-27T08:00:00Z"),
    });

    expect(first).toBe(second);
  });

  it("separates different companies or event types", () => {
    const base = createCompanyEventFingerprint({
      companyId: "eqnr",
      eventType: "buyback",
      title: "Share buyback second tranche",
      eventDate: new Date("2026-05-21T08:00:00Z"),
    });
    const otherCompany = createCompanyEventFingerprint({
      companyId: "akerbp",
      eventType: "buyback",
      title: "Share buyback second tranche",
      eventDate: new Date("2026-05-21T08:00:00Z"),
    });

    expect(base).not.toBe(otherCompany);
  });

  it("groups structured bilingual disclosures by issuer, event type and minute", () => {
    const norwegian = createCompanyEventFingerprint({
      companyId: "eqnr",
      eventType: "buyback",
      title: "Equinor ASA: Tilbakekjop av egne aksjer",
      eventDate: new Date("2026-05-27T06:00:04.822Z"),
      sourceSpecificId: "newsweb:674547",
      eventGroupKey: "oslobors:2026-05-27T06:00",
    });
    const english = createCompanyEventFingerprint({
      companyId: "eqnr",
      eventType: "buyback",
      title: "Equinor ASA: Share buy-back",
      eventDate: new Date("2026-05-27T06:00:04.211Z"),
      sourceSpecificId: "newsweb:674546",
      eventGroupKey: "oslobors:2026-05-27T06:00",
    });

    expect(norwegian).toBe(english);
  });
});
