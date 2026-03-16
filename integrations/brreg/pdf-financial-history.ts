import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import "server-only";

import env from "@/lib/env";
import { mapBrregFinancialStatement } from "@/integrations/brreg/mappers";
import { NormalizedFinancialStatement } from "@/lib/types";

type ParsedPayload = Record<string, any>;
type OcrWord = {
  text: string;
  bbox: {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  };
};

type OcrLine = {
  words: OcrWord[];
  y0: number;
  y1: number;
};

type OcrPage = {
  text: string;
  words: OcrWord[];
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

function toNumericToken(value: string) {
  return value.replace(/[^\d-]/g, "");
}

function parseNumberFromTokens(tokens: string[]) {
  const cleaned = tokens
    .map((token) => toNumericToken(token))
    .filter(Boolean);

  if (cleaned.length === 0) {
    return null;
  }

  const normalized = cleaned.join("");
  if (!normalized || normalized === "-") {
    return null;
  }

  return Number(normalized);
}

function groupWordsIntoLines(words: OcrWord[]) {
  const sorted = [...words].sort((left, right) =>
    left.bbox.y0 === right.bbox.y0 ? left.bbox.x0 - right.bbox.x0 : left.bbox.y0 - right.bbox.y0,
  );
  const lines: OcrLine[] = [];

  for (const word of sorted) {
    const text = normalizeText(word.text);
    if (!text) {
      continue;
    }

    const existingLine = lines.find(
      (line) =>
        Math.abs(line.y0 - word.bbox.y0) <= 12 ||
        Math.abs(line.y1 - word.bbox.y1) <= 12,
    );

    if (existingLine) {
      existingLine.words.push(word);
      existingLine.y0 = Math.min(existingLine.y0, word.bbox.y0);
      existingLine.y1 = Math.max(existingLine.y1, word.bbox.y1);
    } else {
      lines.push({
        words: [word],
        y0: word.bbox.y0,
        y1: word.bbox.y1,
      });
    }
  }

  for (const line of lines) {
    line.words.sort((left, right) => left.bbox.x0 - right.bbox.x0);
  }

  return lines.sort((left, right) => left.y0 - right.y0);
}

function extractYearPairFromWords(words: OcrWord[]) {
  const topWords = words
    .filter((word) => word.bbox.y0 < 200)
    .filter((word) => /^20\d{2}$/.test(toNumericToken(word.text)))
    .sort((left, right) => left.bbox.x0 - right.bbox.x0);

  if (topWords.length < 2) {
    return null;
  }

  return [Number(toNumericToken(topWords[0].text)), Number(toNumericToken(topWords[1].text))] as const;
}

function getColumnAnchors(words: OcrWord[]) {
  const topWords = words.filter((word) => word.bbox.y0 < 220);
  const yearWords = topWords
    .filter((word) => /^20\d{2}$/.test(toNumericToken(word.text)))
    .sort((left, right) => left.bbox.x0 - right.bbox.x0);

  if (yearWords.length < 2) {
    return null;
  }

  const noteWord = topWords.find((word) => normalizeText(word.text) === "note");
  const yearOneCenter = (yearWords[0].bbox.x0 + yearWords[0].bbox.x1) / 2;
  const yearTwoCenter = (yearWords[1].bbox.x0 + yearWords[1].bbox.x1) / 2;
  const noteRight = noteWord ? noteWord.bbox.x1 + 30 : yearOneCenter - 220;

  return {
    noteRight,
    yearOneLeft: yearOneCenter - 90,
    yearOneRight: yearOneCenter + 110,
    yearTwoLeft: yearTwoCenter - 90,
    yearTwoRight: yearTwoCenter + 110,
  };
}

function parseLineValues(
  line: OcrLine,
  anchors: NonNullable<ReturnType<typeof getColumnAnchors>>,
  noteTokenLikely?: boolean,
) {
  const labelWords = line.words.filter((word) => word.bbox.x0 < anchors.noteRight);
  const noteWords = line.words.filter(
    (word) => word.bbox.x0 >= anchors.noteRight && word.bbox.x1 < anchors.yearOneLeft,
  );
  const yearOneWords = line.words.filter(
    (word) => word.bbox.x0 >= anchors.yearOneLeft && word.bbox.x1 <= anchors.yearOneRight,
  );
  const yearTwoWords = line.words.filter(
    (word) => word.bbox.x0 >= anchors.yearTwoLeft && word.bbox.x1 <= anchors.yearTwoRight,
  );

  const label = normalizeText(labelWords.map((word) => word.text).join(" "));
  const yearOneTokens = yearOneWords.map((word) => word.text);
  const yearTwoTokens = yearTwoWords.map((word) => word.text);

  // Explicitly ignore note column tokens so they can never leak into values.
  if (noteTokenLikely && noteWords.length > 0) {
    void noteWords;
  }

  return {
    label,
    first: parseNumberFromTokens(yearOneTokens),
    second: parseNumberFromTokens(yearTwoTokens),
  };
}

function applyParsedLine(
  line: OcrLine,
  years: readonly [number, number],
  registry: Map<number, ParsedPayload>,
  rowDefinitions: RowDefinition[],
  anchors: NonNullable<ReturnType<typeof getColumnAnchors>>,
) {
  for (const row of rowDefinitions) {
    const parsed = parseLineValues(line, anchors, row.noteTokenLikely);
    for (const alias of row.aliases) {
      if (!parsed.label.startsWith(alias)) {
        continue;
      }

      if (parsed.first !== null && Number.isFinite(parsed.first)) {
        row.apply(registry.get(years[0])!, parsed.first);
      }

      if (parsed.second !== null && Number.isFinite(parsed.second)) {
        row.apply(registry.get(years[1])!, parsed.second);
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
  const pages: OcrPage[] = [];

  try {
    for (let index = 0; index < screenshots.pages.length; index += 1) {
      const screenshotPath = path.join(os.tmpdir(), `projectx-brreg-${year}-${index + 2}.png`);
      await fs.writeFile(screenshotPath, Buffer.from(screenshots.pages[index].data));
      const result = await worker.recognize(screenshotPath);
      const data = result.data as any;
      pages.push({
        text: data.text,
        words: (data.words ?? []).map((word: any) => ({
          text: word.text,
          bbox: {
            x0: word.bbox.x0,
            x1: word.bbox.x1,
            y0: word.bbox.y0,
            y1: word.bbox.y1,
          },
        })),
      });
    }
  } finally {
    await worker.terminate();
  }

  return pages;
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
    const ocrPages = await ocrRelevantPages(pdfBuffer, reportYear);

    for (const page of ocrPages) {
      const years = extractYearPairFromWords(page.words);
      if (!years) {
        continue;
      }
      const anchors = getColumnAnchors(page.words);
      if (!anchors) {
        continue;
      }

      if (!registry.has(years[0])) {
        registry.set(years[0], createEmptyPayload(years[0]));
      }

      if (!registry.has(years[1])) {
        registry.set(years[1], createEmptyPayload(years[1]));
      }

      const lines = groupWordsIntoLines(page.words);
      for (const line of lines) {
        applyParsedLine(line, years, registry, resultRows, anchors);
        applyParsedLine(line, years, registry, assetRows, anchors);
        applyParsedLine(line, years, registry, equityRows, anchors);
      }
    }
  }

  return buildStatementsFromRegistry(orgNumber, registry);
}
