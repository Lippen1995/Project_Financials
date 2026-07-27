import { describe, expect, it } from "vitest";

import {
  parseStructuredRegnskapResponse,
  STRUCTURED_FINANCIAL_MODEL_VERSION,
  mapStructuredRegnskapEntry,
  mapStructuredRegnskapResponse,
} from "@/integrations/brreg/structured-regnskap";

const source = {
  orgNumber: "000000000",
  fetchedAt: new Date("2026-07-27T08:00:00.000Z"),
  normalizedAt: new Date("2026-07-27T08:00:01.000Z"),
};

// Shape captured from the live API 2026-07-04; identity replaced by a sentinel.
const SMALL_AS_ENTRY = {
  id: 6785416,
  journalnr: "2026357688",
  regnskapstype: "SELSKAP",
  virksomhet: {
    organisasjonsnummer: source.orgNumber,
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
  it("maps headline figures with a versioned period, unit and provenance contract", () => {
    const mapped = mapStructuredRegnskapEntry(SMALL_AS_ENTRY, source);
    expect(mapped).not.toBeNull();
    expect(mapped!.fiscalYear).toBe(2025);
    expect(mapped!.modelVersion).toBe(STRUCTURED_FINANCIAL_MODEL_VERSION);
    expect(mapped!.period).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(mapped!.amountUnit).toBe("WHOLE_CURRENCY_UNITS");
    expect(mapped!.unitScale).toBe(1);
    expect(mapped!.statementScope).toBe("COMPANY");
    expect(mapped!.currency).toBe("NOK");
    expect(mapped!.revenue).toBe(314053);
    expect(mapped!.operatingProfit).toBe(4131);
    expect(mapped!.netIncome).toBe(4131);
    expect(mapped!.equity).toBe(4131);
    expect(mapped!.assets).toBe(93716);
    expect(mapped).toMatchObject({
      sourceSystem: "BRREG",
      sourceEntityType: "structuredAnnualAccounts",
      sourceId: "2026357688",
      fetchedAt: source.fetchedAt,
      normalizedAt: source.normalizedAt,
    });
  });

  it("collects canonical anchor values with taxonomy keys", () => {
    const mapped = mapStructuredRegnskapEntry(SMALL_AS_ENTRY, source)!;
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
    expect(
      mapStructuredRegnskapEntry({ ...SMALL_AS_ENTRY, regnskapsperiode: {} }, source),
    ).toBeNull();
  });

  it("rejects entries without any usable financial values", () => {
    expect(
      mapStructuredRegnskapEntry(
        {
          journalnr: "empty-entry",
          regnskapstype: "SELSKAP",
          avviklingsregnskap: false,
          regnskapsperiode: { tilDato: "2025-12-31" },
          valuta: "NOK",
        },
        source,
      ),
    ).toBeNull();
  });

  it("marks konsern entries as CONSOLIDATED", () => {
    const mapped = mapStructuredRegnskapEntry({
      ...SMALL_AS_ENTRY,
      regnskapstype: "KONSERN",
    }, source)!;
    expect(mapped.statementScope).toBe("CONSOLIDATED");
  });
});

describe("mapStructuredRegnskapResponse", () => {
  it("maps arrays and drops invalid entries", () => {
    const mapped = mapStructuredRegnskapResponse([
      SMALL_AS_ENTRY,
      { regnskapsperiode: {} },
      "garbage",
    ], source);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]!.fiscalYear).toBe(2025);
  });

  it("returns empty for non-array payloads", () => {
    expect(mapStructuredRegnskapResponse({ error: "500" }, source)).toEqual([]);
    expect(mapStructuredRegnskapResponse(null, source)).toEqual([]);
  });
});

describe("parseStructuredRegnskapResponse", () => {
  it("rejects a changed successful response instead of presenting it as no data", () => {
    expect(() => parseStructuredRegnskapResponse({ data: [] }, source)).toThrow(
      "Uventet responsformat",
    );
  });

  it("rejects an array where no entry satisfies the Brreg contract", () => {
    expect(() =>
      parseStructuredRegnskapResponse([{ regnskapsperiode: {} }], source),
    ).toThrow("ingen gyldige regnskap");
  });
});
