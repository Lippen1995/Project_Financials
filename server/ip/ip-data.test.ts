import { describe, expect, it } from "vitest";

import { buildIpOverview, toListItem } from "@/server/ip/ip-data";
import { IPRightSummary } from "@/lib/types";

function buildRight(partial: Partial<IPRightSummary>): IPRightSummary {
  const now = new Date();
  return {
    id: partial.id ?? "1",
    companyOrgNumber: "123456789",
    type: partial.type ?? "patent",
    applicationNumber: partial.applicationNumber ?? "A1",
    title: partial.title ?? null,
    status: partial.status ?? null,
    applicationDate: partial.applicationDate ?? null,
    registrationOrGrantDate: partial.registrationOrGrantDate ?? null,
    publicationDate: partial.publicationDate ?? null,
    expiryDate: partial.expiryDate ?? null,
    caseUrl: partial.caseUrl ?? null,
    owners: partial.owners ?? [],
    lastEventDate: partial.lastEventDate ?? null,
    isActive: partial.isActive ?? null,
    supportingFacts: partial.supportingFacts,
    sourceSystem: "PATENTSTYRET",
    sourceEntityType: "IP_CASE",
    sourceId: partial.sourceId ?? "1",
    fetchedAt: now,
    normalizedAt: now,
  };
}

describe("buildIpOverview", () => {
  it("aggregates overview counters", () => {
    const overview = buildIpOverview([
      buildRight({ id: "p1", type: "patent", isActive: true, lastEventDate: "2026-01-10" }),
      buildRight({ id: "t1", type: "trademark", isActive: true, lastEventDate: "2026-02-10" }),
      buildRight({ id: "d1", type: "design", isActive: false, lastEventDate: "2025-02-10" }),
      buildRight({ id: "e1", type: "elCertificate", isActive: true, lastEventDate: "2026-03-10" }),
    ]);

    expect(overview.total).toBe(4);
    expect(overview.patents).toBe(1);
    expect(overview.trademarks).toBe(1);
    expect(overview.designs).toBe(1);
    expect(overview.elCertificates).toBe(1);
    expect(overview.active).toBe(3);
    expect(overview.latestActivityDate).toBe("2026-03-10");
  });

  it("handles an empty portfolio", () => {
    expect(buildIpOverview([])).toEqual({
      total: 0,
      patents: 0,
      trademarks: 0,
      designs: 0,
      elCertificates: 0,
      active: 0,
      latestActivityDate: null,
    });
  });
});

describe("toListItem", () => {
  it("projects a lean, client-safe row without raw payload", () => {
    const item = toListItem(
      buildRight({
        id: "p1",
        type: "patent",
        title: "Widget",
        expiryDate: "2030-01-01",
        owners: [{ name: "Fjord Insight AS", orgNumber: "123456789" }],
        supportingFacts: [{ label: "Effekt", value: "10 MW" }],
      }),
    );

    expect(item).toEqual({
      id: "p1",
      type: "patent",
      title: "Widget",
      status: null,
      applicationNumber: "A1",
      applicationDate: null,
      registrationOrGrantDate: null,
      expiryDate: "2030-01-01",
      lastEventDate: null,
      caseUrl: null,
      ownerName: "Fjord Insight AS",
      isActive: null,
      supportingFacts: [{ label: "Effekt", value: "10 MW" }],
    });
    expect("rawPayload" in item).toBe(false);
  });
});
