import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  company: {
    findUnique: vi.fn(),
  },
}));

const repositoryMocks = vi.hoisted(() => ({
  countPetroleumDiscoveriesByOperatorCompanyIds: vi.fn(),
  countPetroleumFacilitiesByOperatorCompanyIds: vi.fn(),
  countPetroleumFieldSnapshots: vi.fn(),
  countPetroleumEventsByCompanyReference: vi.fn(),
  countPetroleumLicenceSnapshots: vi.fn(),
  countPetroleumTufsByOperatorCompanyIds: vi.fn(),
  findPetroleumCompanyExposureSnapshotByCompanyId: vi.fn(),
  listPetroleumCompanyLinksForOrgNumber: vi.fn(),
  listPetroleumDiscoveriesByOperatorCompanyIds: vi.fn(),
  listPetroleumFacilitiesByOperatorCompanyIds: vi.fn(),
  listPetroleumFieldsByNpdIds: vi.fn(),
  listPetroleumFieldSnapshots: vi.fn(),
  listPetroleumLicenceSnapshots: vi.fn(),
  listPetroleumLicencesByNpdIds: vi.fn(),
  listPetroleumEventsFiltered: vi.fn(),
  listPetroleumSyncStates: vi.fn(),
  listPetroleumTufsByOperatorCompanyIds: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMocks,
}));

vi.mock("@/server/persistence/petroleum-market-repository", () => repositoryMocks);

import {
  getCompanyPetroleumProfile,
  getCompanyPetroleumTabVisibility,
} from "@/server/services/company-petroleum-service";

describe("company petroleum read path", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMocks.company.findUnique.mockResolvedValue({ id: "company-1" });
    repositoryMocks.listPetroleumCompanyLinksForOrgNumber.mockResolvedValue([
      { npdCompanyId: 10, linkedCompanyOrgNumber: "123456789" },
    ]);
    repositoryMocks.countPetroleumFieldSnapshots.mockImplementation(async (input?: { operatorNpdCompanyIds?: number[]; licenseeCompanyIds?: number[] }) => {
      if (input?.operatorNpdCompanyIds?.length) {
        return 1;
      }

      if (input?.licenseeCompanyIds?.length) {
        return 1;
      }

      return 0;
    });
    repositoryMocks.countPetroleumLicenceSnapshots.mockImplementation(async (input?: { operatorNpdCompanyIds?: number[]; licenseeCompanyIds?: number[] }) => {
      if (input?.operatorNpdCompanyIds?.length) {
        return 1;
      }

      if (input?.licenseeCompanyIds?.length) {
        return 1;
      }

      return 0;
    });
    repositoryMocks.countPetroleumDiscoveriesByOperatorCompanyIds.mockResolvedValue(1);
    repositoryMocks.countPetroleumFacilitiesByOperatorCompanyIds.mockResolvedValue(1);
    repositoryMocks.countPetroleumTufsByOperatorCompanyIds.mockResolvedValue(1);
    repositoryMocks.countPetroleumEventsByCompanyReference.mockResolvedValue(2);
    repositoryMocks.findPetroleumCompanyExposureSnapshotByCompanyId.mockResolvedValue({
      companyId: "company-1",
      operatorFieldCount: 1,
      licenceCount: 1,
      operatedProductionOe: 18,
      attributableProductionOe: 12,
      remainingReservesOe: 80,
      expectedFutureInvestmentNok: 250000000n,
      mainAreas: ["Nordsjøen"],
    });
    repositoryMocks.listPetroleumFieldSnapshots.mockImplementation(async (input?: { operatorNpdCompanyIds?: number[]; licenseeCompanyIds?: number[] }) => {
      if (input?.operatorNpdCompanyIds?.length) {
        return [
          {
            fieldNpdId: 100,
            fieldSlug: "field-a",
            name: "Field A",
            status: "Producing",
            area: "Nordsjøen",
            hcType: "Oil",
            operatorName: "Operator One",
            operatorSlug: "operator-one",
            latestAnnualOe: 18,
            remainingOe: 80,
            expectedFutureInvestmentNok: 250000000n,
          },
        ];
      }

      return [];
    });
    repositoryMocks.listPetroleumLicenceSnapshots.mockImplementation(async (input?: { operatorNpdCompanyIds?: number[]; licenseeCompanyIds?: number[] }) => {
      if (input?.operatorNpdCompanyIds?.length) {
        return [
          {
            licenceNpdId: 200,
            licenceSlug: "lic-a",
            name: "Licence A",
            status: "Active",
            currentPhase: "Production",
            area: "Nordsjøen",
            operatorName: "Operator One",
            operatorSlug: "operator-one",
            currentAreaSqKm: 12.5,
            transferCount: 2,
          },
        ];
      }

      return [];
    });
    repositoryMocks.listPetroleumFieldsByNpdIds.mockResolvedValue([
      { npdId: 100, factPageUrl: "https://example.com/field-a" },
    ]);
    repositoryMocks.listPetroleumLicencesByNpdIds.mockResolvedValue([
      { npdId: 200, factPageUrl: "https://example.com/lic-a" },
    ]);
    repositoryMocks.listPetroleumDiscoveriesByOperatorCompanyIds.mockResolvedValue([
      {
        npdId: 300,
        slug: "disc-a",
        name: "Discovery A",
        activityStatus: "Discovery",
        areaName: "Nordsjøen",
        hydrocarbonType: "Gas",
        relatedFieldName: "Field A",
        factPageUrl: "https://example.com/disc-a",
      },
    ]);
    repositoryMocks.listPetroleumFacilitiesByOperatorCompanyIds.mockResolvedValue([
      {
        npdId: 400,
        slug: "fac-a",
        name: "Facility A",
        phase: "Operating",
        belongsToName: "Nordsjøen",
        kind: "Platform",
        factPageUrl: "https://example.com/fac-a",
      },
    ]);
    repositoryMocks.listPetroleumTufsByOperatorCompanyIds.mockResolvedValue([
      {
        npdId: 500,
        slug: "tuf-a",
        name: "TUF A",
        currentPhase: "Operating",
        belongsToName: "Nordsjøen",
        medium: "Gas",
        factPageUrl: "https://example.com/tuf-a",
      },
    ]);
    repositoryMocks.listPetroleumEventsFiltered.mockResolvedValue([
      {
        externalId: "event-1",
        source: "HAVTIL",
        eventType: "inspection",
        title: "Inspection event",
        summary: "Summary",
        publishedAt: new Date("2026-04-01T00:00:00.000Z"),
        detailUrl: "https://example.com/event-1",
        entityType: "FIELD",
        entityName: "Field A",
      },
    ]);
    repositoryMocks.listPetroleumSyncStates.mockResolvedValue([
      { key: "petroleum-core", status: "SUCCESS", errorMessage: null, lastSuccessAt: new Date("2026-04-01T00:00:00.000Z") },
      { key: "petroleum-events-havtil", status: "SUCCESS", errorMessage: null, lastSuccessAt: new Date("2026-04-01T00:00:00.000Z") },
      { key: "petroleum-events-gassco", status: "SUCCESS", errorMessage: null, lastSuccessAt: new Date("2026-04-01T00:00:00.000Z") },
      { key: "petroleum-company-exposure", status: "SUCCESS", errorMessage: null, lastSuccessAt: new Date("2026-04-01T00:00:00.000Z") },
    ]);
  });

  it("computes tab visibility from snapshots instead of broad raw tables", async () => {
    const visibility = await getCompanyPetroleumTabVisibility({
      orgNumber: "123456789",
      slug: "company-one",
      name: "Company One",
    } as never);

    expect(visibility.available).toBe(true);
    expect(visibility.hasOperatorRole).toBe(true);
    expect(visibility.hasLicenseeRole).toBe(true);
  });

  it("builds company petroleum profile from targeted snapshot reads", async () => {
    const profile = await getCompanyPetroleumProfile({
      orgNumber: "123456789",
      slug: "company-one",
      name: "Company One",
    } as never);

    expect(profile.snapshot?.operatorFieldCount).toBe(1);
    expect(profile.fields[0]).toMatchObject({
      entityId: "field-a",
      role: "OPERATOR",
      latestProductionValue: 18,
    });
    expect(profile.licences[0]?.entityId).toBe("lic-a");
    expect(profile.recentEvents[0]?.title).toBe("Inspection event");
  });
});
