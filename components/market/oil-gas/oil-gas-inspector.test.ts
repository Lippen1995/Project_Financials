import { describe, expect, it } from "vitest";

import {
  getCompactInspectorRows,
  getCompactInspectorSubtitle,
} from "@/components/market/oil-gas/oil-gas-inspector";
import { PetroleumEntityDetail, PetroleumMapFeature } from "@/lib/types";

function makeFeature(overrides: Partial<PetroleumMapFeature>): PetroleumMapFeature {
  return {
    id: "FIELD:test-field",
    layerId: "fields",
    entityType: "FIELD",
    entityId: "test-field",
    name: "Test field",
    geometry: { type: "Point", coordinates: [2, 60] },
    sourceSystem: "SODIR",
    sourceEntityType: "FIELD",
    sourceId: "123",
    fetchedAt: new Date("2026-04-12T00:00:00.000Z"),
    normalizedAt: new Date("2026-04-12T00:00:00.000Z"),
    ...overrides,
  };
}

function makeDetail(overrides: Partial<PetroleumEntityDetail>): PetroleumEntityDetail {
  return {
    id: "FIELD:test-field",
    entityType: "FIELD",
    entityNpdId: 123,
    name: "Test field",
    licensees: [],
    timeseries: [],
    relatedEvents: [],
    relatedCompanyLinks: [],
    metadata: {
      sourceSystem: "SODIR",
      sourceEntityType: "FIELD",
      sourceId: "123",
    },
    ...overrides,
  };
}

describe("getCompactInspectorRows", () => {
  it("builds field rows without unavailable placeholders", () => {
    const rows = getCompactInspectorRows(
      makeDetail({
        status: "Producing",
        area: "Nordsjøen",
        hcType: "Oil",
        operator: {
          npdCompanyId: 10,
          companyName: "Operator One",
          orgNumber: "123456789",
          slug: "operator-one",
        },
        reserve: {
          entityType: "FIELD",
          entityId: "test-field",
          entityNpdId: 123,
          entityName: "Test field",
          remainingOe: 80,
        },
        investment: {
          entityType: "FIELD",
          entityId: "test-field",
          entityNpdId: 123,
          entityName: "Test field",
          expectedFutureInvestmentNok: 250_000_000,
          fixedYear: null,
        },
      }),
      makeFeature({
        status: "Producing",
        area: "Nordsjøen",
        selectedProductionValue: 120000,
        selectedProductionUnit: "boepd",
      }),
      {
        selectedMetricLabel: "Produksjon",
        selectedMetricUnit: "boepd",
        selectedView: "rate",
      },
    );

    expect(rows.map((row) => row.label)).toEqual([
      "Operatør",
      "Hydrokarbon",
      "Status",
      "Område",
      "Produksjon",
      "Gjenværende",
      "Forv. investering",
    ]);
    expect(rows.some((row) => row.value === "Ikke tilgjengelig")).toBe(false);
  });

  it("uses detail-first fallback for licence rows", () => {
    const rows = getCompactInspectorRows(
      makeDetail({
        entityType: "LICENCE",
        phase: "Production",
        status: "Active",
        area: "Norskehavet",
      }),
      makeFeature({
        entityType: "LICENCE",
        layerId: "licences",
        currentAreaSqKm: 12.5,
        transferCount: 3,
        operator: {
          npdCompanyId: 10,
          companyName: "Operator One",
          orgNumber: "123456789",
          slug: "operator-one",
        },
      }),
      {
        selectedMetricLabel: "Produksjon",
        selectedMetricUnit: "boepd",
        selectedView: "volume",
      },
    );

    expect(rows).toEqual([
      { label: "Operatør", value: "Operator One" },
      { label: "Status", value: "Active" },
      { label: "Fase", value: "Production" },
      { label: "Område", value: "Norskehavet" },
      { label: "Areal", value: "12,5 km²" },
      { label: "Overføringer", value: "3" },
    ]);
  });

  it("returns a calm subtitle from available metadata only", () => {
    const subtitle = getCompactInspectorSubtitle(
      makeDetail({
        entityType: "SURVEY",
        status: "Ferdig",
        area: "Norskehavet",
      }),
      null,
    );

    expect(subtitle).toBe("Survey · Ferdig · Norskehavet");
  });
});
