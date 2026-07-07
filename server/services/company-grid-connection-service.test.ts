import { describe, expect, it } from "vitest";

import {
  buildCompanyGridConnectionOverview,
  filterGridConnectionsForCompany,
} from "@/server/services/company-grid-connection-service";
import { GridConnectionRecord } from "@/lib/types";

function record(partial: Partial<GridConnectionRecord>): GridConnectionRecord {
  const now = new Date();
  return {
    id: partial.id ?? "1",
    companyOrgNumber: partial.companyOrgNumber ?? null,
    companyName: partial.companyName ?? "Nord Kraft AS",
    projectName: partial.projectName ?? null,
    status: partial.status ?? "QUEUE",
    capacityMw: partial.capacityMw ?? 10,
    area: null,
    municipality: null,
    county: null,
    networkLevel: null,
    connectionPoint: null,
    queuePosition: null,
    expectedConnectionDate: null,
    reservedAt: null,
    connectedAt: null,
    specialTerms: null,
    detailUrl: null,
    sourceUrl: "https://statnett.example/data.xlsx",
    sourceSystem: "STATNETT",
    sourceEntityType: "GRID_CONNECTION_CASE",
    sourceId: partial.sourceId ?? "1",
    fetchedAt: now,
    normalizedAt: now,
    matchNames: partial.matchNames,
  };
}

describe("company-grid-connection-service", () => {
  it("aggregates capacity by status in MW", () => {
    const overview = buildCompanyGridConnectionOverview([
      record({ status: "QUEUE", capacityMw: 20 }),
      record({ status: "RESERVED", capacityMw: 30 }),
      record({ status: "CONNECTED", capacityMw: 40 }),
      record({ status: "QUEUE", capacityMw: 5 }),
    ]);

    expect(overview).toEqual({
      totalCapacityMw: 95,
      queueCapacityMw: 25,
      reservedCapacityMw: 30,
      connectedCapacityMw: 40,
      queueCount: 2,
      reservedCount: 1,
      connectedCount: 1,
    });
  });

  it("matches by org number and distinctive name tokens, not by shared prefixes", () => {
    const records = [
      record({ id: "org", companyOrgNumber: "123456789", companyName: "Other Name AS" }),
      record({ id: "name", companyOrgNumber: null, companyName: "Nord Kraft AS" }),
      // A different legal entity that merely shares tokens must not be attributed.
      record({ id: "miss", companyOrgNumber: null, companyName: "Nord Kraft Holding AS" }),
    ];

    const matches = filterGridConnectionsForCompany({
      records,
      orgNumber: "123456789",
      companyName: "Nord Kraft AS",
    });

    expect(matches.map((item) => item.id)).toEqual(["org", "name"]);
  });

  it("matches Statnett's fuller name via the alias group and the end-customer matchNames", () => {
    // The register knows the company as "Nscale"; Statnett lists it as "Aker Nscale AS" and, in
    // the reservation report, "Nscale". Both must attach to the company page.
    const records = [
      record({ id: "queue", companyName: "Linea AS", matchNames: ["Aker Nscale AS", "Linea AS"] }),
      record({ id: "reserved", companyName: "Arva AS", matchNames: ["Nscale", "Arva AS"] }),
      record({ id: "unrelated", companyName: "Tresmarka AS", matchNames: ["Tresmarka AS", "BKK AS"] }),
    ];

    const matches = filterGridConnectionsForCompany({ records, orgNumber: "999999999", companyName: "Nscale AS" });

    expect(matches.map((item) => item.id)).toEqual(["queue", "reserved"]);
  });
});
