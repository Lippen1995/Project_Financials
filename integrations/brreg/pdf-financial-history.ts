import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import "server-only";

import env from "@/lib/env";
import { mapBrregFinancialStatement } from "@/integrations/brreg/mappers";
import { NormalizedFinancialStatement } from "@/lib/types";

type ParsedPayload = Record<string, any>;

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
    aliases: ["resultat fgr skattekostnad", "ordinzrt resultat for gkattekoztnad", "ordinært resultat for skattekostnad"],
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
    aliases: ["ordinzrt resultat etter gkattekoztnad", "ordinært resultat etter skattekostnad"],
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
    aliases: ["bankinnskudd, kontanter o.l.", "sum bankinnskudd, kontanter og lignende", "bankinnskudd, kontanter og lignende"],
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
    aliases: ["sum eiendeler", "sum eiendeler "],
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

  // Most regnskapstall in this table should be 4-7 digits. Penalize suspiciously long numbers.
  if (maxDigits > 7) {
    score += (maxDigits - 7) * 3;
  }

  if (minDigits < 4) {
    score += (4 - minDigits) * 2;
  }

  return score;
}

function stripLikelyNoteTokens(tokens: string[], noteTokenLikely?: boolean) {
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
  let tokens = [...originalTokens];

  if (tokens.length === 0) {
    return [null, null] as const;
  }

  if (tokens.length === 1) {
    return [Number(tokens[0]), null] as const;
  }

  if (tokens.length === 2) {
    const [first, second] = tokens;
    if (first.replace("-", "").length >= 3 && second.replace("-", "").length === 3) {
      return [Number(tokens.join("")), null] as const;
    }

    return [Number(first), Number(second)] as const;
  }

  const candidateTokens = stripLikelyNoteTokens(tokens, noteTokenLikely);

  if (candidateTokens.length === 1) {
    return [Number(candidateTokens[0]), null] as const;
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

  for (const row of rowDefinitions) {
    for (const alias of row.aliases) {
      if (!normalized.startsWith(alias)) {
        continue;
      }

      const rest = normalized.slice(alias.length).trim();
      const [first, second] = extractTwoValues(rest, row.noteTokenLikely);

      if (first !== null && Number.isFinite(first)) {
        row.apply(registry.get(years[0])!, first);
      }

      if (second !== null && Number.isFinite(second)) {
        row.apply(registry.get(years[1])!, second);
      }

      return;
    }
  }
}

function reconcileOperatingCostBreakdown(payload: ParsedPayload) {
  const driftskostnad = payload.resultatregnskapResultat?.driftsresultat?.driftskostnad;
  if (!driftskostnad) {
    return;
  }

  const sumDriftskostnad = Number(driftskostnad.sumDriftskostnad);
  const varekostnad = Number(driftskostnad.varekostnad);
  const annenDriftskostnad = Number(driftskostnad.annenDriftskostnad);
  const loennskostnad = Number(driftskostnad.loennskostnad);

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

      // OCR tends to insert stray digits around note-marked rows. If the parsed value
      // materially disagrees with the verified total line, trust the reconciled amount.
      if (difference >= 1000 && relativeDifference >= 0.1) {
        driftskostnad.loennskostnad = derivedLoennskostnad;
      }
    }
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
  const texts: string[] = [];

  try {
    for (let index = 0; index < screenshots.pages.length; index += 1) {
      const screenshotPath = path.join(os.tmpdir(), `projectx-brreg-${year}-${index + 2}.png`);
      await fs.writeFile(screenshotPath, Buffer.from(screenshots.pages[index].data));
      const result = await worker.recognize(screenshotPath);
      texts.push(result.data.text);
    }
  } finally {
    await worker.terminate();
  }

  return texts;
}

function buildStatementsFromRegistry(orgNumber: string, registry: Map<number, ParsedPayload>) {
  return Array.from(registry.entries())
    .map(([year, payload]) => {
      payload.virksomhet = {
        organisasjonsnummer: orgNumber,
      };

      reconcileOperatingCostBreakdown(payload);

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
    const pageTexts = await ocrRelevantPages(pdfBuffer, reportYear);

    for (const text of pageTexts) {
      const years = extractYearPair(text);
      if (!years) {
        continue;
      }

      if (!registry.has(years[0])) {
        registry.set(years[0], createEmptyPayload(years[0]));
      }

      if (!registry.has(years[1])) {
        registry.set(years[1], createEmptyPayload(years[1]));
      }

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const normalizedText = normalizeText(text);
      for (const line of lines) {
        applyParsedLine(line, years, registry, resultRows);
        applyParsedLine(line, years, registry, assetRows);
        applyParsedLine(line, years, registry, equityRows);
      }
    }
  }

  return buildStatementsFromRegistry(orgNumber, registry);
}
