import { toAnnualReportParsedPages } from "@/integrations/brreg/annual-report-financials/page-model";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import { detectUnitScale } from "@/integrations/brreg/annual-report-financials/unit-scale";
import {
  AnnualReportParsedInputPage,
  AnnualReportParsedPage,
  PageClassification,
} from "@/integrations/brreg/annual-report-financials/types";
import { StatementSectionType } from "@/integrations/brreg/annual-report-financials/taxonomy";

type PageFeatures = {
  page: AnnualReportParsedPage;
  heading: string | null;
  headingText: string;
  topText: string;
  declaredYears: number[];
  yearHeaderYears: number[];
  numericRowCount: number;
  tableLike: boolean;
  unitScale: ReturnType<typeof detectUnitScale>;
  cues: {
    income: number;
    balance: number;
    assets: number;
    equityLiabilities: number;
    supplementary: number;
    notes: number;
    auditor: number;
    board: number;
    cover: number;
  };
  cueMatches: string[];
};

type ScoredType = {
  type: StatementSectionType;
  score: number;
  reasons: string[];
};

const INCOME_KEYWORDS = [
  "resultatregnskap",
  "income statement",
  "driftsinntekter",
  "driftsresultat",
  "arsresultat",
  "resultat for",
];
const BALANCE_KEYWORDS = [
  "balanse",
  "balance sheet",
  "eiendeler",
  "egenkapital og gjeld",
  "sum eiendeler",
  "sum egenkapital og gjeld",
];
const ASSET_KEYWORDS = [
  "eiendeler",
  "anleggsmidler",
  "omlopsmidler",
  "sum eiendeler",
];
const EQUITY_LIABILITY_KEYWORDS = [
  "egenkapital og gjeld",
  "gjeldsoversikt",
  "sum kortsiktig gjeld",
  "sum egenkapital og gjeld",
  "sum gjeld",
];
const SUPPLEMENTARY_KEYWORDS = [
  "i sammendrag",
  "artsinndelt",
  "summary",
  "forkortet",
];
const NOTE_KEYWORDS = [
  "noter til arsregnskapet",
  "noter til regnskapet",
  "regnskapsprinsipper",
  "note ",
  "accounting principles",
];
const AUDITOR_KEYWORDS = [
  "uavhengig revisors beretning",
  "revisjonsberetning",
  "grunnlag for konklusjon",
  "uttalelse om ovrige lovmessige krav",
  "opinion",
];
const BOARD_KEYWORDS = [
  "styrets arsberetning",
  "arsberetning",
  "fortsatt drift",
  "virksomhetens art",
  "future developments",
];
const COVER_KEYWORDS = [
  "arsregnskap",
  "arsrapport",
  "organisasjonsnummer",
  "resultatregnskap og balanse",
];

function countKeywordMatches(text: string, keywords: string[]) {
  const matches = keywords.filter((keyword) => text.includes(normalizeNorwegianText(keyword)));
  return {
    count: matches.length,
    matches,
  };
}

function extractDeclaredYears(page: AnnualReportParsedPage) {
  return Array.from(
    new Set((page.text.match(/\b20\d{2}\b/g) ?? []).map((year) => Number(year))),
  ).slice(0, 6);
}

function extractYearHeaderYears(page: AnnualReportParsedPage) {
  for (const table of page.tables) {
    const headerRow = table.rows.find((row) => {
      const years = row.cells
        .map((cell) => cell.text.match(/\b20\d{2}\b/g) ?? [])
        .flat()
        .map((year) => Number(year));
      return years.length >= 2;
    });

    if (headerRow) {
      return Array.from(
        new Set(
          headerRow.cells
            .map((cell) => cell.text.match(/\b20\d{2}\b/g) ?? [])
            .flat()
            .map((year) => Number(year)),
        ),
      ).slice(0, 3);
    }
  }

  for (const line of page.lines.slice(0, 12)) {
    const years = Array.from(
      new Set((line.text.match(/\b20\d{2}\b/g) ?? []).map((year) => Number(year))),
    );

    if (years.length >= 2) {
      return years.slice(0, 3);
    }
  }

  return [] as number[];
}

function countNumericRows(page: AnnualReportParsedPage) {
  if (page.tables.length > 0) {
    return page.tables.reduce((sum, table) => {
      return (
        sum +
        table.rows.filter((row) => {
          const labelCells = row.cells.filter((cell) =>
            ["label", "text"].includes(cell.role),
          );
          const numericCells = row.cells.filter((cell) => cell.numericValue !== null);
          return labelCells.length > 0 && numericCells.length > 0;
        }).length
      );
    }, 0);
  }

  return page.lines.filter((line) => {
    const text = normalizeNorwegianText(line.text);
    const hasLabel = /[a-z]{4,}/.test(text);
    const numericCount = (line.text.match(/-?\d[\d\s.]*/g) ?? []).length;
    return hasLabel && numericCount >= 1;
  }).length;
}

function buildPageFeatures(page: AnnualReportParsedPage): PageFeatures {
  const orderedBlocks = [...page.blocks].sort((left, right) => {
    const leftTop = left.bbox?.top ?? 0;
    const rightTop = right.bbox?.top ?? 0;
    if (rightTop !== leftTop) {
      return rightTop - leftTop;
    }
    return (left.source.order ?? 0) - (right.source.order ?? 0);
  });

  const heading =
    orderedBlocks.find((block) => block.kind === "heading" && block.text.trim().length > 4)?.text ??
    page.lines
      .slice(0, 6)
      .map((line) => line.text.trim())
      .find((line) => line.length > 4 && !/^\d+$/.test(line)) ??
    null;
  const topText = normalizeNorwegianText(
    (orderedBlocks.slice(0, 10).map((block) => block.text).join(" ") ||
      page.lines.slice(0, 10).map((line) => line.text).join(" ")),
  );
  const fullText = page.normalizedText;

  const income = countKeywordMatches(fullText, INCOME_KEYWORDS);
  const balance = countKeywordMatches(fullText, BALANCE_KEYWORDS);
  const assets = countKeywordMatches(fullText, ASSET_KEYWORDS);
  const equityLiabilities = countKeywordMatches(fullText, EQUITY_LIABILITY_KEYWORDS);
  const supplementary = countKeywordMatches(fullText, SUPPLEMENTARY_KEYWORDS);
  const notes = countKeywordMatches(fullText, NOTE_KEYWORDS);
  const auditor = countKeywordMatches(fullText, AUDITOR_KEYWORDS);
  const board = countKeywordMatches(fullText, BOARD_KEYWORDS);
  const cover = countKeywordMatches(fullText, COVER_KEYWORDS);
  const numericRowCount = countNumericRows(page);
  const yearHeaderYears = extractYearHeaderYears(page);
  const unitScale = detectUnitScale(page);
  const tableLike =
    page.tables.length > 0 ||
    (numericRowCount >= 3 &&
      (yearHeaderYears.length >= 2 || balance.count > 0 || income.count > 0));

  return {
    page,
    heading,
    headingText: heading ? normalizeNorwegianText(heading) : "",
    topText,
    declaredYears: extractDeclaredYears(page),
    yearHeaderYears,
    numericRowCount,
    tableLike,
    unitScale,
    cues: {
      income: income.count,
      balance: balance.count,
      assets: assets.count,
      equityLiabilities: equityLiabilities.count,
      supplementary: supplementary.count,
      notes: notes.count,
      auditor: auditor.count,
      board: board.count,
      cover: cover.count,
    },
    cueMatches: [
      ...income.matches,
      ...balance.matches,
      ...assets.matches,
      ...equityLiabilities.matches,
      ...supplementary.matches,
      ...notes.matches,
      ...auditor.matches,
      ...board.matches,
      ...cover.matches,
    ],
  };
}

function scoreFeatures(features: PageFeatures) {
  const reasons: string[] = [];
  const scores = new Map<StatementSectionType, number>([
    ["STATUTORY_INCOME", 0],
    ["STATUTORY_BALANCE", 0],
    ["STATUTORY_BALANCE_CONTINUATION", 0],
    ["SUPPLEMENTARY_INCOME", 0],
    ["SUPPLEMENTARY_BALANCE", 0],
    ["NOTE", 0],
    ["AUDITOR_REPORT", 0],
    ["BOARD_REPORT", 0],
    ["COVER", 0],
  ]);

  const add = (type: StatementSectionType, amount: number, reason: string) => {
    scores.set(type, (scores.get(type) ?? 0) + amount);
    reasons.push(reason);
  };

  if (features.tableLike) {
    add("STATUTORY_INCOME", 0.6, "Table-like financial layout");
    add("STATUTORY_BALANCE", 0.6, "Table-like financial layout");
    add("SUPPLEMENTARY_INCOME", 0.5, "Table-like financial layout");
    add("SUPPLEMENTARY_BALANCE", 0.5, "Table-like financial layout");
  }

  if (features.yearHeaderYears.length >= 2) {
    add("STATUTORY_INCOME", 0.4, "Detected year header");
    add("STATUTORY_BALANCE", 0.4, "Detected year header");
    add("SUPPLEMENTARY_INCOME", 0.3, "Detected year header");
    add("SUPPLEMENTARY_BALANCE", 0.3, "Detected year header");
  }

  if (features.cues.income > 0) {
    add("STATUTORY_INCOME", 0.8 + features.cues.income * 0.3, "Income statement keywords");
  }
  if (features.cues.balance > 0) {
    add("STATUTORY_BALANCE", 0.8 + features.cues.balance * 0.3, "Balance sheet keywords");
  }
  if (features.cues.assets > 0) {
    add("STATUTORY_BALANCE", 0.4 + features.cues.assets * 0.2, "Asset-side balance keywords");
  }
  if (features.cues.equityLiabilities > 0) {
    add(
      "STATUTORY_BALANCE_CONTINUATION",
      0.7 + features.cues.equityLiabilities * 0.3,
      "Equity/liability continuation keywords",
    );
    add("STATUTORY_BALANCE", 0.3, "Equity/liability balance keywords");
  }

  if (features.cues.supplementary > 0 || features.unitScale.unitScale === 1000) {
    add("SUPPLEMENTARY_INCOME", 0.7 + features.cues.supplementary * 0.2, "Supplementary statement cues");
    add("SUPPLEMENTARY_BALANCE", 0.7 + features.cues.supplementary * 0.2, "Supplementary statement cues");
  }

  if (features.cues.notes > 0) {
    add("NOTE", 1 + features.cues.notes * 0.35, "Notes keywords");
  }
  if (features.cues.auditor > 0) {
    add("AUDITOR_REPORT", 1.4 + features.cues.auditor * 0.45, "Auditor report keywords");
  }
  if (features.cues.board > 0) {
    add("BOARD_REPORT", 1.2 + features.cues.board * 0.4, "Board report keywords");
  }
  if (features.cues.cover > 0) {
    add("COVER", 0.8 + features.cues.cover * 0.2, "Cover-page cues");
  }

  if (features.cues.auditor > 0 || features.cues.board > 0) {
    add("STATUTORY_INCOME", -1.2, "Negative statement cue from narrative page");
    add("STATUTORY_BALANCE", -1.2, "Negative statement cue from narrative page");
    add("STATUTORY_BALANCE_CONTINUATION", -1.2, "Negative statement cue from narrative page");
    add("SUPPLEMENTARY_INCOME", -1.1, "Negative statement cue from narrative page");
    add("SUPPLEMENTARY_BALANCE", -1.1, "Negative statement cue from narrative page");
  }

  if (features.cues.notes > 0) {
    add("STATUTORY_INCOME", -0.6, "Page is likely notes rather than face statement");
    add("STATUTORY_BALANCE", -0.6, "Page is likely notes rather than face statement");
    add("SUPPLEMENTARY_INCOME", -0.6, "Page is likely notes rather than face statement");
    add("SUPPLEMENTARY_BALANCE", -0.6, "Page is likely notes rather than face statement");
  }

  if (features.unitScale.conflictingSignals) {
    add("STATUTORY_INCOME", -0.4, "Conflicting unit declarations");
    add("STATUTORY_BALANCE", -0.4, "Conflicting unit declarations");
    add("SUPPLEMENTARY_INCOME", -0.4, "Conflicting unit declarations");
    add("SUPPLEMENTARY_BALANCE", -0.4, "Conflicting unit declarations");
  }

  return Array.from(scores.entries())
    .map(([type, score]) => ({
      type,
      score,
      reasons,
    }))
    .sort((left, right) => right.score - left.score);
}

function selectType(
  features: PageFeatures,
  scored: ScoredType[],
  previous: PageClassification | null,
) {
  let top = scored[0];
  if (!top || top.score <= 0) {
    return {
      type: "OTHER" as never,
      top: null,
    };
  }

  if (
    top.type === "STATUTORY_BALANCE" &&
    features.cues.assets === 0 &&
    features.cues.equityLiabilities > 0
  ) {
    top = {
      ...top,
      type: "STATUTORY_BALANCE_CONTINUATION",
    };
  }

  if (
    previous &&
    ["STATUTORY_BALANCE", "STATUTORY_BALANCE_CONTINUATION", "SUPPLEMENTARY_BALANCE"].includes(previous.type) &&
    features.tableLike &&
    features.cues.equityLiabilities > 0 &&
    !features.headingText.includes("note")
  ) {
    top = {
      ...top,
      type:
        features.unitScale.unitScale === 1000
          ? "SUPPLEMENTARY_BALANCE"
          : "STATUTORY_BALANCE_CONTINUATION",
    };
  }

  if (
    top.type === "STATUTORY_INCOME" &&
    (features.cues.supplementary > 0 || features.unitScale.unitScale === 1000)
  ) {
    top = {
      ...top,
      type: "SUPPLEMENTARY_INCOME",
    };
  }

  if (
    (top.type === "STATUTORY_BALANCE" || top.type === "STATUTORY_BALANCE_CONTINUATION") &&
    (features.cues.supplementary > 0 || features.unitScale.unitScale === 1000)
  ) {
    top = {
      ...top,
      type: "SUPPLEMENTARY_BALANCE",
    };
  }

  return {
    type: top.type,
    top,
  };
}

function inheritedUnitScaleConfidence(input: {
  pageNumber: number;
  yearHeaderYears: number[];
  inheritedFrom: PageClassification;
}) {
  const adjacentPage = input.inheritedFrom.pageNumber === input.pageNumber - 1;
  const sameYearHeader =
    input.yearHeaderYears.length >= 2 &&
    input.inheritedFrom.yearHeaderYears.length >= 2 &&
    input.yearHeaderYears.join(",") === input.inheritedFrom.yearHeaderYears.join(",");

  if (adjacentPage && sameYearHeader) {
    return 0.86;
  }

  if (adjacentPage) {
    return 0.82;
  }

  return 0.72;
}

export function classifyPages(pages: AnnualReportParsedInputPage[]) {
  const featuresByPage = toAnnualReportParsedPages(pages).map(buildPageFeatures);
  const classifications: PageClassification[] = [];

  for (const features of featuresByPage) {
    const previous = classifications[classifications.length - 1] ?? null;
    const scored = scoreFeatures(features);
    const { type, top } = selectType(features, scored, previous);
    const inheritedUnitScale =
      type !== "NOTE" &&
      features.unitScale.unitScale === null &&
      !features.unitScale.conflictingSignals
        ? [...classifications]
            .reverse()
            .find((classification) =>
              [
                "STATUTORY_INCOME",
                "STATUTORY_BALANCE",
                "STATUTORY_BALANCE_CONTINUATION",
                "SUPPLEMENTARY_INCOME",
                "SUPPLEMENTARY_BALANCE",
              ].includes(classification.type) &&
              classification.unitScale !== null &&
              !classification.hasConflictingUnitSignals,
            ) ?? null
        : null;
    const inheritedYearHeader =
      features.yearHeaderYears.length === 0 &&
      features.tableLike &&
      ["STATUTORY_BALANCE_CONTINUATION", "SUPPLEMENTARY_BALANCE"].includes(type)
        ? [...classifications]
            .reverse()
            .find((classification) =>
              [
                "STATUTORY_INCOME",
                "STATUTORY_BALANCE",
                "STATUTORY_BALANCE_CONTINUATION",
                "SUPPLEMENTARY_INCOME",
                "SUPPLEMENTARY_BALANCE",
              ].includes(classification.type) &&
              classification.yearHeaderYears.length >= 2,
            ) ?? null
        : null;
    const effectiveYearHeaderYears =
      features.yearHeaderYears.length >= 2
        ? features.yearHeaderYears
        : inheritedYearHeader?.yearHeaderYears ?? features.yearHeaderYears;
    const effectiveDeclaredYears =
      features.declaredYears.length > 0
        ? features.declaredYears
        : inheritedYearHeader?.declaredYears ?? features.declaredYears;

    if (!top) {
      classifications.push({
        pageNumber: features.page.pageNumber,
        type: "COVER",
        confidence: 0.15,
        unitScale: features.unitScale.unitScale ?? inheritedUnitScale?.unitScale ?? null,
        unitScaleConfidence:
          features.unitScale.unitScale !== null
            ? features.unitScale.confidence
            : inheritedUnitScale
              ? inheritedUnitScaleConfidence({
                  pageNumber: features.page.pageNumber,
                  yearHeaderYears: effectiveYearHeaderYears,
                  inheritedFrom: inheritedUnitScale,
                })
              : 0,
        hasConflictingUnitSignals: features.unitScale.conflictingSignals,
        declaredYears: effectiveDeclaredYears,
        yearHeaderYears: effectiveYearHeaderYears,
        heading: features.heading,
        numericRowCount: features.numericRowCount,
        tableLike: features.tableLike,
        reasons: ["No strong page classification signals"],
      });
      continue;
    }

    const topScore = Math.max(0, top.score);
    const confidence = Number(Math.max(0.18, Math.min(0.995, topScore / 3.4)).toFixed(3));

    classifications.push({
      pageNumber: features.page.pageNumber,
      type,
      confidence,
      unitScale: features.unitScale.unitScale ?? inheritedUnitScale?.unitScale ?? null,
      unitScaleConfidence:
        features.unitScale.unitScale !== null
          ? features.unitScale.confidence
          : inheritedUnitScale
            ? inheritedUnitScaleConfidence({
                pageNumber: features.page.pageNumber,
                yearHeaderYears: effectiveYearHeaderYears,
                inheritedFrom: inheritedUnitScale,
              })
            : 0,
      hasConflictingUnitSignals: features.unitScale.conflictingSignals,
      declaredYears: effectiveDeclaredYears,
      yearHeaderYears: effectiveYearHeaderYears,
      heading: features.heading,
      numericRowCount: features.numericRowCount,
      tableLike: features.tableLike,
      reasons: [
        ...new Set([
          ...features.cueMatches,
          ...(features.unitScale.reason ? [features.unitScale.reason] : []),
          ...(features.yearHeaderYears.length >= 2 ? ["Detected year header"] : []),
          ...(features.tableLike ? ["Detected statement-like table layout"] : []),
          ...(top.type !== type ? [`Post-processed as ${type}`] : []),
          ...(inheritedUnitScale
            ? [`Inherited unit scale ${inheritedUnitScale.unitScale} from previous statement page`]
            : []),
          ...(inheritedYearHeader && features.yearHeaderYears.length === 0
            ? [
                `Inherited year header ${inheritedYearHeader.yearHeaderYears.join(", ")} from previous statement page`,
              ]
            : []),
        ]),
      ],
    });
  }

  for (let index = 1; index < classifications.length; index += 1) {
    const current = classifications[index];
    const previous = classifications[index - 1];
    if (
      !current ||
      !previous ||
      current.yearHeaderYears.length >= 2 ||
      !["STATUTORY_BALANCE_CONTINUATION", "SUPPLEMENTARY_BALANCE"].includes(current.type) ||
      previous.yearHeaderYears.length < 2
    ) {
      continue;
    }

    current.yearHeaderYears = [...previous.yearHeaderYears];
    if (current.declaredYears.length === 0 && previous.declaredYears.length > 0) {
      current.declaredYears = [...previous.declaredYears];
    }
    current.reasons = [
      ...new Set([
        ...current.reasons,
        `Inherited year header ${previous.yearHeaderYears.join(", ")} from previous statement page`,
      ]),
    ];
  }

  return classifications.sort((left, right) => left.pageNumber - right.pageNumber);
}
