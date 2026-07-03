import { describe, expect, it } from "vitest";

import {
  mapStructuredRegnskapEntry,
  mapStructuredRegnskapResponse,
} from "@/integrations/brreg/structured-regnskap";

// Shape captured from the live API 2026-07-04 (org 835347702, FY2025).
const SMALL_AS_ENTRY = {
  id: 6785416,
  journalnr: "2026357688",
  regnskapstype: "SELSKAP",
  virksomhet: {
    organisasjonsnummer: "835347702",
    organisasjonsform: "AS",
    morselskap: false,
  },
  regnskapsperiode: { fraDato: "2025-01-01", tilDato: "2025-12-31" },
  valuta: "NOK",
  avviklingsregnskap: false,
  oppstillingsplan: "store",
  egenkapitalGjeld: {
    sumEgenkapitalGjeld: 93716.0,
    egenkapital: {
      sumEgenkapital: 4131.0,
      opptjentEgenkapital: { sumOpptjentEgenkapital: 4131.0 },
      innskuttEgenkapital: {},
    },
    gjeldOversikt: {
      sumGjeld: 89585.0,
      kortsiktigGjeld: { sumKortsiktigGjeld: 89585.0 },
      langsiktigGjeld: {},
    },
  },
  eiendeler: {
    sumEiendeler: 93716.0,
    omloepsmidler: { sumOmloepsmidler: 93716.0 },
    anleggsmidler: {},
  },
  resultatregnskapResultat: {
    ordinaertResultatFoerSkattekostnad: 4131.0,
    aarsresultat: 4131.0,
    finansresultat: { finansinntekt: {}, finanskostnad: {} },
    driftsresultat: {
      driftsresultat: 4131.0,
      driftsinntekter: { sumDriftsinntekter: 314053.0 },
      driftskostnad: { sumDriftskostnad: 309921.0 },
    },
  },
};

describe("mapStructuredRegnskapEntry", () => {
  it("maps headline figures in whole NOK", () => {
    const mapped = mapStructuredRegnskapEntry(SMALL_AS_ENTRY);
    expect(mapped).not.toBeNull();
    expect(mapped!.fiscalYear).toBe(2025);
    expect(mapped!.statementScope).toBe("COMPANY");
    expect(mapped!.currency).toBe("NOK");
    expect(mapped!.revenue).toBe(314053);
    expect(mapped!.operatingProfit).toBe(4131);
    expect(mapped!.netIncome).toBe(4131);
    expect(mapped!.equity).toBe(4131);
    expect(mapped!.assets).toBe(93716);
  });

  it("collects canonical anchor values with taxonomy keys", () => {
    const mapped = mapStructuredRegnskapEntry(SMALL_AS_ENTRY)!;
    expect(mapped.canonicalValues).toMatchObject({
      total_operating_income: 314053,
      total_operating_expenses: 309921,
      operating_profit: 4131,
      profit_before_tax: 4131,
      net_income: 4131,
      total_assets: 93716,
      current_assets: 93716,
      total_equity_and_liabilities: 93716,
      total_equity: 4131,
      retained_earnings: 4131,
      total_liabilities: 89585,
      current_liabilities: 89585,
    });
    // Empty sub-objects must not produce keys.
    expect(mapped.canonicalValues).not.toHaveProperty("financial_income");
    expect(mapped.canonicalValues).not.toHaveProperty("long_term_liabilities");
  });

  it("rejects entries without a valid period", () => {
    expect(mapStructuredRegnskapEntry({ ...SMALL_AS_ENTRY, regnskapsperiode: {} })).toBeNull();
  });

  it("marks konsern entries as CONSOLIDATED", () => {
    const mapped = mapStructuredRegnskapEntry({
      ...SMALL_AS_ENTRY,
      regnskapstype: "KONSERN",
    })!;
    expect(mapped.statementScope).toBe("CONSOLIDATED");
  });
});

describe("mapStructuredRegnskapResponse", () => {
  it("maps arrays and drops invalid entries", () => {
    const mapped = mapStructuredRegnskapResponse([
      SMALL_AS_ENTRY,
      { regnskapsperiode: {} },
      "garbage",
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]!.fiscalYear).toBe(2025);
  });

  it("returns empty for non-array payloads", () => {
    expect(mapStructuredRegnskapResponse({ error: "500" })).toEqual([]);
    expect(mapStructuredRegnskapResponse(null)).toEqual([]);
  });
});
