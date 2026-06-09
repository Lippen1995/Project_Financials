import { toAnnualReportParsedPages } from "@/integrations/brreg/annual-report-financials/page-model";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import { detectUnitScale } from "@/integrations/brreg/annual-report-financials/unit-scale";
import { detectCurrency } from "@/integrations/brreg/annual-report-financials/currency";
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
  scopeHeadText: string;
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
  // Tax-/specification-note cues. These reconciliation terms appear ONLY in
  // notes (the tax note, the equity specification), never on a face income
  // statement or balance sheet — so they reliably keep a note from being typed
  // as a statutory statement (the CLAIRE KIDS tax note that became a "konsern
  // resultatregnskap").
  "skattepliktig inntekt",
  "permanente forskjeller",
  "midlertidige forskjeller",
  "betalbar skatt i balansen",
  "grunnlag for utsatt skatt",
  "spesifikasjon av",
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

// ── Statement-scope detection (konsern vs selskap) ────────────────────────────
// A Norwegian group annual report contains two sets of accounts, separated by
// section headings. This detector recognises those headings.
//
// Matching strategy — three tiers, ordered from most to least conservative:
//
//  1. Bare indefinite compound words ("konsernregnskap", "selskapsregnskap").
//     Checked anywhere in heading or top-of-page text. These never appear in
//     ordinary prose, so they are safe to match broadly.
//
//  2. Inflected/definite forms ("konsernregnskapet", "morselskapsregnskap").
//     Checked ONLY in the page heading text. These DO appear in prose sentences
//     ("Konsernregnskapet viser vekst") but are safe when they ARE the heading.
//
//  3. Genitive forms + statement noun ("Konsernets resultatregnskap",
//     "Morselskapets resultatregnskap"). Checked ONLY in the page heading.
//     The presence of a recognised statement noun makes these unambiguous.

// Tier 1 — bare indefinite forms, safe to check in heading + body text.
const CONSOLIDATED_SECTION_KEYWORDS = [
  "konsernregnskap",
  "konsernresultat",
  "konsernbalanse",
  "konsernoppstilling",
];

const COMPANY_SCOPE_SECTION_KEYWORDS = [
  "selskapsregnskap",
  "morregnskap",
  "morselskapsregnskap", // common compound: "morselskapets regnskap" abbreviated
];

// Tier 2 — definite/inflected forms, only safe when they ARE the page heading.
const CONSOLIDATED_SECTION_KEYWORDS_HEADING = [
  "konsernregnskapet",
  "konsernresultatet",
  "konsernbalansen",
  "konsernoppstillingen",
];

const COMPANY_SCOPE_SECTION_KEYWORDS_HEADING = [
  "selskapsregnskapet",
  "morregnskapet",
  "morselskapsregnskapet",
];

// Concatenated compound forms of the scope marker. Many report templates — and
// the OCR of them — render the marker as a SINGLE token:
// "Konsernresultatregnskap", "Konsernbalanse", "Konsernkontantstrøm". A
// whole-word match misses these: "konsernregnskap" is not a substring of
// "konsernresultatregnskap" (it is konsern·resultat·regnskap), and
// \bkonsernresultat\b fails because "regnskap" follows with no word boundary.
// Even SCOPE_STATEMENT_NOUN (\bresultatregnskap\b) fails on such a token because
// "konsern" precedes it with no boundary. So a page whose only scope marker is a
// concatenated compound (STATKRAFT's "KONSERNRESULTATREGNSKAP") gets no signal
// at all and defaults to COMPANY. Match the "konsern"/"selskaps"/"mor" prefix
// immediately followed by a statement-noun stem, with NO trailing boundary.
const CONSOLIDATED_COMPOUND_RE =
  /\bkonsern(regnskap|resultat|balanse|oppstilling|kontantstr)/;
const COMPANY_COMPOUND_RE =
  /\b(selskaps|morselskaps)(regnskap|resultat|balanse|oppstilling|kontantstr)/;

// Statement nouns used to qualify the bare "konsern" / "morselskap" tokens
// (tier 1) and the genitive forms "konsernets" / "morselskapets" (tier 3).
const SCOPE_STATEMENT_NOUN =
  /\b(resultatregnskap|resultatoppstilling|balanse|balanseoversikt|kontantstrom|kontantstrommer|noter)\b/;

function containsWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(text);
}

function isStatutoryStatementType(type: string): boolean {
  return (
    type === "STATUTORY_INCOME" ||
    type === "STATUTORY_BALANCE" ||
    type === "STATUTORY_BALANCE_CONTINUATION"
  );
}

/**
 * Detects whether a page carries an explicit statement-scope heading.
 * Returns "CONSOLIDATED" or "COMPANY" when a marker is found, or null when
 * the page has no scope signal (the caller then inherits the running scope).
 *
 * @param headingText  Normalised text of the page heading block.
 * @param topText      Normalised text of the top ~10 blocks on the page.
 */
function detectScopeSignal(
  headingText: string,
  topText: string,
  scopeHeadText = "",
  isStatementPage = false,
): "CONSOLIDATED" | "COMPANY" | null {
  const text = `${headingText} ${topText}`;

  // The concatenated statement-title compounds ("konsernresultatregnskap",
  // "konsernbalanse", "selskapsresultatregnskap") are page TITLES, so they are
  // only trusted on an actual statement page and only in the title region
  // (the page heading + the reading-order head band — never the prose body).
  // This catches the title when unreliable block ordering keeps it out of
  // headingText/topText (the STATKRAFT case) without letting an inflected
  // konsern mention in a board report or note ("Konsernregnskapet viser…")
  // flip the scope. The prefix match (no trailing boundary) is what makes it
  // see the compound; restricting it to statement pages is what makes it safe.
  const titleRegion = `${headingText} ${scopeHeadText}`;
  const hasConsolidatedTitle = isStatementPage && CONSOLIDATED_COMPOUND_RE.test(titleRegion);
  const hasCompanyTitle = isStatementPage && COMPANY_COMPOUND_RE.test(titleRegion);

  // ── Tier 1: bare indefinite forms ─────────────────────────────────────────
  const hasConsolidatedKeyword =
    hasConsolidatedTitle ||
    CONSOLIDATED_SECTION_KEYWORDS.some((k) => containsWord(text, k));
  const hasCompanyKeyword =
    hasCompanyTitle ||
    COMPANY_SCOPE_SECTION_KEYWORDS.some((k) => containsWord(text, k));

  const hasStatementNoun = SCOPE_STATEMENT_NOUN.test(text);

  // A bare "konsern" word next to a statement noun is a consolidated marker
  // (e.g. heading "Resultatregnskap konsern" or "Konsern - Resultatregnskap").
  // The document-level group gate at the end of classifyPages overrides any
  // CONSOLIDATED this infers when the filing declares it is NOT a group.
  const konsernNextToStatement = containsWord(text, "konsern") && hasStatementNoun;
  // "morselskap" only counts next to a statement noun — on its own it appears
  // in note prose ("transaksjoner med morselskap").
  const morselskapNextToStatement = containsWord(text, "morselskap") && hasStatementNoun;

  // ── Tier 2: inflected forms — heading only ─────────────────────────────────
  // "Konsernregnskapet" / "Morselskapsregnskapet" can appear in prose sentences,
  // so we only trust them when they ARE the page heading, not buried in body text.
  const hasConsolidatedHeadingInflected = CONSOLIDATED_SECTION_KEYWORDS_HEADING.some((k) =>
    containsWord(headingText, k),
  );
  const hasCompanyHeadingInflected = COMPANY_SCOPE_SECTION_KEYWORDS_HEADING.some((k) =>
    containsWord(headingText, k),
  );

  // ── Tier 3: genitive forms + statement noun — heading only ────────────────
  // "Konsernets resultatregnskap" / "Morselskapets resultatregnskap".
  // These genitive forms can appear in prose ("Konsernets resultatregnskap viser…"),
  // so restrict the check to the page heading where they are unambiguous markers.
  const headingStatementNoun = SCOPE_STATEMENT_NOUN.test(headingText);
  const konsernEtsNextToStatement =
    containsWord(headingText, "konsernets") && headingStatementNoun;
  const morselskapetsNextToStatement =
    containsWord(headingText, "morselskapets") && headingStatementNoun;

  const consolidated =
    hasConsolidatedKeyword ||
    konsernNextToStatement ||
    hasConsolidatedHeadingInflected ||
    konsernEtsNextToStatement;
  const company =
    hasCompanyKeyword ||
    morselskapNextToStatement ||
    hasCompanyHeadingInflected ||
    morselskapetsNextToStatement;

  // Conflicting markers on one page — refuse to switch, let scope inherit.
  if (consolidated && company) {
    return null;
  }
  if (consolidated) {
    return "CONSOLIDATED";
  }
  if (company) {
    return "COMPANY";
  }
  return null;
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

  // Reading-order head band. The block-sorted topText above is unreliable on
  // some OCR sources — block bbox.top ordering can surface footer text first,
  // so the page TITLE ("Konsernresultatregnskap") never reaches topText and the
  // heading block resolves to a section label ("Resultatregnskap"). The page's
  // normalizedText is in reading order (top→bottom), so its leading slice is the
  // most reliable view of the page's title region for scope detection.
  const scopeHeadText = normalizeNorwegianText(fullText.slice(0, 400));

  return {
    page,
    heading,
    headingText: heading ? normalizeNorwegianText(heading) : "",
    topText,
    scopeHeadText,
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

  // Statement scope inherits down the document: once a "Konsernregnskap"
  // heading is seen, following pages are CONSOLIDATED until a "Selskaps-
  // regnskap" heading flips it back. Reports with no group default to
  // COMPANY throughout — which is correct for the vast majority of filings.
  let currentScope: "COMPANY" | "CONSOLIDATED" = "COMPANY";

  // Reporting currency also inherits: once a page declares a non-NOK
  // currency it applies to the following pages. NOK is the default.
  let currentCurrency: ReturnType<typeof detectCurrency>["currency"] = "NOK";

  for (const features of featuresByPage) {
    const previous = classifications[classifications.length - 1] ?? null;
    const scored = scoreFeatures(features);
    const { type, top } = selectType(features, scored, previous);

    // A scope heading takes effect from this page onward. Board/auditor
    // pages are excluded — their prose mentions "konsernet" freely and must
    // never be allowed to flip the scope.
    const scopeSignal = detectScopeSignal(
      features.headingText,
      features.topText,
      features.scopeHeadText,
      isStatutoryStatementType(type),
    );
    const hasExplicitScopeSignal =
      scopeSignal !== null && type !== "BOARD_REPORT" && type !== "AUDITOR_REPORT";
    if (hasExplicitScopeSignal) {
      currentScope = scopeSignal;
    }

    // A page that explicitly declares a non-NOK currency sets it for itself
    // and every following page until another declaration appears.
    const currencyResult = detectCurrency(features.page);
    if (currencyResult.currency !== "NOK") {
      currentCurrency = currencyResult.currency;
    }
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
        statementScope: currentScope,
        hasExplicitScopeSignal,
        reportingCurrency: currentCurrency,
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
      statementScope: currentScope,
      hasExplicitScopeSignal,
      reportingCurrency: currentCurrency,
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

  // Third pass: retroactive COMPANY scope for selskapsregnskap pages.
  //
  // Norwegian group-company PDFs from Brønnøysund contain two sets of
  // statutory statements back-to-back in "Del 1" (the standard form section):
  //   1) Selskapsregnskap  — COMPANY scope  (income + balance for morselskapet)
  //   2) Konsernregnskap   — CONSOLIDATED   (income + balance for konsernet)
  //
  // When the PDF uses a running page header such as "Canica AS | Konsernregnskap"
  // on ALL financial pages, the Legacy engine's OCR picks it up as body text and
  // the Tier-1 keyword "konsernregnskap" is found in topText for every page —
  // including the selskapsregnskap ones. All statutory pages then receive
  // CONSOLIDATED scope in the forward pass.
  //
  // The structured-document engine (Docling) correctly separates running page
  // headers from section headings, so its page 2 heading reads "RESULTATREGNSKAP"
  // (no konsern contamination) while page 6 reads "KONSERNRESULTATREGNSKAP".
  // The scope forward-pass assigns COMPANY to page 2 and CONSOLIDATED to page 6
  // naturally — but only when the heading itself tells us the truth.
  //
  // Detection strategy — scope transition within the initial statutory block:
  //
  //  1. Collect the "first statutory block": the opening run of STATUTORY pages
  //     from the beginning of the document, allowing internal gaps of at most
  //     MAX_GAP_WITHIN_BLOCK non-statutory pages (cover pages between the
  //     income statement and balance sheet halves of each section).
  //     Stop as soon as a larger gap is encountered (Del 1 is compact; Del 2
  //     begins only after the board report, auditor report, etc.).
  //
  //  2. Within that block, search for the FIRST page whose heading explicitly
  //     contains "konsern" — this is the selskaps→konsern scope boundary.
  //
  //  3. If such a boundary is found at a non-zero position, all statutory pages
  //     before it lacked an explicit "konsern" heading and are the selskaps-
  //     regnskap → retroactively assign COMPANY scope.
  //
  // Why this is safe across engine types:
  //  • Docling: page headings reflect the real printed section headings, so
  //    "KONSERNRESULTATREGNSKAP" is on page 6 and pages 2-5 have no "konsern"
  //    heading → the retroactive fix fires correctly.
  //  • Legacy: all pages have the same plain headings ("RESULTATREGNSKAP",
  //    "BALANSE") regardless of section; no "konsern" heading exists in the
  //    first block → firstKonsernInBlock = -1 → fix does NOT fire, all pages
  //    remain CONSOLIDATED (the conservative pre-existing behaviour).
  const sortedClassifications = classifications.sort((left, right) => left.pageNumber - right.pageNumber);


  // Step 1 — build the first statutory block.
  // A gap of 1-2 non-statutory pages within the block is normal (a cover page
  // between the income statement and balance sheet halves). A gap larger than
  // MAX_GAP_WITHIN_BLOCK means we have left Del 1 (e.g. board report follows).
  const MAX_GAP_WITHIN_BLOCK = 3;

  const firstStatutoryBlock: PageClassification[] = [];
  let gapCounter = 0;

  for (const c of sortedClassifications) {
    if (isStatutoryStatementType(c.type)) {
      if (firstStatutoryBlock.length > 0 && gapCounter > MAX_GAP_WITHIN_BLOCK) {
        break; // Del 1 has ended; don't include Del 2 STATUTORY pages.
      }
      firstStatutoryBlock.push(c);
      gapCounter = 0;
    } else if (firstStatutoryBlock.length > 0) {
      gapCounter += 1;
    }
  }

  // Step 2 — find the scope-transition page: first page in the block whose
  // heading text contains "konsern" (case-insensitive).
  const firstKonsernInBlock = firstStatutoryBlock.findIndex(
    (c) => c.heading !== null && c.heading.toLowerCase().includes("konsern"),
  );

  // Step 3 — retroactively assign COMPANY to all statutory pages before the
  // transition. Nothing happens when firstKonsernInBlock ≤ 0 (transition is
  // absent or at the very first page, meaning the whole block is konsern).
  if (firstKonsernInBlock > 0) {
    for (let i = 0; i < firstKonsernInBlock; i++) {
      const c = firstStatutoryBlock[i];
      if (!c) continue;
      if (c.statementScope === "CONSOLIDATED") {
        c.statementScope = "COMPANY";
        c.hasExplicitScopeSignal = false;
        c.reasons = [
          ...new Set([
            ...c.reasons,
            "Retroactively assigned COMPANY scope: plain heading precedes explicit konsern section",
          ]),
        ];
      }
    }
  }

  // Step 4 — structural fallback for engines that strip "konsern" from headings.
  //
  // The Legacy OCR engine collapses page headings to a plain form: the second
  // resultatregnskap page in Del 1 reads "RESULTATREGNSKAP" (no konsern prefix),
  // identical to the first. As a result Step 2 never finds a konsern transition
  // and Step 3 leaves all statutory pages as CONSOLIDATED (forward-pass result
  // driven by the running page header "Canica AS | Konsernregnskap" appearing
  // on every page).
  //
  // Brønnøysund Del 1 for group companies is always structured as two
  // back-to-back statement rounds:
  //   Round 1 — Resultatregnskap → Balanse (eiendeler) → Balanse (EK+gjeld)
  //   Round 2 — Konsernresultat   → Konsernbalanse                  (same shape)
  //
  // Detect a round start as either a STATUTORY_INCOME page OR any page whose
  // heading contains "resultatregnskap" (covers the common case where the
  // second income page is mistyped as STATUTORY_BALANCE when layout is dense).
  // Consecutive starts are suppressed because an income statement can span
  // multiple pages (e.g. a "Minoritetsinteresser" continuation page).
  //
  // When at least two distinct round starts are found, the second one marks
  // the selskap → konsern boundary: pages before it are flipped to COMPANY.
  // This only fires when Step 3 did not already fire, so Docling's
  // heading-based detection always takes precedence when available.
  if (firstKonsernInBlock < 0 && firstStatutoryBlock.length >= 4) {
    const isIncomeRoundStart = (c: PageClassification): boolean =>
      c.type === "STATUTORY_INCOME" ||
      (c.heading !== null && /resultatregnskap/i.test(c.heading));

    const roundStartIndexes: number[] = [];
    for (let i = 0; i < firstStatutoryBlock.length; i++) {
      const page = firstStatutoryBlock[i];
      if (!page) continue;
      if (!isIncomeRoundStart(page)) continue;
      const previousRoundStart = roundStartIndexes[roundStartIndexes.length - 1];
      if (previousRoundStart === undefined || i - previousRoundStart > 1) {
        roundStartIndexes.push(i);
      }
    }

    if (roundStartIndexes.length >= 2) {
      // Correct round-start page types: dense layouts can cause the Legacy
      // forward pass to score a page with heading "RESULTATREGNSKAP" as
      // STATUTORY_BALANCE (because balance keywords from a neighbouring or
      // overlapping region outweigh income keywords). When the heading is
      // unambiguously an income heading, the type must be STATUTORY_INCOME so
      // that income metric extractors (revenue, operating_profit, net_income)
      // look at the page. Without this correction, the scope flip below would
      // strand the konsern income figures behind a BALANCE-typed page that the
      // income extractor skips, producing REVENUE_MISSING / NET_INCOME_MISSING
      // for the CONSOLIDATED scope.
      for (const idx of roundStartIndexes) {
        const page = firstStatutoryBlock[idx];
        if (!page) continue;
        if (
          page.heading !== null &&
          /resultatregnskap/i.test(page.heading) &&
          (page.type === "STATUTORY_BALANCE" || page.type === "STATUTORY_BALANCE_CONTINUATION")
        ) {
          page.type = "STATUTORY_INCOME";
          page.reasons = [
            ...new Set([
              ...page.reasons,
              "Reclassified STATUTORY_INCOME: heading explicitly states 'Resultatregnskap' (round-start type correction)",
            ]),
          ];
        }
      }

      const consolidatedBoundary = roundStartIndexes[1]!;
      for (let i = 0; i < consolidatedBoundary; i++) {
        const c = firstStatutoryBlock[i];
        if (!c) continue;
        if (c.statementScope === "CONSOLIDATED") {
          c.statementScope = "COMPANY";
          c.hasExplicitScopeSignal = false;
          c.reasons = [
            ...new Set([
              ...c.reasons,
              "Retroactively assigned COMPANY scope: first of two statement rounds in Del 1 (structural)",
            ]),
          ];
        }
      }
    }
  }

  // Fifth pass: enforce the Del 1 / Del 2 boundary.
  //
  // All Norwegian Brønnøysund annual report PDFs contain two parts:
  //   Del 1 — the standard Brønnøysund statutory forms (compact, ~4–12 pages).
  //            Contains income statement and balance sheet for BOTH the parent
  //            company (morselskapet) and the group (konsernet). No notes.
  //   Del 2 — the company's own published annual report, appended after the
  //            board report, auditor report, etc. (free-form, variable length).
  //
  // Structured-document engines (Docling) parse Del 2 income/balance pages as
  // STATUTORY because the headings look identical to Del 1 ("Resultatregnskap",
  // "Balanse"). But Del 2 figures are typically in thousands, whereas Del 1 is
  // in whole NOK — a mismatch that causes validation failures and a 1000× unit-
  // scale disagreement between the engines.
  //
  // Solution: any STATUTORY page that falls outside the first statutory block
  // (Del 1) is reclassified as SUPPLEMENTARY. This makes Del 1 the sole source
  // of primary facts and demotes Del 2 data to supplementary / note support.
  //
  // For the Legacy engine, Del 2 pages are already correctly classified as
  // SUPPLEMENTARY by keyword signals ("artsinndelt", running-header heuristics,
  // etc.), so this pass is effectively a no-op for Legacy.
  const firstBlockPageNumbers = new Set(firstStatutoryBlock.map((c) => c.pageNumber));

  for (const c of sortedClassifications) {
    if (firstBlockPageNumbers.has(c.pageNumber)) continue; // Del 1 — leave as-is
    if (c.type === "STATUTORY_INCOME") {
      c.type = "SUPPLEMENTARY_INCOME";
      c.reasons = [
        ...new Set([
          ...c.reasons,
          "Reclassified SUPPLEMENTARY: beyond Del 1 (Brønnøysund statutory forms)",
        ]),
      ];
    } else if (c.type === "STATUTORY_BALANCE" || c.type === "STATUTORY_BALANCE_CONTINUATION") {
      c.type = "SUPPLEMENTARY_BALANCE";
      c.reasons = [
        ...new Set([
          ...c.reasons,
          "Reclassified SUPPLEMENTARY: beyond Del 1 (Brønnøysund statutory forms)",
        ]),
      ];
    }
  }

  // ── Document-level group gate ─────────────────────────────────────────────
  // When the Brønnøysund cover declares the entity is NOT part of a group
  // ("Morselskap i konsern: Nei" → normalised "... konsern nei"), no page can be
  // a konsern statement. Small single-entity reports were getting a spurious
  // CONSOLIDATED scope (from the structural two-round fallback or a stray note
  // heading) that pulled their notes in as a "konsernregnskap". A legal non-group
  // is unambiguous, so force COMPANY scope across the whole document, overriding
  // any CONSOLIDATED the per-page heuristics inferred.
  // Read the Brønnøysund cover field "Morselskap i konsern: <Ja/Nei>". OCR
  // mangles the short value (Nei → "nel", "ne|"), so we match the field label
  // and treat a value beginning with "ne" as the negative. Matching the leading
  // "ne" (not "!= ja") keeps a real group safe even if its "Ja" is misread.
  const documentText = featuresByPage.map((features) => features.page.normalizedText).join(" ");
  const groupFieldMatch = documentText.match(/morselskap i konsern\s+([a-zæøå]+)/);
  const documentExplicitlyNotGroup = /^ne/.test(groupFieldMatch?.[1] ?? "");
  if (documentExplicitlyNotGroup) {
    for (const classification of sortedClassifications) {
      if (classification.statementScope === "CONSOLIDATED") {
        classification.statementScope = "COMPANY";
        classification.hasExplicitScopeSignal = false;
        classification.reasons = [
          ...new Set([
            ...classification.reasons,
            "Forced COMPANY scope: filing declares 'Morselskap i konsern: Nei' (not a group)",
          ]),
        ];
      }
    }
  }

  return sortedClassifications;
}
