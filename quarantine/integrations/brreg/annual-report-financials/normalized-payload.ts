import { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";

type FactLookup = Map<string, CanonicalFactCandidate>;

function setIfPresent(target: Record<string, unknown>, key: string, value: number | null) {
  if (value !== null && value !== undefined) {
    target[key] = value;
  }
}

function getValue(facts: FactLookup, key: string) {
  return facts.get(key)?.value ?? null;
}

function sumDefined(values: Array<number | null>) {
  const defined = values.filter((value): value is number => value !== null);
  if (defined.length === 0) {
    return null;
  }

  return defined.reduce((sum, value) => sum + value, 0);
}

export function buildNormalizedFinancialPayload(fiscalYear: number, facts: FactLookup) {
  const driftsinntekter: Record<string, unknown> = {};
  setIfPresent(driftsinntekter, "salgsinntekter", getValue(facts, "revenue"));
  setIfPresent(driftsinntekter, "annenDriftsinntekt", getValue(facts, "other_operating_income"));
  setIfPresent(driftsinntekter, "sumDriftsinntekter", getValue(facts, "total_operating_income"));

  const driftskostnad: Record<string, unknown> = {};
  setIfPresent(driftskostnad, "varekostnad", getValue(facts, "cost_of_goods_sold"));
  setIfPresent(driftskostnad, "loennskostnad", getValue(facts, "payroll_expense"));
  setIfPresent(driftskostnad, "avskrivninger", getValue(facts, "depreciation_amortization"));
  setIfPresent(driftskostnad, "annenDriftskostnad", getValue(facts, "other_operating_expense"));
  setIfPresent(driftskostnad, "sumDriftskostnad", getValue(facts, "total_operating_expenses"));

  const finansinntekt: Record<string, unknown> = {};
  setIfPresent(finansinntekt, "sumFinansinntekter", getValue(facts, "financial_income"));

  const finanskostnad: Record<string, unknown> = {};
  setIfPresent(finanskostnad, "sumFinanskostnad", getValue(facts, "financial_expense"));

  const anleggsmidler: Record<string, unknown> = {};
  setIfPresent(anleggsmidler, "sumImmaterielleEiendeler", getValue(facts, "intangible_assets"));
  setIfPresent(anleggsmidler, "sumVarigeDriftsmidler", getValue(facts, "tangible_assets"));
  setIfPresent(anleggsmidler, "sumFinansielleAnleggsmidler", getValue(facts, "financial_fixed_assets"));
  setIfPresent(
    anleggsmidler,
    "sumAnleggsmidler",
    sumDefined([
      getValue(facts, "intangible_assets"),
      getValue(facts, "tangible_assets"),
      getValue(facts, "financial_fixed_assets"),
    ]),
  );

  const eiendeler: Record<string, unknown> = {
    anleggsmidler,
    omloepsmidler: {},
  };
  setIfPresent(eiendeler, "utsattSkattefordel", getValue(facts, "deferred_tax_asset"));
  setIfPresent(eiendeler, "sumVarer", getValue(facts, "inventory"));
  setIfPresent(eiendeler, "kundefordringer", getValue(facts, "trade_receivables"));
  setIfPresent(eiendeler, "andreKortsiktigeFordringer", getValue(facts, "other_receivables"));
  setIfPresent(eiendeler, "sumBankinnskuddOgKontanter", getValue(facts, "cash_and_cash_equivalents"));
  setIfPresent(
    eiendeler.omloepsmidler as Record<string, unknown>,
    "sumOmloepsmidler",
    getValue(facts, "current_assets"),
  );
  setIfPresent(eiendeler, "sumEiendeler", getValue(facts, "total_assets"));

  const innskuttEgenkapital: Record<string, unknown> = {};
  setIfPresent(innskuttEgenkapital, "aksjekapital", getValue(facts, "share_capital"));
  setIfPresent(innskuttEgenkapital, "overkurs", getValue(facts, "share_premium"));

  const opptjentEgenkapital: Record<string, unknown> = {};
  setIfPresent(opptjentEgenkapital, "annenEgenkapital", getValue(facts, "retained_earnings"));

  const kortsiktigGjeld: Record<string, unknown> = {};
  setIfPresent(kortsiktigGjeld, "leverandorgjeld", getValue(facts, "trade_payables"));
  setIfPresent(kortsiktigGjeld, "betalbarSkatt", getValue(facts, "tax_payable"));
  setIfPresent(
    kortsiktigGjeld,
    "skyldigOffentligeAvgifter",
    getValue(facts, "public_duties_payable"),
  );
  setIfPresent(kortsiktigGjeld, "annenKortsiktigGjeld", getValue(facts, "other_current_liabilities"));
  setIfPresent(kortsiktigGjeld, "sumKortsiktigGjeld", getValue(facts, "current_liabilities"));

  const langsiktigGjeld: Record<string, unknown> = {};
  setIfPresent(langsiktigGjeld, "sumLangsiktigGjeld", getValue(facts, "long_term_liabilities"));

  const payload: Record<string, unknown> = {
    valuta: "NOK",
    regnskapsperiode: {
      fraDato: `${fiscalYear}-01-01`,
      tilDato: `${fiscalYear}-12-31`,
    },
    resultatregnskapResultat: {
      driftsresultat: {
        driftsinntekter,
        driftskostnad,
        driftsresultat: getValue(facts, "operating_profit"),
      },
      finansresultat: {
        finansinntekt,
        finanskostnad,
        nettoFinans: getValue(facts, "net_financial_items"),
      },
      ordinaertResultatFoerSkattekostnad: getValue(facts, "profit_before_tax"),
      skattekostnadResultat: getValue(facts, "tax_expense"),
      aarsresultat: getValue(facts, "net_income"),
      totalresultat: getValue(facts, "net_income"),
    },
    eiendeler,
    egenkapitalGjeld: {
      egenkapital: {
        innskuttEgenkapital,
        opptjentEgenkapital,
        sumEgenkapital: getValue(facts, "total_equity"),
      },
      gjeldOversikt: {
        langsiktigGjeld,
        kortsiktigGjeld,
        sumGjeld: getValue(facts, "total_liabilities"),
      },
      sumEgenkapitalGjeld: getValue(facts, "total_equity_and_liabilities"),
    },
  };

  return payload;
}
