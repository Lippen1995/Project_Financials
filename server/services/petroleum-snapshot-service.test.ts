import { describe, expect, it } from "vitest";

import {
  buildPetroleumAreaSnapshotRows,
  buildPetroleumFieldSnapshotRows,
  buildPetroleumLicenceSnapshotRows,
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
});
