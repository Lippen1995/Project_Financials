import { describe, expect, it } from "vitest";

import { buildCompanyIpOverview } from "@/server/services/company-ip-service";
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
    caseUrl: partial.caseUrl ?? null,
    owners: partial.owners ?? [],
    lastEventDate: partial.lastEventDate ?? null,
    isActive: partial.isActive ?? null,
    sourceSystem: "PATENTSTYRET",
    sourceEntityType: "IP_CASE",
    sourceId: partial.sourceId ?? "1",
    fetchedAt: now,
    normalizedAt: now,
  };
}

describe("company-ip-service", () => {
  it("aggregates overview counters", () => {
    const overview = buildCompanyIpOverview([
      buildRight({ id: "p1", type: "patent", isActive: true, lastEventDate: "2026-01-10" }),
      buildRight({ id: "t1", type: "trademark", isActive: true, lastEventDate: "2026-02-10" }),
      buildRight({ id: "d1", type: "design", isActive: false, lastEventDate: "2025-02-10" }),
    ]);

    expect(overview.total).toBe(3);
    expect(overview.patents).toBe(1);
    expect(overview.trademarks).toBe(1);
    expect(overview.designs).toBe(1);
    expect(overview.active).toBe(2);
    expect(overview.latestActivityDate).toBe("2026-02-10");
  });

  it("handles empty portfolio", () => {
    const overview = buildCompanyIpOverview([]);
    expect(overview).toEqual({
      total: 0,
      patents: 0,
      trademarks: 0,
      designs: 0,
      active: 0,
      latestActivityDate: null,
    });
  });
});
