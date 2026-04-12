import { describe, expect, it } from "vitest";

import {
  buildPetroleumAreaSnapshotRows,
  buildPetroleumFieldSnapshotRows,
  buildPetroleumLicenceSnapshotRows,
  buildPetroleumMapFeatureSnapshotRows,
  buildPetroleumOperatorSnapshotRows,
} from "@/server/services/petroleum-snapshot-service";

const computedAt = new Date("2026-04-11T10:00:00.000Z");

function makeDataset() {
  return {
    companyLinks: [
      {
        npdCompanyId: 10,
        companyName: "Operator One",
        orgNumber: "123456789",
        linkedCompanyOrgNumber: "123456789",
        linkedCompanySlug: "operator-one",
      },
    ],
    fields: [
      {
        npdId: 100,
        slug: "field-a",
        name: "Field A",
        mainArea: "Nordsjøen",
        activityStatus: "Producing",
        hydrocarbonType: "Oil",
        operatorNpdCompanyId: 10,
        operatorCompanyName: "Operator One",
        operatorOrgNumber: "123456789",
        operatorCompanySlug: "operator-one",
        licensees: [{ npdCompanyId: 10, share: 70 }, { npdCompanyId: 20, share: 30 }],
        factPageUrl: "https://example.com/field-a",
        factMapUrl: "https://example.com/map/field-a",
        geometry: { type: "Point", coordinates: [2, 60] },
        bbox: [1, 59, 3, 61],
        centroid: [2, 60],
        sourceSystem: "SODIR",
        sourceEntityType: "FIELD",
        sourceId: "100",
      },
    ],
    discoveries: [
      {
        npdId: 300,
        slug: "disc-a",
        name: "Discovery A",
        operatorNpdCompanyId: 10,
        operatorCompanyName: "Operator One",
        operatorOrgNumber: "123456789",
        operatorCompanySlug: "operator-one",
        factPageUrl: "https://example.com/discovery-a",
        factMapUrl: "https://example.com/map/discovery-a",
        geometry: { type: "Point", coordinates: [2.5, 60.5] },
        bbox: [2, 60, 3, 61],
        centroid: [2.5, 60.5],
        sourceSystem: "SODIR",
        sourceEntityType: "DISCOVERY",
        sourceId: "300",
      },
    ],
    licences: [
      {
        npdId: 200,
        slug: "lic-a",
        name: "Licence A",
        mainArea: "Nordsjøen",
        status: "Active",
        active: true,
        currentPhase: "Production",
        operatorNpdCompanyId: 10,
        operatorCompanyName: "Operator One",
        operatorOrgNumber: "123456789",
        operatorCompanySlug: "operator-one",
        currentAreaSqKm: 12.5,
        originalAreaSqKm: 33.2,
        licensees: [{ npdCompanyId: 10 }, { npdCompanyId: 20 }],
        transfers: [{ id: 1 }, { id: 2 }],
        factPageUrl: "https://example.com/lic-a",
        factMapUrl: "https://example.com/map/lic-a",
        geometry: { type: "Polygon", coordinates: [[[2, 60], [3, 60], [3, 61], [2, 61], [2, 60]]] },
        bbox: [2, 60, 3, 61],
        centroid: [2.5, 60.5],
        sourceSystem: "SODIR",
        sourceEntityType: "LICENCE",
        sourceId: "200",
      },
    ],
    facilities: [
      {
        npdId: 400,
        slug: "fac-a",
        name: "Facility A",
        currentOperatorNpdId: 10,
        currentOperatorName: "Operator One",
        currentOperatorOrgNumber: "123456789",
        currentOperatorSlug: "operator-one",
        factPageUrl: "https://example.com/fac-a",
        factMapUrl: "https://example.com/map/fac-a",
        geometry: { type: "Point", coordinates: [2.2, 60.2] },
        bbox: [2.1, 60.1, 2.3, 60.3],
        centroid: [2.2, 60.2],
        sourceSystem: "SODIR",
        sourceEntityType: "FACILITY",
        sourceId: "400",
      },
    ],
    tufs: [
      {
        npdId: 500,
        slug: "tuf-a",
        name: "TUF A",
        currentPhase: "Operating",
        medium: "Gas",
        belongsToName: "NordsjÃ¸en",
        operatorNpdCompanyId: 10,
        operatorCompanyName: "Operator One",
        operatorOrgNumber: "123456789",
        operatorCompanySlug: "operator-one",
        geometry: { type: "LineString", coordinates: [[2, 60], [3, 61]] },
        bbox: [2, 60, 3, 61],
        centroid: [2.5, 60.5],
        factPageUrl: "https://example.com/tuf-a",
        factMapUrl: "https://example.com/map/tuf-a",
        sourceSystem: "SODIR",
        sourceEntityType: "TUF",
        sourceId: "500",
      },
    ],
    surveys: [
      {
        npdId: 600,
        slug: "survey-a",
        name: "Survey A",
        status: "Finished",
        category: "Seismic",
        mainType: "3D",
        subType: "Marine",
        geographicalArea: "NordsjÃ¸en",
        companyName: "Operator One",
        companyNpdId: 10,
        startedAt: new Date("2025-01-01T00:00:00.000Z"),
        finalizedAt: new Date("2025-06-01T00:00:00.000Z"),
        factPageUrl: "https://example.com/survey-a",
        geometry: { type: "Polygon", coordinates: [[[2, 60], [3, 60], [3, 61], [2, 61], [2, 60]]] },
        bbox: [2, 60, 3, 61],
        centroid: [2.5, 60.5],
        sourceSystem: "SODIR",
        sourceEntityType: "SURVEY",
        sourceId: "600",
      },
    ],
    wellbores: [
      {
        npdId: 700,
        slug: "well-a",
        name: "Well A",
        drillingOperatorName: "Operator One",
        drillingOperatorNpdCompanyId: 10,
        drillingOperatorOrgNumber: "123456789",
        drillingOperatorSlug: "operator-one",
        purpose: "Exploration",
        status: "Completed",
        content: "Oil",
        wellType: "Wildcat",
        fieldName: "Field A",
        waterDepth: 123,
        totalDepth: 4567,
        mainArea: "NordsjÃ¸en",
        factPageUrl: "https://example.com/well-a",
        geometry: { type: "Point", coordinates: [2.7, 60.7] },
        bbox: [2.7, 60.7, 2.7, 60.7],
        centroid: [2.7, 60.7],
        sourceSystem: "SODIR",
        sourceEntityType: "WELLBORE",
        sourceId: "700",
      },
    ],
    productionPoints: [
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
    ],
    reserveSnapshots: [
      {
        entityType: "FIELD",
        entityNpdId: 100,
        recoverableOe: 120,
        remainingOe: 80,
      },
    ],
    investmentSnapshots: [
      {
        entityType: "FIELD",
        entityNpdId: 100,
        expectedFutureInvestmentMillNok: 250,
      },
    ],
  } as never;
}

describe("petroleum snapshot builders", () => {
  it("builds field and licence snapshots from raw petroleum tables", () => {
    const dataset = makeDataset();
    const fields = buildPetroleumFieldSnapshotRows(dataset, computedAt);
    const licences = buildPetroleumLicenceSnapshotRows(dataset, computedAt);

    expect(fields).toHaveLength(1);
    expect(fields[0]?.fieldNpdId).toBe(100);
    expect(fields[0]?.latestAnnualOe).toBe(18);
    expect(fields[0]?.latestMonthlyOe).toBe(1.8);
    expect(fields[0]?.remainingOe).toBe(80);
    expect(fields[0]?.expectedFutureInvestmentNok).toBe(250000000n);
    expect(fields[0]?.licenseeCompanyIds).toEqual([10, 20]);
    expect(fields[0]?.currentMonthDeltaPercent).not.toBeNull();

    expect(licences).toHaveLength(1);
    expect(licences[0]?.licenceNpdId).toBe(200);
    expect(licences[0]?.transferCount).toBe(2);
    expect(licences[0]?.licenseeCount).toBe(2);
    expect(licences[0]?.active).toBe(true);
  });

  it("builds operator and area rollups from the snapshot inputs", () => {
    const dataset = makeDataset();
    const operators = buildPetroleumOperatorSnapshotRows(dataset, computedAt);
    const areas = buildPetroleumAreaSnapshotRows(dataset, computedAt);

    expect(operators).toHaveLength(1);
    expect(operators[0]?.npdCompanyId).toBe(10);
    expect(operators[0]?.fieldCount).toBe(1);
    expect(operators[0]?.licenceCount).toBe(1);
    expect(operators[0]?.discoveryCount).toBe(1);
    expect(operators[0]?.facilityCount).toBe(1);
    expect(operators[0]?.latestProductionOe).toBe(18);
    expect(operators[0]?.mainAreas).toEqual(["Nordsjøen"]);

    expect(areas).toHaveLength(1);
    expect(areas[0]?.area).toBe("Nordsjøen");
    expect(areas[0]?.fieldCount).toBe(1);
    expect(areas[0]?.licenceCount).toBe(1);
    expect(areas[0]?.operatorCount).toBe(1);
    expect(areas[0]?.latestProductionOe).toBe(18);
  });

  it("builds map feature snapshots for the lightweight map read path", () => {
    const dataset = makeDataset();
    const rows = buildPetroleumMapFeatureSnapshotRows(dataset, computedAt);

    expect(rows.some((row) => row.layerId === "fields" && row.entityNpdId === 100)).toBe(true);
    expect(rows.some((row) => row.layerId === "licences" && row.entityNpdId === 200)).toBe(true);
    expect(rows.some((row) => row.layerId === "discoveries" && row.entityNpdId === 300)).toBe(true);
    expect(rows.some((row) => row.layerId === "facilities" && row.entityNpdId === 400)).toBe(true);
    expect(rows.some((row) => row.layerId === "tuf" && row.entityNpdId === 500)).toBe(true);
    expect(rows.some((row) => row.layerId === "surveys" && row.entityNpdId === 600)).toBe(true);
    expect(rows.some((row) => row.layerId === "wellbores" && row.entityNpdId === 700)).toBe(true);

    const fieldRow = rows.find(
      (row) => row.layerId === "fields" && row.entityNpdId === 100,
    ) as
      | {
          latestProductionOe?: number | null;
          remainingOe?: number | null;
          expectedFutureInvestmentNok?: bigint | null;
          productionYoYPercent?: number | null;
        }
      | undefined;
    expect(fieldRow?.latestProductionOe).toBe(18);
    expect(fieldRow?.remainingOe).toBe(80);
    expect(fieldRow?.expectedFutureInvestmentNok).toBe(250000000n);
    expect(fieldRow?.productionYoYPercent).not.toBeNull();
  });
});
