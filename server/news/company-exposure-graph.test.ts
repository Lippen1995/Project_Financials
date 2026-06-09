import { describe, expect, it } from "vitest";

import {
  buildCompanyExposureGraphEdges,
  scoreCompanyExposureGraph,
} from "@/server/news/company-exposure-graph";

describe("company exposure graph", () => {
  it("builds traceable petroleum, geography and commodity edges from official data", () => {
    const edges = buildCompanyExposureGraphEdges({
      industryCode: {
        code: "06.100",
        title: "Utvinning av råolje",
        sourceSystem: "SSB",
        sourceEntityType: "INDUSTRY_CODE",
        sourceId: "06.100",
        fetchedAt: new Date("2026-06-01"),
      },
      petroleumExposure: {
        npdCompanyId: 123,
        operatorFieldCount: 12,
        licenceCount: 20,
        mainAreas: ["North Sea"],
        sourceSystem: "SODIR",
        sourceEntityType: "PETROLEUM_COMPANY_EXPOSURE",
        sourceId: "company:equinor",
        fetchedAt: new Date("2026-06-01"),
      },
      petroleumOperator: {
        mainAreas: ["North Sea"],
        mainHydrocarbonTypes: ["OIL", "GAS"],
        sourceSystem: "SODIR",
        sourceEntityType: "PETROLEUM_OPERATOR_SNAPSHOT",
        sourceId: "operator:123",
        computedAt: new Date("2026-06-01"),
      },
    });

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeType: "sector", nodeKey: "petroleum" }),
        expect.objectContaining({ nodeType: "geography", nodeKey: "north_sea" }),
        expect.objectContaining({ nodeType: "commodity", nodeKey: "crude_oil" }),
        expect.objectContaining({ nodeType: "commodity", nodeKey: "natural_gas" }),
      ]),
    );
  });

  it("connects IEA gas news through an explicit commodity graph path", () => {
    const matches = scoreCompanyExposureGraph(
      {
        eventType: "macro_news",
        sourceId: "iea-news",
        title: "Global LNG supply wave delayed by natural gas disruption",
      },
      [
        {
          relationType: "produces_commodity",
          weight: 0.9,
          confidenceScore: 0.95,
          rationale: "Official production exposure.",
          node: {
            nodeType: "commodity",
            key: "natural_gas",
            label: "Naturgass",
          },
        },
      ],
      0.7,
    );

    expect(matches[0]).toEqual(
      expect.objectContaining({
        exposureType: "commodity",
        exposureScore: expect.any(Number),
      }),
    );
    expect(matches[0].rationale).toContain("Naturgass");
  });

  it("prefers a specific commodity explanation over a nearly equal sector match", () => {
    const matches = scoreCompanyExposureGraph(
      {
        eventType: "macro_news",
        sourceId: "iea-news",
        title: "Natural gas and LNG supply outlook",
      },
      [
        {
          relationType: "verified_sector_exposure",
          weight: 0.92,
          confidenceScore: 0.98,
          node: { nodeType: "sector", key: "petroleum", label: "Petroleum" },
        },
        {
          relationType: "produces_commodity",
          weight: 0.9,
          confidenceScore: 0.95,
          node: { nodeType: "commodity", key: "natural_gas", label: "Naturgass" },
        },
      ],
      0.7,
    );

    expect(matches[0].exposureType).toBe("commodity");
  });

  it("inherits operating exposure through a documented controlling ownership", () => {
    const edges = buildCompanyExposureGraphEdges({
      controlledSubsidiaries: [
        {
          orgNumber: "990888213",
          name: "EQUINOR ENERGY AS",
          ownershipPercent: 100,
          sourceSystem: "SKATTEETATEN_CSV",
          sourceEntityType: "shareholder_register_row",
          sourceId: "2025:2723666",
          fetchedAt: new Date("2026-01-01"),
          exposure: {
            petroleumExposure: {
              npdCompanyId: 32011216,
              operatorFieldCount: 61,
              licenceCount: 322,
              mainAreas: ["North sea"],
              sourceSystem: "SODIR",
              sourceEntityType: "PETROLEUM_COMPANY_EXPOSURE",
              sourceId: "company:energy",
              fetchedAt: new Date("2026-06-01"),
            },
            petroleumOperator: {
              mainAreas: ["North sea"],
              mainHydrocarbonTypes: ["GAS", "OIL"],
              sourceSystem: "SODIR",
              sourceEntityType: "PETROLEUM_OPERATOR_SNAPSHOT",
              sourceId: "operator:32011216",
              computedAt: new Date("2026-06-01"),
            },
          },
        },
      ],
    });

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeKey: "natural_gas",
          relationType: "inherits_exposure_from_controlled_subsidiary",
          sourceEntityType: "DERIVED_FROM_OWNERSHIP_AND_OFFICIAL_EXPOSURE",
        }),
      ]),
    );
  });

  it("does not treat generic traffic production updates as upstream petroleum events", () => {
    const matches = scoreCompanyExposureGraph(
      {
        eventType: "production_update",
        sourceId: "oslobors",
        title: "Traffic figures for May 2026",
        summary: "Passenger volume increased during the month.",
      },
      [
        {
          relationType: "participates_in_value_chain",
          weight: 0.96,
          confidenceScore: 0.96,
          node: {
            nodeType: "value_chain",
            key: "upstream_oil_gas",
            label: "Oppstrøms olje og gass",
          },
        },
      ],
      0.7,
    );

    expect(matches).toEqual([]);
  });
});
