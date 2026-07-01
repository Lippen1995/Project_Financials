import type {
  AnnualReportParsedInputPage,
  AnnualReportUnitScale,
  PageClassification,
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

const ML_APPLY_CONFIDENCE = 0.68;
const ML_WEAK_RULE_APPLY_CONFIDENCE = 0.62;
const WEAK_RULE_CONFIDENCE = 0.8;
const STRONG_RULE_CONFIDENCE = 0.9;
const RESOLVED_ML_CONFIDENCE_FLOOR = 0.82;

function isSupportedUnitScale(value: number): value is AnnualReportUnitScale {
  return value === 1 || value === 1000 || value === 1_000_000;
}

function clampConfidence(value: number) {
  return Number(Math.max(0, Math.min(0.995, value)).toFixed(3));
}

function mlResolvedConfidence(mlConfidence: number) {
  return clampConfidence(Math.max(mlConfidence, RESOLVED_ML_CONFIDENCE_FLOOR));
}

function addReason(classification: PageClassification, reason: string) {
  return [...new Set([...classification.reasons, reason])];
}

function withMlScale(
  classification: PageClassification,
  unitScale: AnnualReportUnitScale,
  mlConfidence: number,
  reason: string,
): PageClassification {
  return {
    ...classification,
    unitScale,
    unitScaleConfidence: mlResolvedConfidence(mlConfidence),
    hasConflictingUnitSignals: false,
    reasons: addReason(classification, reason),
  };
}

export type UnitScaleResolutionMode = "off" | "shadow" | "apply";

export type UnitScaleResolutionSummary = {
  mode: UnitScaleResolutionMode;
  serviceAvailable: boolean;
  attemptedPages: number;
  appliedPages: number;
  conflictPages: number;
};

export async function resolveUnitScaleClassifications(input: {
  pages: AnnualReportParsedInputPage[];
  classifications: PageClassification[];
  mode: UnitScaleResolutionMode;
}): Promise<{
  classifications: PageClassification[];
  summary: UnitScaleResolutionSummary;
}> {
  const summary: UnitScaleResolutionSummary = {
    mode: input.mode,
    serviceAvailable: true,
    attemptedPages: 0,
    appliedPages: 0,
    conflictPages: 0,
  };

  if (input.mode !== "apply") {
    return { classifications: input.classifications, summary };
  }

  const pagesByNumber = new Map(input.pages.map((page) => [page.pageNumber, page]));
  const resolved: PageClassification[] = [];

  for (const classification of input.classifications) {
    if (!STATEMENT_LIKE_TYPES.has(classification.type)) {
      resolved.push(classification);
      continue;
    }

    const page = pagesByNumber.get(classification.pageNumber);
    if (!page) {
      resolved.push(classification);
      continue;
    }

    const contextText = buildUnitScalePredictionText({ page, classification });
    if (contextText.length === 0) {
      resolved.push(classification);
      continue;
    }

    summary.attemptedPages += 1;
    const prediction = await predictUnitScale({
      rawLabel: contextText,
      proposedUnitScale: classification.unitScale,
    });

    if (!prediction) {
      summary.serviceAvailable = false;
      resolved.push(classification);
      const remaining = input.classifications.slice(resolved.length);
      return { classifications: [...resolved, ...remaining], summary };
    }

    if (!isSupportedUnitScale(prediction.unitScale)) {
      resolved.push(classification);
      continue;
    }

    const ruleScale = classification.unitScale;
    const ruleConfidence = classification.unitScaleConfidence;
    const mlConfidence = clampConfidence(prediction.confidence);

    if (ruleScale === prediction.unitScale) {
      resolved.push({
        ...classification,
        unitScaleConfidence: clampConfidence(Math.max(ruleConfidence, mlConfidence)),
        reasons: addReason(
          classification,
          `ML unit-scale agreed (${prediction.unitScale}, confidence ${mlConfidence})`,
        ),
      });
      continue;
    }

    if (ruleScale === null && mlConfidence >= ML_APPLY_CONFIDENCE) {
      summary.appliedPages += 1;
      resolved.push(
        withMlScale(
          classification,
          prediction.unitScale,
          mlConfidence,
          `ML resolved missing unit scale as ${prediction.unitScale}`,
        ),
      );
      continue;
    }

    if (
      ruleScale !== null &&
      ruleConfidence < WEAK_RULE_CONFIDENCE &&
      mlConfidence >= ML_WEAK_RULE_APPLY_CONFIDENCE
    ) {
      summary.appliedPages += 1;
      resolved.push(
        withMlScale(
          classification,
          prediction.unitScale,
          mlConfidence,
          `ML overrode weak unit-scale signal ${ruleScale} with ${prediction.unitScale}`,
        ),
      );
      continue;
    }

    if (ruleScale !== null && ruleConfidence >= STRONG_RULE_CONFIDENCE && mlConfidence >= ML_APPLY_CONFIDENCE) {
      summary.conflictPages += 1;
      resolved.push({
        ...classification,
        hasConflictingUnitSignals: true,
        unitScaleConfidence: clampConfidence(Math.min(ruleConfidence, mlConfidence)),
        reasons: addReason(
          classification,
          `ML unit-scale conflict: rule=${ruleScale}, ml=${prediction.unitScale}, mlConfidence=${mlConfidence}`,
        ),
      });
      continue;
    }

    resolved.push(classification);
  }

  return { classifications: resolved, summary };
}
