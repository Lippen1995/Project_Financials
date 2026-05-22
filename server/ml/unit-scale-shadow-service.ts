/**
 * Unit-Scale Shadow Comparison
 *
 * Runs the in-house unit-scale ML model *alongside* the existing regex-based
 * detector and reports how often they agree — WITHOUT changing any
 * production output. This is the safe first step before trusting a model:
 * we measure it against the rule on real filings, accumulate evidence, and
 * only later (a separate, deliberate step) let the model's prediction win.
 *
 * For reviewers (business view):
 *  - Shadow mode means "watch and compare, change nothing".
 *  - If the ML service is down, this produces an empty comparison and the
 *    pipeline is completely unaffected.
 *  - The output is a small summary that can be logged or surfaced on the
 *    learning dashboard to answer "is the model ready to take over?".
 */
import type { PageTextLayer } from "@/integrations/brreg/annual-report-financials/types";
import { predictUnitScale } from "@/server/ml/ml-inference-client";

// Page types where a unit scale is meaningful — statement and supplementary
// pages carry monetary tables. Cover/note/auditor pages do not.
const STATEMENT_LIKE_TYPES = new Set([
  "STATUTORY_INCOME",
  "STATUTORY_BALANCE",
  "STATUTORY_BALANCE_CONTINUATION",
  "SUPPLEMENTARY_INCOME",
  "SUPPLEMENTARY_BALANCE",
]);

// The unit-scale header almost always sits near the top of the page. We feed
// the model a bounded slice so a noisy full-page text doesn't drown the
// signal it was trained on.
const HEADER_TEXT_MAX_CHARS = 400;

export type UnitScaleShadowComparisonRow = {
  pageNumber: number;
  pageType: string;
  ruleUnitScale: number | null;
  mlUnitScale: number | null;
  mlConfidence: number | null;
  agree: boolean;
};

export type UnitScaleShadowComparisonSummary = {
  /** Whether the ML inference service was reachable at all. */
  serviceAvailable: boolean;
  comparedPages: number;
  agreements: number;
  disagreements: number;
  /** Pages where the rule had a scale but the model could not be consulted. */
  skipped: number;
  agreementRate: number | null;
  rows: UnitScaleShadowComparisonRow[];
};

function extractHeaderText(page: PageTextLayer): string {
  // Prefer the first few lines — that's where "Beløp i NOK 1000" lives.
  const fromLines = page.lines
    .slice(0, 8)
    .map((line) => line.text)
    .join(" ")
    .trim();
  const base = fromLines.length > 0 ? fromLines : (page.normalizedText ?? page.text ?? "");
  return base.slice(0, HEADER_TEXT_MAX_CHARS);
}

export type RunUnitScaleShadowInput = {
  pages: PageTextLayer[];
  classifications: Array<{
    pageNumber: number;
    type: string;
    unitScale: number | null;
  }>;
};

/**
 * Compares ML unit-scale predictions against the rule-based classification
 * for every statement-like page. Never throws — a failure to reach the ML
 * service yields a summary with serviceAvailable=false.
 */
export async function runUnitScaleShadowComparison(
  input: RunUnitScaleShadowInput,
): Promise<UnitScaleShadowComparisonSummary> {
  const pagesByNumber = new Map(input.pages.map((p) => [p.pageNumber, p]));

  const relevant = input.classifications.filter((c) =>
    STATEMENT_LIKE_TYPES.has(c.type),
  );

  const rows: UnitScaleShadowComparisonRow[] = [];
  let serviceAvailable = true;
  let skipped = 0;

  for (const classification of relevant) {
    const page = pagesByNumber.get(classification.pageNumber);
    if (!page) {
      skipped++;
      continue;
    }

    const headerText = extractHeaderText(page);
    if (headerText.length === 0) {
      skipped++;
      continue;
    }

    const prediction = await predictUnitScale({
      rawLabel: headerText,
      proposedUnitScale: classification.unitScale,
    });

    if (prediction === null) {
      // The first null very likely means the service is unavailable; once we
      // know that, stop hammering it for the rest of the pages.
      serviceAvailable = false;
      skipped++;
      continue;
    }

    rows.push({
      pageNumber: classification.pageNumber,
      pageType: classification.type,
      ruleUnitScale: classification.unitScale,
      mlUnitScale: prediction.unitScale,
      mlConfidence: prediction.confidence,
      agree: classification.unitScale === prediction.unitScale,
    });
  }

  const comparedPages = rows.length;
  const agreements = rows.filter((r) => r.agree).length;
  const disagreements = comparedPages - agreements;

  return {
    serviceAvailable,
    comparedPages,
    agreements,
    disagreements,
    skipped,
    agreementRate: comparedPages === 0 ? null : agreements / comparedPages,
    rows,
  };
}
