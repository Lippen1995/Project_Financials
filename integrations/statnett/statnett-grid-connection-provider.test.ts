import { describe, expect, it } from "vitest";

import { __testables } from "@/integrations/statnett/statnett-powerbi";

const { decodeDsr, rowsToCases } = __testables;

// Column schema mirrors the real report's DSR order: 8 dictionary-encoded group columns, two raw
// epoch-ms date columns, the connection-responsible dictionary column, and — because Power BI
// appends aggregates last — the capacity measure (M0) at the very end.
const SCHEMA = [
  { DN: "D0", N: "G0", T: 1 },
  { DN: "D1", N: "G1", T: 1 },
  { DN: "D2", N: "G2", T: 1 },
  { DN: "D3", N: "G3", T: 1 },
  { DN: "D4", N: "G4", T: 1 },
  { DN: "D5", N: "G5", T: 1 },
  { DN: "D6", N: "G6", T: 1 },
  { DN: "D7", N: "G7", T: 1 },
  { N: "G8", T: 7 },
  { N: "G9", T: 7 },
  { DN: "D8", N: "G10", T: 1 },
  { N: "M0", T: 3 },
];

function response(rows: unknown[]) {
  return {
    results: [
      {
        result: {
          data: {
            dsr: {
              DS: [
                {
                  ValueDicts: {
                    D0: ["24/01748", "25/02362"],
                    D1: ["ELB813", "ELB571"],
                    D2: ["Litle Sotra TRA", "Nedre Røssåga KRA/TRA"],
                    D3: ["Bergen og Haugalandet", "Helgeland og Salten"],
                    D4: ["NO5", "NO4"],
                    D5: ["BKK AS", "Linea AS"],
                    D6: ["Tresmarka AS", "Aker Nscale AS"],
                    D7: ["Transport", "Datasenter"],
                    D8: ["Magnus Tennøe", "Ingvild Birkeland"],
                  },
                  PH: [
                    { DM0: [{ A0: 270, S: [{ N: "A0", T: 3 }] }] },
                    { DM1: rows },
                  ],
                },
              ],
            },
          },
        },
      },
    ],
  };
}

describe("statnett-powerbi DSR decoder", () => {
  it("decodes dictionary indices, epoch dates and the capacity measure into cases", () => {
    const decoded = decodeDsr(
      response([
        { C: [0, 0, 0, 0, 0, 0, 0, 0, 1608595200000, 1859241600000, 0, 20], S: SCHEMA },
        { C: [1, 1, 1, 1, 1, 1, 1, 1, 1760918400000, 1846022400000, 1, 250] },
      ]),
    );
    const cases = rowsToCases(decoded);

    expect(cases).toHaveLength(2);
    expect(cases[1]).toMatchObject({
      saksnr: "25/02362",
      station: "Nedre Røssåga KRA/TRA",
      priceArea: "NO4",
      gridOwner: "Linea AS",
      endCustomer: "Aker Nscale AS",
      industry: "Datasenter",
      capacityMw: 250,
      primaryDate: 1760918400000,
      plannedConnectionDate: 1846022400000,
    });
  });

  it("expands the R repeat bitmask by copying columns from the previous row", () => {
    // Bit 4 set (priceArea) → that column is copied from the prior row and absent from C.
    const decoded = decodeDsr(
      response([
        { C: [0, 0, 0, 0, 1, 0, 0, 0, 1608595200000, 1859241600000, 0, 20], S: SCHEMA },
        { C: [1, 1, 1, 1, 1, 1, 1, 1762041600000, 1824940800000, 1, 140], R: 16 },
      ]),
    );
    const cases = rowsToCases(decoded);

    // priceArea (index 4) repeats "NO4" from row 0; everything else comes from C.
    expect(cases[1].priceArea).toBe("NO4");
    expect(cases[1].endCustomer).toBe("Aker Nscale AS");
    expect(cases[1].capacityMw).toBe(140);
  });

  it("throws a descriptive error when the query is rejected", () => {
    expect(() =>
      decodeDsr({
        results: [
          {
            result: {
              data: { dsr: { DataShapes: [{ "odata.error": { message: { value: "invalid Column reference" } } }] } },
            },
          },
        ],
      }),
    ).toThrow(/invalid Column reference/);
  });
});
