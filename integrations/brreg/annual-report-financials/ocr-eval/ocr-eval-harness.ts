/**
 * Engine-agnostic OCR evaluation harness.
 *
 * Measures how well an OCR engine reads the NUMBERS on a scanned financial
 * statement, against a known ground truth (the published, human-reviewed
 * line-item values). The ground truth trumps any validation equation — the
 * reviewed figure is the source of truth even if it does not "balance".
 *
 * The engine is injected as a function returning per-page text, so Tesseract
 * today and RapidOCR/PaddleOCR later all plug into the same metric.
 */

export type OcrEnginePage = {
  pageNumber: number;
  /** Full recognised text for the page (lines joined by newline). */
  text: string;
};

/** A single ground-truth fact we expect to find on a given source page. */
export type GroundTruthFact = {
  metricKey: string;
  /** Canonical integer value as published (whole NOK), e.g. "3398713005". */
  value: string;
  /** Page the value was reported on (1-based), or null if unknown. */
  sourcePage: number | null;
  rawLabel: string | null;
};

export type MatchKind =
  /** Exact standalone numeric token. */
  | "exact"
  /** Digit string appears inside a longer token (year columns fused by OCR). */
  | "substring"
  /** Not found at all. */
  | "none";

export type FactMatch = {
  metricKey: string;
  value: string;
  sourcePage: number | null;
  /** Did the digit string appear on its source page (exact OR fused)? */
  foundOnSourcePage: boolean;
  /** How it matched on the source page. */
  sourceMatchKind: MatchKind;
  /** Did it appear on ANY page (exact OR fused)? */
  foundOnAnyPage: boolean;
  /** The closest near-miss token actually seen on the source page, if any. */
  nearMiss: string | null;
};

export type OcrEvalResult = {
  engineName: string;
  totalFacts: number;
  factsWithSourcePage: number;
  matchedOnSourcePage: number;
  /** Of matchedOnSourcePage, how many were exact standalone tokens. */
  exactOnSourcePage: number;
  /** Of matchedOnSourcePage, how many were only found fused inside a token. */
  substringOnSourcePage: number;
  matchedOnAnyPage: number;
  /** matchedOnSourcePage / factsWithSourcePage */
  sourcePageRecall: number;
  /** matchedOnAnyPage / totalFacts */
  anyPageRecall: number;
  matches: FactMatch[];
};

/**
 * Extract every integer-looking token from OCR text, normalising the digit
 * grouping that Norwegian statements use. "3 398 713 005" and "3398713005"
 * and "3.398.713.005" all collapse to "3398713005". A leading minus or
 * parenthesised negative is preserved as a sign.
 */
export function extractNumericTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  // Match runs of digits possibly separated by spaces / dots / NBSP, with an
  // optional surrounding sign or parentheses.
  const re = /\(?-?\d[\d  . ]*\d?\)?/g;
  const matches = text.match(re) ?? [];
  for (const raw of matches) {
    const negative = /^\(.*\)$/.test(raw) || raw.trim().startsWith("-");
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 0) continue;
    const stripped = digits.replace(/^0+(?=\d)/, ""); // drop leading zeros
    tokens.add(negative ? `-${stripped}` : stripped);
    // Also add the unsigned form so a sign-only OCR error still counts as a
    // near match when we look for the magnitude.
    tokens.add(stripped);
  }
  return tokens;
}

function digitsOnly(v: string): string {
  return v.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

/**
 * Per-page numeric index: the exact standalone tokens, plus one long string of
 * all digits on the page concatenated. The concatenated string lets us detect
 * values that OCR fused with the adjacent year column (e.g. current year and
 * prior year printed side by side and read as one token).
 */
type PageNumericIndex = {
  tokens: Set<string>;
  concatenated: string;
};

function buildPageIndex(text: string): PageNumericIndex {
  const tokens = extractNumericTokens(text);
  // Concatenate every digit run on the page, in reading order, so a value that
  // got fused with its neighbour is still findable as a substring.
  const concatenated = (text.match(/\d[\d  . ]*/g) ?? [])
    .map((s) => s.replace(/[^\d]/g, ""))
    .join("|");
  return { tokens, concatenated };
}

/** Find the value as an exact token, else as a fused substring, else none. */
function classifyMatch(index: PageNumericIndex, target: string): MatchKind {
  if (index.tokens.has(target) || index.tokens.has(`-${target}`)) return "exact";
  // Substring, but require it to be a "clean" boundary: the fused token must be
  // longer than the target (a real column fusion), not a coincidental hit on a
  // value that merely starts the same. We accept any occurrence in the digit
  // stream of length > target — short targets (<=3 digits) are excluded to
  // avoid spurious hits.
  if (target.length >= 4 && index.concatenated.includes(target)) return "substring";
  return "none";
}

export function evaluateOcrAgainstGroundTruth(input: {
  engineName: string;
  pages: OcrEnginePage[];
  groundTruth: GroundTruthFact[];
}): OcrEvalResult {
  const indexByPage = new Map<number, PageNumericIndex>();
  let allConcat = "";
  const allTokens = new Set<string>();
  for (const page of input.pages) {
    const idx = buildPageIndex(page.text);
    indexByPage.set(page.pageNumber, idx);
    allConcat += idx.concatenated + "|";
    for (const t of idx.tokens) allTokens.add(t);
  }
  const allIndex: PageNumericIndex = { tokens: allTokens, concatenated: allConcat };

  const matches: FactMatch[] = [];
  let factsWithSourcePage = 0;
  let matchedOnSourcePage = 0;
  let exactOnSourcePage = 0;
  let substringOnSourcePage = 0;
  let matchedOnAnyPage = 0;

  for (const fact of input.groundTruth) {
    const target = digitsOnly(fact.value);
    if (target.length === 0) continue;

    const anyKind = classifyMatch(allIndex, target);
    if (anyKind !== "none") matchedOnAnyPage += 1;

    let sourceKind: MatchKind = "none";
    let nearMiss: string | null = null;
    if (fact.sourcePage != null) {
      factsWithSourcePage += 1;
      const pageIndex = indexByPage.get(fact.sourcePage);
      if (pageIndex) {
        sourceKind = classifyMatch(pageIndex, target);
        if (sourceKind === "none") {
          for (const tok of pageIndex.tokens) {
            const d = digitsOnly(tok);
            if (d.length === target.length && d !== target) {
              let diff = 0;
              for (let i = 0; i < d.length; i++) if (d[i] !== target[i]) diff++;
              if (diff > 0 && diff <= 2) {
                nearMiss = tok;
                break;
              }
            }
          }
        }
      }
      if (sourceKind === "exact") {
        matchedOnSourcePage += 1;
        exactOnSourcePage += 1;
      } else if (sourceKind === "substring") {
        matchedOnSourcePage += 1;
        substringOnSourcePage += 1;
      }
    }

    matches.push({
      metricKey: fact.metricKey,
      value: fact.value,
      sourcePage: fact.sourcePage,
      foundOnSourcePage: sourceKind !== "none",
      sourceMatchKind: sourceKind,
      foundOnAnyPage: anyKind !== "none",
      nearMiss,
    });
  }

  return {
    engineName: input.engineName,
    totalFacts: input.groundTruth.length,
    factsWithSourcePage,
    matchedOnSourcePage,
    exactOnSourcePage,
    substringOnSourcePage,
    matchedOnAnyPage,
    sourcePageRecall: factsWithSourcePage > 0 ? matchedOnSourcePage / factsWithSourcePage : 0,
    anyPageRecall: input.groundTruth.length > 0 ? matchedOnAnyPage / input.groundTruth.length : 0,
    matches,
  };
}
