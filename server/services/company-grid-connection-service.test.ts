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

  it("matches by org number before exact company name", () => {
    const records = [
      record({ id: "org", companyOrgNumber: "123456789", companyName: "Other Name AS" }),
      record({ id: "name", companyOrgNumber: null, companyName: "Nord Kraft AS" }),
      record({ id: "miss", companyOrgNumber: null, companyName: "Nord Kraft Holding AS" }),
    ];

    const matches = filterGridConnectionsForCompany({
      records,
      orgNumber: "123456789",
      companyName: "Nord Kraft AS",
    });

    expect(matches.map((item) => item.id)).toEqual(["org", "name"]);
  });
});
