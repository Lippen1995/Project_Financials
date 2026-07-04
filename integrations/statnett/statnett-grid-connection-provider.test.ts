import { describe, expect, it } from "vitest";

import { __testables } from "@/integrations/statnett/statnett-grid-connection-provider";

describe("statnett-grid-connection-provider", () => {
  it("maps public connection records to MW with provenance", () => {
    const mapped = __testables.mapRecord(
      {
        Kundenavn: "Nord Kraft AS",
        Prosjekt: "Ny fabrikk",
        "Reservert kapasitet (MW)": "125,5",
        Status: "Reservert",
        Kommune: "Narvik",
      },
      "https://statnett.example/grid.xlsx",
      "Reservasjoner",
      0,
    );

    expect(mapped).toMatchObject({
      companyName: "Nord Kraft AS",
      projectName: "Ny fabrikk",
      status: "RESERVED",
      capacityMw: 125.5,
      municipality: "Narvik",
      sourceSystem: "STATNETT",
      sourceEntityType: "GRID_CONNECTION_CASE",
    });
  });

  it("normalizes kW capacity to MW", () => {
    const mapped = __testables.mapRecord(
      {
        Kunde: "Nord Kraft AS",
        "Effekt kW": 15000,
        Status: "Kapasitetskø",
      },
      "https://statnett.example/grid.xlsx",
      undefined,
      0,
    );

    expect(mapped?.capacityMw).toBe(15);
  });
});
