/**
 * Unit-scale shadow comparison.
 *
 * Compares the in-house ML model against existing page classifications without
 * changing production output. Production apply-mode uses the same page context,
 * so shadow measurements now reflect the real model input.
 */
import type {
  AnnualReportUnitScale,
  PageClassification,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";
import { predictUnitScale } from "@/server/ml/ml-inference-client";
import { buildUnitScalePredictionText } from "@/server/ml/unit-scale-context";

const STATEMENT_LIKE_TYPES = new Set([
  "STATUTORY_INCOME",
  "STATUTORY_BALANCE",
  "STATUTORY_BALANCE_CONTINUATION",
  "SUPPLEMENTARY_INCOME",
  "SUPPLEMENTARY_BALANCE",
]);

export type UnitScaleShadowComparisonRow = {
  pageNumber: number;
  pageType: string;
  ruleUnitScale: number | null;
  mlUnitScale: number | null;
  mlConfidence: number | null;
  agree: boolean;
};

export type UnitScaleShadowComparisonSummary = {
  serviceAvailable: boolean;
  comparedPages: number;
  agreements: number;
  disagreements: number;
  skipped: number;
  agreementRate: number | null;
  rows: UnitScaleShadowComparisonRow[];
};

export type RunUnitScaleShadowInput = {
  pages: PageTextLayer[];
  classifications: Array<{
    pageNumber: number;
    type: PageClassification["type"];
    unitScale: AnnualReportUnitScale | null;
  }>;
};

function toMinimalClassification(input: RunUnitScaleShadowInput["classifications"][number]) {
  return {
    ...input,
    confidence: 1,
    unitScaleConfidence: input.unitScale === null ? 0 : 1,
    hasConflictingUnitSignals: false,
    statementScope: "COMPANY",
    hasExplicitScopeSignal: false,
    reportingCurrency: "NOK",
    declaredYears: [],
    yearHeaderYears: [],
    heading: null,
    numericRowCount: 0,
    tableLike: true,
    reasons: [],
  } satisfies PageClassification;
}

export async function runUnitScaleShadowComparison(
  input: RunUnitScaleShadowInput,
): Promise<UnitScaleShadowComparisonSummary> {
  const pagesByNumber = new Map(input.pages.map((page) => [page.pageNumber, page]));
  const relevant = input.classifications.filter((classification) =>
    STATEMENT_LIKE_TYPES.has(classification.type),
  );

  const rows: UnitScaleShadowComparisonRow[] = [];
  let serviceAvailable = true;
  let skipped = 0;

  for (let index = 0; index < relevant.length; index += 1) {
    const classification = relevant[index]!;
    const page = pagesByNumber.get(classification.pageNumber);
    if (!page) {
      skipped += 1;
      continue;
    }

    const contextText = buildUnitScalePredictionText({
      page,
      classification: toMinimalClassification(classification),
    });
    if (contextText.length === 0) {
      skipped += 1;
      continue;
    }

    const prediction = await predictUnitScale({
      rawLabel: contextText,
      proposedUnitScale: classification.unitScale,
    });

    if (prediction === null) {
      serviceAvailable = false;
      skipped += relevant.length - index;
      break;
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
  const agreements = rows.filter((row) => row.agree).length;
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
