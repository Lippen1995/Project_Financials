import { beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  countPetroleumFieldSnapshots: vi.fn(),
  countPetroleumLicenceSnapshots: vi.fn(),
  getCompanySlugLookup: vi.fn(),
  getPetroleumSyncState: vi.fn(),
  listPetroleumCompanyLinks: vi.fn(),
  listPetroleumDiscoveries: vi.fn(),
  listPetroleumEvents: vi.fn(),
  listPetroleumFacilities: vi.fn(),
  listPetroleumForecastSnapshots: vi.fn(),
  listPetroleumFieldSnapshots: vi.fn(),
  listPetroleumFields: vi.fn(),
  listPetroleumInvestmentSnapshots: vi.fn(),
  listPetroleumLicenceSnapshots: vi.fn(),
  listPetroleumLicences: vi.fn(),
  listPetroleumOperatorSnapshots: vi.fn(),
  listPetroleumProductionPoints: vi.fn(),
  listPetroleumProductionPointsForEntities: vi.fn(),
  listPetroleumPublicationSnapshots: vi.fn(),
  listPetroleumReserveSnapshots: vi.fn(),
  listPetroleumSurveys: vi.fn(),
  listPetroleumTufs: vi.fn(),
  listPetroleumWellbores: vi.fn(),
  replacePetroleumCoreData: vi.fn(),
  replacePetroleumEventsForSource: vi.fn(),
  replacePetroleumMetricsData: vi.fn(),
  replacePetroleumPublicationData: vi.fn(),
  upsertPetroleumSyncState: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
  fetchSodirPetroleumCoreData: vi.fn(),
  fetchSodirPetroleumMetricsData: vi.fn(),
  fetchSodirPetroleumPublicationsData: vi.fn(),
  fetchHavtilPetroleumEvents: vi.fn(),
  fetchGasscoPetroleumEvents: vi.fn(),
}));

vi.mock("@/server/persistence/petroleum-market-repository", () => repositoryMocks);
vi.mock("@/integrations/sodir/sodir-market-provider", () => ({
  fetchSodirPetroleumCoreData: providerMocks.fetchSodirPetroleumCoreData,
  fetchSodirPetroleumMetricsData: providerMocks.fetchSodirPetroleumMetricsData,
}));
vi.mock("@/integrations/sodir/sodir-publication-provider", () => ({
  fetchSodirPetroleumPublicationsData: providerMocks.fetchSodirPetroleumPublicationsData,
}));
vi.mock("@/integrations/havtil/havtil-market-provider", () => ({
  fetchHavtilPetroleumEvents: providerMocks.fetchHavtilPetroleumEvents,
}));
vi.mock("@/integrations/gassco/gassco-market-provider", () => ({
  fetchGasscoPetroleumEvents: providerMocks.fetchGasscoPetroleumEvents,
}));

import {
  getPetroleumMarketSummary,
  getPetroleumMarketTable,
} from "@/server/services/petroleum-market-service";

function makeSyncState() {
  return {
    status: "SUCCESS",
    lastSuccessAt: new Date("2026-04-10T10:00:00.000Z"),
    errorMessage: null,
    metadata: null,
  };
}

describe("petroleum market read path", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    repositoryMocks.getPetroleumSyncState.mockResolvedValue(makeSyncState());
    repositoryMocks.listPetroleumEvents.mockResolvedValue([]);
    repositoryMocks.listPetroleumLicences.mockResolvedValue([]);
    repositoryMocks.listPetroleumForecastSnapshots.mockResolvedValue([]);
    repositoryMocks.listPetroleumPublicationSnapshots.mockResolvedValue([]);
    repositoryMocks.listPetroleumCompanyLinks.mockResolvedValue([
      {
        npdCompanyId: 10,
        companyName: "Operator One",
      },
    ]);
    repositoryMocks.listPetroleumOperatorSnapshots.mockResolvedValue([
      {
        npdCompanyId: 10,
        operatorName: "Operator One",
        orgNumber: "123456789",
        slug: "operator-one",
      },
    ]);
    repositoryMocks.listPetroleumFieldSnapshots.mockImplementation(async (input?: { skip?: number; take?: number }) => {
      const rows = [
        {
          fieldNpdId: 100,
          fieldSlug: "field-a",
          name: "Field A",
          area: "Nordsjøen",
          status: "Producing",
          hcType: "Oil",
          operatorNpdCompanyId: 10,
          operatorName: "Operator One",
          operatorOrgNumber: "123456789",
          operatorSlug: "operator-one",
          licenseeCompanyIds: [10],
          latestAnnualOe: 18,
          latestMonthlyOe: 1.8,
          latestSelectedProductionOil: 10,
          latestSelectedProductionGas: 5,
          latestSelectedProductionLiquids: 13,
          latestSelectedProductionOe: 18,
          remainingOe: 80,
          recoverableOe: 120,
          expectedFutureInvestmentNok: 250000000n,
          yoyYtdDeltaPercent: 0.1,
          currentMonthDeltaPercent: 0.2,
        },
      ];
      return rows.slice(input?.skip ?? 0, (input?.skip ?? 0) + (input?.take ?? rows.length));
    });
    repositoryMocks.listPetroleumLicenceSnapshots.mockImplementation(async (input?: { skip?: number; take?: number }) => {
      const rows = [
        {
          licenceNpdId: 200,
          licenceSlug: "lic-a",
          name: "Licence A",
          area: "Nordsjøen",
          status: "Active",
          active: true,
          currentPhase: "Production",
          operatorNpdCompanyId: 10,
          operatorName: "Operator One",
          operatorOrgNumber: "123456789",
          operatorSlug: "operator-one",
          licenseeCompanyIds: [10],
          currentAreaSqKm: 12.5,
          originalAreaSqKm: 30,
          transferCount: 2,
          licenseeCount: 1,
        },
      ];
      return rows.slice(input?.skip ?? 0, (input?.skip ?? 0) + (input?.take ?? rows.length));
    });
    repositoryMocks.countPetroleumFieldSnapshots.mockResolvedValue(1);
    repositoryMocks.countPetroleumLicenceSnapshots.mockResolvedValue(1);
    repositoryMocks.listPetroleumProductionPointsForEntities.mockImplementation(async (input?: { period?: string }) => {
      if (input?.period === "year") {
        return [
          {
            entityType: "FIELD",
            entityNpdId: 100,
            period: "year",
            year: 2025,
            month: null,
            oilNetMillSm3: 10,
            gasNetBillSm3: 5,
            condensateNetMillSm3: 1,
            nglNetMillSm3: 2,
            oeNetMillSm3: 18,
            producedWaterMillSm3: 3,
            investmentsMillNok: 100,
          },
        ];
      }

      return [
        {
          entityType: "FIELD",
          entityNpdId: 100,
          period: "year",
          year: 2025,
          month: null,
          oilNetMillSm3: 10,
          gasNetBillSm3: 5,
          condensateNetMillSm3: 1,
          nglNetMillSm3: 2,
          oeNetMillSm3: 18,
          producedWaterMillSm3: 3,
          investmentsMillNok: 100,
        },
        {
          entityType: "FIELD",
          entityNpdId: 100,
          period: "month",
          year: 2026,
          month: 2,
          oilNetMillSm3: 1,
          gasNetBillSm3: 0.5,
          condensateNetMillSm3: 0.1,
          nglNetMillSm3: 0.2,
          oeNetMillSm3: 1.8,
          producedWaterMillSm3: 0.3,
          investmentsMillNok: 10,
        },
        {
          entityType: "FIELD",
          entityNpdId: 100,
          period: "month",
          year: 2025,
          month: 2,
          oilNetMillSm3: 0.8,
          gasNetBillSm3: 0.4,
          condensateNetMillSm3: 0.08,
          nglNetMillSm3: 0.16,
          oeNetMillSm3: 1.5,
          producedWaterMillSm3: 0.25,
          investmentsMillNok: 9,
        },
      ];
    });
  });

  it("builds market summary from snapshots without triggering heavy sync", async () => {
    const summary = await getPetroleumMarketSummary({});

    expect(summary.kpis.activeFieldCount).toBe(1);
    expect(summary.kpis.activeLicenceCount).toBe(1);
    expect(summary.kpis.selectedRemainingOe).toBe(80);
    expect(summary.topFields[0]?.name).toBe("Field A");
    expect(summary.operatorConcentration[0]?.operatorName).toBe("Operator One");
    expect(providerMocks.fetchSodirPetroleumCoreData).not.toHaveBeenCalled();
    expect(providerMocks.fetchSodirPetroleumMetricsData).not.toHaveBeenCalled();
    expect(providerMocks.fetchSodirPetroleumPublicationsData).not.toHaveBeenCalled();
    expect(providerMocks.fetchHavtilPetroleumEvents).not.toHaveBeenCalled();
    expect(providerMocks.fetchGasscoPetroleumEvents).not.toHaveBeenCalled();
  });

  it("builds paged market table rows from snapshots", async () => {
    const table = await getPetroleumMarketTable({ tableMode: "fields", page: 0, size: 10 });

    expect(table.mode).toBe("fields");
    expect(table.totalCount).toBe(1);
    expect(table.items[0]).toMatchObject({
      mode: "fields",
      entityId: "field-a",
      name: "Field A",
      latestProductionOe: 18,
      remainingOe: 80,
    });
  });

  it("returns empty states honestly when snapshot data is missing", async () => {
    repositoryMocks.listPetroleumFieldSnapshots.mockResolvedValue([]);
    repositoryMocks.listPetroleumLicenceSnapshots.mockResolvedValue([]);
    repositoryMocks.listPetroleumOperatorSnapshots.mockResolvedValue([]);
    repositoryMocks.countPetroleumFieldSnapshots.mockResolvedValue(0);
    repositoryMocks.countPetroleumLicenceSnapshots.mockResolvedValue(0);
    repositoryMocks.listPetroleumProductionPointsForEntities.mockResolvedValue([]);

    const summary = await getPetroleumMarketSummary({});
    const table = await getPetroleumMarketTable({ tableMode: "fields" });

    expect(summary.kpis.activeFieldCount).toBe(0);
    expect(summary.topFields).toEqual([]);
    expect(table.items).toEqual([]);
    expect(providerMocks.fetchSodirPetroleumCoreData).not.toHaveBeenCalled();
  });
});
