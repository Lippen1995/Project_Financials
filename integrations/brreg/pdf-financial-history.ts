import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import env from "@/lib/env";
import { mapBrregFinancialStatement } from "@/integrations/brreg/mappers";
import { NormalizedFinancialStatement } from "@/lib/types";

type ParsedPayload = Record<string, any>;
type OcrPage = {
  text: string;
};

type RowDefinition = {
  aliases: string[];
  noteTokenLikely?: boolean;
  apply: (payload: ParsedPayload, value: number) => void;
};

const resultRows: RowDefinition[] = [
  {
    aliases: ["salgsinntekt", "salgsinntekter"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.driftsresultat.driftsinntekter.salgsinntekter = value;
    },
  },
  {
    aliases: ["sum inntekter", "sum driftsinntekter"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.driftsresultat.driftsinntekter.sumDriftsinntekter = value;
    },
  },
  {
    aliases: ["varekostnad"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.driftsresultat.driftskostnad.varekostnad = value;
    },
  },
  {
    aliases: ["lonnskostnad", "lonnskostnader", "lennskostnad"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.resultatregnskapResultat.driftsresultat.driftskostnad.loennskostnad = value;
    },
  },
  {
    aliases: ["annen driftskostnad"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.resultatregnskapResultat.driftsresultat.driftskostnad.annenDriftskostnad = value;
    },
  },
  {
    aliases: ["sum kostnader", "sum driftskostnader"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.driftsresultat.driftskostnad.sumDriftskostnad = value;
    },
  },
  {
    aliases: ["driftsresultat"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.driftsresultat.driftsresultat = value;
    },
  },
  {
    aliases: ["renteinntekt fra tilknyttet selskap"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.finansresultat.finansinntekt.renteinntektTilknyttetSelskap = value;
    },
  },
  {
    aliases: ["annen renteinntekt"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.finansresultat.finansinntekt.annenRenteinntekt = value;
    },
  },
  {
    aliases: ["annen finansinntekt"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.finansresultat.finansinntekt.annenFinansinntekt = value;
    },
  },
  {
    aliases: ["sum finansinntekter"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.finansresultat.finansinntekt.sumFinansinntekter = value;
    },
  },
  {
    aliases: ["rentekostnad til tilknyttet selskap"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.finansresultat.finanskostnad.rentekostnadTilknyttetSelskap = value;
    },
  },
  {
    aliases: ["annen rentekostnad"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.finansresultat.finanskostnad.annenRentekostnad = value;
    },
  },
  {
    aliases: ["annen finanskostnad"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.finansresultat.finanskostnad.annenFinanskostnad = value;
    },
  },
  {
    aliases: ["sum finanskostnader", "sum finanskeostnader"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.finansresultat.finanskostnad.sumFinanskostnad = value;
    },
  },
  {
    aliases: ["resultat av finansposter", "netto finans"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.finansresultat.nettoFinans = value;
    },
  },
  {
    aliases: ["resultat fgr skattekostnad", "ordinzrt resultat for gkattekoztnad", "ordinaert resultat for skattekostnad"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.ordinaertResultatFoerSkattekostnad = value;
    },
  },
  {
    aliases: ["skattekostnad pa resultat"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.resultatregnskapResultat.skattekostnadResultat = value;
    },
  },
  {
    aliases: ["ordinaert resultat etter skattekostnad", "ordinzrt resultat etter gkattekoztnad"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.ordinaertResultatEtterSkattekostnad = value;
    },
  },
  {
    aliases: ["arsresultat"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.resultatregnskapResultat.aarsresultat = value;
    },
  },
  {
    aliases: ["totalrezultat", "totalresultat"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.totalresultat = value;
    },
  },
  {
    aliases: ["ordinert utbytte", "avsatt til utbytte"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.overforinger.utbytte = value;
    },
  },
  {
    aliases: ["avzsatt til annen egenkapital", "avsatt til annen egenkapital"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.overforinger.avsattTilAnnenEgenkapital = value;
    },
  },
  {
    aliases: ["overfert fra annen egenkapital", "overfgrt fra annen egenkapital"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.overforinger.overfortFraAnnenEgenkapital = value;
    },
  },
  {
    aliases: ["sum overfgringer", "sum overferinger og disponeringer", "sum overforinger"],
    apply: (payload, value) => {
      payload.resultatregnskapResultat.overforinger.sumOverforinger = value;
    },
  },
];

const assetRows: RowDefinition[] = [
  {
    aliases: ["sum varer"],
    apply: (payload, value) => {
      payload.eiendeler.sumVarer = value;
    },
  },
  {
    aliases: ["kundefordringer"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.eiendeler.kundefordringer = value;
    },
  },
  {
    aliases: ["kundefordringer konsern"],
    apply: (payload, value) => {
      payload.eiendeler.kundefordringerKonsern = value;
    },
  },
  {
    aliases: ["andre kortsiktige fordringer"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.eiendeler.andreKortsiktigeFordringer = value;
    },
  },
  {
    aliases: ["konsernfordringer"],
    apply: (payload, value) => {
      payload.eiendeler.konsernfordringer = value;
    },
  },
  {
    aliases: ["sum fordringer"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.eiendeler.sumFordringer = value;
    },
  },
  {
    aliases: [
      "bankinnskudd, kontanter o.l.",
      "bankinnskudd, kontanter o.",
      "sum bankinnskudd, kontanter og lignende",
      "bankinnskudd, kontanter og lignende",
    ],
    apply: (payload, value) => {
      payload.eiendeler.sumBankinnskuddOgKontanter = value;
    },
  },
  {
    aliases: ["sum omlepsmidler", "sum omlopsmidler", "sum omigpsmidler"],
    apply: (payload, value) => {
      payload.eiendeler.omloepsmidler.sumOmloepsmidler = value;
    },
  },
  {
    aliases: ["sum anleggsmidler"],
    apply: (payload, value) => {
      payload.eiendeler.anleggsmidler.sumAnleggsmidler = value;
    },
  },
  {
    aliases: ["sum eiendeler"],
    apply: (payload, value) => {
      payload.eiendeler.sumEiendeler = value;
    },
  },
];

const equityRows: RowDefinition[] = [
  {
    aliases: ["aksjekapital"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.egenkapitalGjeld.egenkapital.innskuttEgenkapital.aksjekapital = value;
    },
  },
  {
    aliases: ["overkurs"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.egenkapital.innskuttEgenkapital.overkurs = value;
    },
  },
  {
    aliases: ["annen innskutt egenkapital"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.egenkapital.innskuttEgenkapital.annenInnskuttEgenkapital = value;
    },
  },
  {
    aliases: ["sum innskutt egenkapital"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.egenkapital.innskuttEgenkapital.sumInnskuttEgenkaptial = value;
    },
  },
  {
    aliases: ["annen egenkapital"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.egenkapital.opptjentEgenkapital.annenEgenkapital = value;
    },
  },
  {
    aliases: ["sum opptjent egenkapital"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.egenkapital.opptjentEgenkapital.sumOpptjentEgenkapital = value;
    },
  },
  {
    aliases: ["sum egenkapital"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.egenkapitalGjeld.egenkapital.sumEgenkapital = value;
    },
  },
  {
    aliases: ["gjeld til kredittinstitusjoner"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.gjeldTilKredittinstitusjoner = value;
    },
  },
  {
    aliases: ["sum annen langsiktig gjeld", "sum langsiktig gjeld"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.sumLangsiktigGjeld = value;
    },
  },
  {
    aliases: ["leverandergjeld", "leverandgrgjeld"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.leverandorgjeld = value;
    },
  },
  {
    aliases: ["betalbar skatt"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.betalbarSkatt = value;
    },
  },
  {
    aliases: ["skyldig offentlige avgifter"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.skyldigOffentligeAvgifter = value;
    },
  },
  {
    aliases: ["utbytte"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.utbytte = value;
    },
  },
  {
    aliases: ["annen kortsiktig gjeld"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.annenKortsiktigGjeld = value;
    },
  },
  {
    aliases: ["sum kortsiktig gjeld", "sum kortziktig gjeld"],
    noteTokenLikely: true,
    apply: (payload, value) => {
      payload.egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.sumKortsiktigGjeld = value;
    },
  },
  {
    aliases: ["sum gjeld"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.gjeldOversikt.sumGjeld = value;
    },
  },
  {
    aliases: ["sum egenkapital og gjeld"],
    apply: (payload, value) => {
      payload.egenkapitalGjeld.sumEgenkapitalGjeld = value;
    },
  },
];

function createEmptyPayload(year: number) {
  return {
    journalnr: null,
    valuta: "NOK",
    regnskapsperiode: {
      fraDato: `${year}-01-01`,
      tilDato: `${year}-12-31`,
    },
    resultatregnskapResultat: {
      driftsresultat: {
        driftsinntekter: {},
        driftskostnad: {},
      },
      finansresultat: {
        finansinntekt: {},
        finanskostnad: {},
      },
      overforinger: {},
    },
    eiendeler: {
      omloepsmidler: {},
      anleggsmidler: {},
    },
    egenkapitalGjeld: {
      egenkapital: {
        opptjentEgenkapital: {},
        innskuttEgenkapital: {},
      },
      gjeldOversikt: {
        kortsiktigGjeld: {},
        langsiktigGjeld: {},
      },
    },
  };
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[|]/g, " ")
    .replace(/[@]/g, "o")
    .replace(/[=:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYearPair(text: string) {
  const match = text.match(/(?:note|belep i:\s*nok note)\s*(20\d{2})\s*(20\d{2})/i);
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2])] as const;
}

function splitScore(tokens: string[], index: number) {
  const left = tokens.slice(0, index).join("");
  const right = tokens.slice(index).join("");
  const leftDigits = left.replace("-", "").length;
  const rightDigits = right.replace("-", "").length;

  return Math.abs(leftDigits - rightDigits) + Math.abs(tokens.length - 2 * index) * 0.25;
}

function chooseSplit(tokens: string[]) {
  let bestIndex = 1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 1; index < tokens.length; index += 1) {
    const score = splitScore(tokens, index);

    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function candidateScore(tokens: string[]) {
  if (tokens.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  const splitIndex = chooseSplit(tokens);
  const left = tokens.slice(0, splitIndex).join("");
  const right = tokens.slice(splitIndex).join("");
  const leftDigits = left.replace("-", "").length;
  const rightDigits = right.replace("-", "").length;
  const minDigits = Math.min(leftDigits, rightDigits);
  const maxDigits = Math.max(leftDigits, rightDigits);

  let score = splitScore(tokens, splitIndex);

  if (maxDigits > 7) {
    score += (maxDigits - 7) * 3;
  }

  if (minDigits < 4) {
    score += (4 - minDigits) * 2;
  }

  return score;
}

function stripLikelyNoteTokens(tokens: string[], noteTokenLikely?: boolean) {
  if (noteTokenLikely) {
    if (
      tokens.length >= 3 &&
      tokens[0].replace("-", "").length === 1 &&
      !tokens[0].startsWith("-")
    ) {
      const withoutNote = tokens.slice(1);

      if (
        withoutNote.length >= 4 &&
        withoutNote[0].replace("-", "").length === 1 &&
        !withoutNote[0].startsWith("-")
      ) {
        const withoutExtraShortToken = withoutNote.slice(1);
        return candidateScore(withoutExtraShortToken) < candidateScore(withoutNote)
          ? withoutExtraShortToken
          : withoutNote;
      }

      return withoutNote;
    }

    return tokens;
  }

  const candidates: string[][] = [tokens];

  if (tokens.length >= 2 && tokens[0].replace("-", "").length <= 2) {
    candidates.push(tokens.slice(1));
  }

  if (
    noteTokenLikely &&
    tokens.length >= 3 &&
    tokens[0].replace("-", "").length <= 2 &&
    tokens[1].replace("-", "").length <= 2
  ) {
    candidates.push(tokens.slice(2));
  }

  return candidates.reduce((best, candidate) =>
    candidateScore(candidate) < candidateScore(best) ? candidate : best,
  );
}

function extractTwoValues(rest: string, noteTokenLikely?: boolean) {
  const originalTokens = rest.replace(/[|]/g, " ").match(/-?\d+/g) ?? [];

  if (originalTokens.length === 0) {
    return [null, null] as const;
  }

  if (originalTokens.length === 1) {
    return [Number(originalTokens[0]), null] as const;
  }

  if (originalTokens.length === 2) {
    const [first, second] = originalTokens;
    if (first.replace("-", "").length >= 3 && second.replace("-", "").length === 3) {
      return [Number(originalTokens.join("")), null] as const;
    }

    return [Number(first), Number(second)] as const;
  }

  const candidateTokens = stripLikelyNoteTokens(originalTokens, noteTokenLikely);

  if (candidateTokens.length === 1) {
    return [Number(candidateTokens[0]), null] as const;
  }

  if (
    candidateTokens.length === 2 &&
    candidateTokens[0].replace("-", "").length <= 2 &&
    candidateTokens[1].replace("-", "").length === 3 &&
    !candidateTokens[0].startsWith("-") &&
    !candidateTokens[1].startsWith("-")
  ) {
    return [Number(candidateTokens.join("")), null] as const;
  }

  const splitIndex = chooseSplit(candidateTokens);
  return [
    Number(candidateTokens.slice(0, splitIndex).join("")),
    Number(candidateTokens.slice(splitIndex).join("")),
  ] as const;
}

function applyParsedLine(
  line: string,
  years: readonly [number, number],
  registry: Map<number, ParsedPayload>,
  rowDefinitions: RowDefinition[],
) {
  const normalized = normalizeText(line);
  let bestMatch: { row: RowDefinition; alias: string } | null = null;

  for (const row of rowDefinitions) {
    for (const alias of row.aliases) {
      if (normalized !== alias && !normalized.startsWith(`${alias} `)) {
        continue;
      }

      if (!bestMatch || alias.length > bestMatch.alias.length) {
        bestMatch = { row, alias };
      }
    }
  }

  if (!bestMatch) {
    return;
  }

  const rest = normalized.slice(bestMatch.alias.length).trim();
  const [first, second] = extractTwoValues(rest, bestMatch.row.noteTokenLikely);

  if (first !== null && Number.isFinite(first)) {
    bestMatch.row.apply(registry.get(years[0])!, first);
  }

  if (second !== null && Number.isFinite(second)) {
    bestMatch.row.apply(registry.get(years[1])!, second);
  }
}

function reconcileOperatingCostBreakdown(payload: ParsedPayload) {
  const resultat = payload.resultatregnskapResultat;
  const driftsresultat = resultat?.driftsresultat;
  const driftsinntekter = driftsresultat?.driftsinntekter;
  const driftskostnad = driftsresultat?.driftskostnad;
  const finansresultat = resultat?.finansresultat;
  if (!driftskostnad) {
    return;
  }

  const salgsinntekter = Number(driftsinntekter?.salgsinntekter);
  const sumDriftsinntekter = Number(driftsinntekter?.sumDriftsinntekter);
  const sumDriftskostnad = Number(driftskostnad.sumDriftskostnad);
  const varekostnad = Number(driftskostnad.varekostnad);
  const annenDriftskostnad = Number(driftskostnad.annenDriftskostnad);
  const loennskostnad = Number(driftskostnad.loennskostnad);

  if (
    Number.isFinite(salgsinntekter) &&
    (!Number.isFinite(sumDriftsinntekter) || sumDriftsinntekter < salgsinntekter)
  ) {
    driftsinntekter.sumDriftsinntekter = salgsinntekter;
  }

  if (
    Number.isFinite(sumDriftskostnad) &&
    Number.isFinite(varekostnad) &&
    Number.isFinite(annenDriftskostnad)
  ) {
    const derivedLoennskostnad = sumDriftskostnad - varekostnad - annenDriftskostnad;

    if (derivedLoennskostnad >= 0) {
      if (!Number.isFinite(loennskostnad)) {
        driftskostnad.loennskostnad = derivedLoennskostnad;
        return;
      }

      const difference = Math.abs(loennskostnad - derivedLoennskostnad);
      const relativeDifference =
        derivedLoennskostnad > 0 ? difference / derivedLoennskostnad : 0;

      if (difference >= 1000 && relativeDifference >= 0.1) {
        driftskostnad.loennskostnad = derivedLoennskostnad;
      }
    }
  }

  const parsedProfitBeforeTax = Number(resultat?.ordinaertResultatFoerSkattekostnad);
  const parsedTaxExpense = Number(resultat?.skattekostnadResultat);
  const parsedNetIncome = Number(resultat?.aarsresultat);
  const parsedTotalResult = Number(resultat?.totalresultat);
  const normalizedNetFinance = Number(finansresultat?.nettoFinans);
  const normalizedOperatingProfit = Number(driftsresultat?.driftsresultat);

  if (
    Number.isFinite(normalizedOperatingProfit) &&
    Number.isFinite(normalizedNetFinance) &&
    (!Number.isFinite(parsedProfitBeforeTax) ||
      Math.abs(parsedProfitBeforeTax - (normalizedOperatingProfit + normalizedNetFinance)) >= 1000)
  ) {
    resultat.ordinaertResultatFoerSkattekostnad = normalizedOperatingProfit + normalizedNetFinance;
  }

  const profitBeforeTax = Number(resultat?.ordinaertResultatFoerSkattekostnad);

  if (
    Number.isFinite(profitBeforeTax) &&
    Number.isFinite(parsedTotalResult) &&
    (!Number.isFinite(parsedTaxExpense) ||
      Math.abs(parsedTaxExpense - (profitBeforeTax - parsedTotalResult)) >= 1000)
  ) {
    resultat.skattekostnadResultat = profitBeforeTax - parsedTotalResult;
  }

  const taxExpense = Number(resultat?.skattekostnadResultat);

  if (
    Number.isFinite(profitBeforeTax) &&
    Number.isFinite(taxExpense) &&
    (!Number.isFinite(parsedNetIncome) ||
      Math.abs(parsedNetIncome - (profitBeforeTax - taxExpense)) >= 1000)
  ) {
    resultat.aarsresultat = profitBeforeTax - taxExpense;
  }

  if (
    Number.isFinite(Number(resultat?.aarsresultat)) &&
    (!Number.isFinite(parsedTotalResult) ||
      Math.abs(parsedTotalResult - Number(resultat.aarsresultat)) >= 1000)
  ) {
    resultat.totalresultat = Number(resultat.aarsresultat);
  }
}

function reconcileBalanceSheet(payload: ParsedPayload) {
  const eiendeler = payload.eiendeler;
  const egenkapitalGjeld = payload.egenkapitalGjeld;
  const egenkapital = egenkapitalGjeld?.egenkapital;
  const gjeldOversikt = egenkapitalGjeld?.gjeldOversikt;
  const kortsiktigGjeld = gjeldOversikt?.kortsiktigGjeld;
  const langsiktigGjeld = gjeldOversikt?.langsiktigGjeld;
  const innskuttEgenkapital = egenkapital?.innskuttEgenkapital;
  const opptjentEgenkapital = egenkapital?.opptjentEgenkapital;

  if (!eiendeler || !egenkapitalGjeld || !egenkapital || !gjeldOversikt) {
    return;
  }

  const totalAssets = Number(eiendeler.sumEiendeler);
  const totalCurrentAssets = Number(eiendeler.omloepsmidler?.sumOmloepsmidler);
  const inventory = Number(eiendeler.sumVarer);
  const accountsReceivable = Number(eiendeler.kundefordringer);
  const otherShortTermReceivables = Number(eiendeler.andreKortsiktigeFordringer);
  const intercompanyReceivables = Number(eiendeler.konsernfordringer);
  const totalReceivables = Number(eiendeler.sumFordringer);
  const cashAndEquivalents = Number(eiendeler.sumBankinnskuddOgKontanter);
  const totalFixedAssets = Number(eiendeler.anleggsmidler?.sumAnleggsmidler);
  const totalDebt = Number(gjeldOversikt.sumGjeld);
  const totalEquity = Number(egenkapital.sumEgenkapital);
  const totalLongTermDebt = Number(langsiktigGjeld?.sumLangsiktigGjeld);
  const totalShortTermDebt = Number(kortsiktigGjeld?.sumKortsiktigGjeld);

  if (
    Number.isFinite(totalAssets) &&
    Number.isFinite(totalDebt) &&
    (!Number.isFinite(totalEquity) || Math.abs(totalEquity - (totalAssets - totalDebt)) >= 1000)
  ) {
    egenkapital.sumEgenkapital = totalAssets - totalDebt;
  }

  if (
    Number.isFinite(totalAssets) &&
    Number.isFinite(totalCurrentAssets) &&
    (!Number.isFinite(totalFixedAssets) || Math.abs(totalFixedAssets - (totalAssets - totalCurrentAssets)) >= 1000)
  ) {
    eiendeler.anleggsmidler.sumAnleggsmidler = totalAssets - totalCurrentAssets;
  }

  if (
    Number.isFinite(totalCurrentAssets) &&
    Number.isFinite(inventory) &&
    Number.isFinite(totalReceivables) &&
    (!Number.isFinite(cashAndEquivalents) ||
      Math.abs(cashAndEquivalents - (totalCurrentAssets - inventory - totalReceivables)) >= 1000)
  ) {
    const derivedCash = totalCurrentAssets - inventory - totalReceivables;
    if (derivedCash >= 0) {
      eiendeler.sumBankinnskuddOgKontanter = derivedCash;
    }
  }

  if (
    Number.isFinite(totalReceivables) &&
    Number.isFinite(intercompanyReceivables) &&
    Number.isFinite(otherShortTermReceivables) &&
    (!Number.isFinite(accountsReceivable) ||
      Math.abs(accountsReceivable - (totalReceivables - intercompanyReceivables - otherShortTermReceivables)) >= 1000)
  ) {
    const derivedAccountsReceivable =
      totalReceivables - intercompanyReceivables - otherShortTermReceivables;
    if (derivedAccountsReceivable >= 0) {
      eiendeler.kundefordringer = derivedAccountsReceivable;
    }
  }

  if (
    Number.isFinite(totalReceivables) &&
    Number.isFinite(intercompanyReceivables) &&
    Number.isFinite(accountsReceivable) &&
    (!Number.isFinite(otherShortTermReceivables) ||
      Math.abs(otherShortTermReceivables - (totalReceivables - intercompanyReceivables - accountsReceivable)) >= 1000)
  ) {
    const derivedOtherShortTermReceivables =
      totalReceivables - intercompanyReceivables - accountsReceivable;
    if (derivedOtherShortTermReceivables >= 0) {
      eiendeler.andreKortsiktigeFordringer = derivedOtherShortTermReceivables;
    }
  }

  if (
    Number.isFinite(totalDebt) &&
    Number.isFinite(totalLongTermDebt) &&
    (!Number.isFinite(totalShortTermDebt) ||
      Math.abs(totalShortTermDebt - (totalDebt - totalLongTermDebt)) >= 1000)
  ) {
    kortsiktigGjeld.sumKortsiktigGjeld = totalDebt - totalLongTermDebt;
  }

  const currentShortTermDebt = Number(kortsiktigGjeld?.sumKortsiktigGjeld);
  const supplierDebt = Number(kortsiktigGjeld?.leverandorgjeld);
  const publicCharges = Number(kortsiktigGjeld?.skyldigOffentligeAvgifter);
  const dividendDebt = Number(kortsiktigGjeld?.utbytte);
  const otherShortTermDebt = Number(kortsiktigGjeld?.annenKortsiktigGjeld);
  const taxPayable = Number(kortsiktigGjeld?.betalbarSkatt);
  const longTermCreditInstitutionDebt = Number(langsiktigGjeld?.gjeldTilKredittinstitusjoner);
  const longTermProvisions = Number(langsiktigGjeld?.avsetningerForForpliktelser);

  if (
    Number.isFinite(currentShortTermDebt) &&
    Number.isFinite(supplierDebt) &&
    Number.isFinite(publicCharges) &&
    Number.isFinite(dividendDebt) &&
    Number.isFinite(otherShortTermDebt)
  ) {
    const derivedTaxPayable =
      currentShortTermDebt - supplierDebt - publicCharges - dividendDebt - otherShortTermDebt;

    if (derivedTaxPayable >= 0) {
      kortsiktigGjeld.betalbarSkatt = derivedTaxPayable;
    }
  }

  const normalizedTaxPayable = Number(kortsiktigGjeld?.betalbarSkatt);
  if (
    Number.isFinite(currentShortTermDebt) &&
    Number.isFinite(supplierDebt) &&
    Number.isFinite(publicCharges) &&
    Number.isFinite(dividendDebt) &&
    Number.isFinite(normalizedTaxPayable) &&
    (!Number.isFinite(otherShortTermDebt) ||
      Math.abs(
        otherShortTermDebt -
          (currentShortTermDebt -
            supplierDebt -
            publicCharges -
            dividendDebt -
            normalizedTaxPayable),
      ) >= 1000)
  ) {
    const derivedOtherShortTermDebt =
      currentShortTermDebt -
      supplierDebt -
      publicCharges -
      dividendDebt -
      normalizedTaxPayable;

    if (derivedOtherShortTermDebt >= 0) {
      kortsiktigGjeld.annenKortsiktigGjeld = derivedOtherShortTermDebt;
    }
  }

  if (
    Number.isFinite(totalLongTermDebt) &&
    Number.isFinite(longTermCreditInstitutionDebt) &&
    (!Number.isFinite(longTermProvisions) ||
      Math.abs(longTermProvisions - (totalLongTermDebt - longTermCreditInstitutionDebt)) >= 1000)
  ) {
    const derivedLongTermProvisions = totalLongTermDebt - longTermCreditInstitutionDebt;
    if (derivedLongTermProvisions >= 0) {
      langsiktigGjeld.avsetningerForForpliktelser = derivedLongTermProvisions;
    }
  }

  const paidInEquity = Number(innskuttEgenkapital?.sumInnskuttEgenkaptial);
  const retainedEarnings = Number(opptjentEgenkapital?.sumOpptjentEgenkapital);
  const currentTotalEquity = Number(egenkapital.sumEgenkapital);

  if (
    Number.isFinite(currentTotalEquity) &&
    Number.isFinite(retainedEarnings) &&
    (!Number.isFinite(paidInEquity) ||
      Math.abs(paidInEquity - (currentTotalEquity - retainedEarnings)) >= 1000)
  ) {
    innskuttEgenkapital.sumInnskuttEgenkaptial = currentTotalEquity - retainedEarnings;
  }

  if (Number.isFinite(totalAssets)) {
    egenkapitalGjeld.sumEgenkapitalGjeld = totalAssets;
  }
}

async function downloadAnnualReportPdf(orgNumber: string, year: number) {
  const url = `${env.brregFinancialsBaseUrl}/aarsregnskap/kopi/${orgNumber}/${year}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Failed to download annual report PDF ${year}: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function ocrRelevantPages(pdfBuffer: Buffer, year: number) {
  const [{ PDFParse }, tesseractModule] = await Promise.all([
    import("pdf-parse"),
    import("tesseract.js"),
  ]);
  const { createWorker } = tesseractModule;
  const parser = new PDFParse({ data: pdfBuffer });
  const screenshots = await parser.getScreenshot({ partial: [2, 3, 4, 5], scale: 2 });
  await parser.destroy();

  const worker = await createWorker("eng", 1, {
    cachePath: path.join(os.tmpdir(), "projectx-tesseract-cache"),
  });
  const pages: OcrPage[] = [];

  try {
    for (let index = 0; index < screenshots.pages.length; index += 1) {
      const screenshotPath = path.join(os.tmpdir(), `projectx-brreg-${year}-${index + 2}.png`);
      await fs.writeFile(screenshotPath, Buffer.from(screenshots.pages[index].data));
      const result = await worker.recognize(screenshotPath);
      const data = result.data as any;
      pages.push({
        text: data.text,
      });
    }
  } finally {
    await worker.terminate();
  }

  return pages;
}

function inferPageYears(
  pageText: string,
  reportYear: number,
  lastSeenYears: readonly [number, number] | null,
) {
  const explicitYears = extractYearPair(pageText);
  if (explicitYears) {
    return explicitYears;
  }

  const normalized = normalizeText(pageText);
  const isBalanceContinuation =
    normalized.includes("sum egenkapital og gjeld") ||
    normalized.includes("sum langsiktig gjeld") ||
    normalized.includes("sum kortsiktig gjeld") ||
    normalized.includes("sum gjeld");

  if (isBalanceContinuation) {
    return lastSeenYears ?? ([reportYear, reportYear - 1] as const);
  }

  return lastSeenYears;
}

function buildStatementsFromRegistry(orgNumber: string, registry: Map<number, ParsedPayload>) {
  return Array.from(registry.entries())
    .map(([year, payload]) => {
      payload.virksomhet = {
        organisasjonsnummer: orgNumber,
      };

      reconcileOperatingCostBreakdown(payload);
      reconcileBalanceSheet(payload);

      if (!payload.resultatregnskapResultat?.aarsresultat) {
        return null;
      }

      return mapBrregFinancialStatement(payload, orgNumber);
    })
    .filter(Boolean)
    .sort((left, right) => right!.fiscalYear - left!.fiscalYear) as NormalizedFinancialStatement[];
}

export async function extractHistoricalStatementsFromAnnualReports(
  orgNumber: string,
  availableYears: number[],
) {
  const yearsToParse = availableYears.slice(0, 3);

  if (yearsToParse.length === 0) {
    return [];
  }

  const registry = new Map<number, ParsedPayload>();

  for (const reportYear of yearsToParse) {
    const pdfBuffer = await downloadAnnualReportPdf(orgNumber, reportYear);
    const ocrPages = await ocrRelevantPages(pdfBuffer, reportYear);
    let currentYears: readonly [number, number] | null = null;

    for (const page of ocrPages) {
      const years = inferPageYears(page.text, reportYear, currentYears);
      if (!years) {
        continue;
      }
      currentYears = years;

      if (!registry.has(years[0])) {
        registry.set(years[0], createEmptyPayload(years[0]));
      }

      if (!registry.has(years[1])) {
        registry.set(years[1], createEmptyPayload(years[1]));
      }

      const lines = page.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        applyParsedLine(line, years, registry, resultRows);
        applyParsedLine(line, years, registry, assetRows);
        applyParsedLine(line, years, registry, equityRows);
      }
    }
  }

  return buildStatementsFromRegistry(orgNumber, registry);
}
