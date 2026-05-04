import {
  normalizePdfDecisionRuleConfig,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";
import {
  evaluatePdfDecisionFixtures,
  type PdfDecisionEvaluationFixture,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-evaluation";
import type { PdfDecisionRuleTuningCandidate } from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-tuning";
import { runPdfDecisionEngine } from "@/integrations/brreg/annual-report-financials/pdf-decision-engine";
import type { PdfDecisionRuleConfigOverrides } from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";

// Snapshot item type — optionally includes decisionInput for engine re-runs.
export type PdfDecisionGoldSetSnapshotItemDecisionInput = Parameters<typeof runPdfDecisionEngine>[0];

export type PdfDecisionGoldSetSnapshotItem = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  expectedRoute?: string | null;
  expectedRiskLevel?: string | null;
  expectedOutcome?: string | null;
  expectedConfidenceScore?: number | null;
  expectedManualReviewReasons?: string[];
  goldSetReason?: string | null;
  goldSetNote?: string | null;
  sourceDecisionVersion?: string | null;
  sourceRuleConfigVersion?: string | null;
  // Optional: if present, we can re-run the engine for tuning comparisons.
  decisionInput?: PdfDecisionGoldSetSnapshotItemDecisionInput | null;
};

export type PdfDecisionGoldSetSnapshot = {
  version: "pdf-decision-gold-set-snapshot-v1";
  generatedAt: string;
  itemCount: number;
  items: PdfDecisionGoldSetSnapshotItem[];
};

export type PdfDecisionGoldSetRuleTuningChangeType =
  | "IMPROVED"
  | "REGRESSED"
  | "ROUTE_CHANGED"
  | "RISK_CHANGED"
  | "CONFIDENCE_CHANGED"
  | "UNCHANGED";

export type PdfDecisionGoldSetRuleTuningComparison = {
  candidateId: string;
  candidateDescription?: string;
  snapshotItemCount: number;
  evaluatedCount: number;
  matchedCount: number;
  mismatchCount: number;
  routeMismatchCount: number;
  riskMismatchCount: number;
  outcomeMismatchCount: number;
  confidenceImprovementCount: number;
  confidenceRegressionCount: number;
  changedItems: Array<{
    filingId: string;
    orgNumber?: string | null;
    fiscalYear?: number | null;
    expectedRoute?: string | null;
    candidateRoute?: string | null;
    expectedRiskLevel?: string | null;
    candidateRiskLevel?: string | null;
    expectedOutcome?: string | null;
    notes: string[];
    changeType: PdfDecisionGoldSetRuleTuningChangeType;
  }>;
};

export type PdfDecisionGoldSetRuleTuningReport = {
  version: "pdf-decision-gold-set-rule-tuning-v1";
  generatedAt: string;
  snapshotVersion: string;
  candidateCount: number;
  baselineRuleConfigVersion: string;
  candidates: PdfDecisionGoldSetRuleTuningComparison[];
  recommendation: {
    bestCandidateId?: string;
    reason: string;
  };
};

type ItemEngineResult = {
  route: string;
  riskLevel: string;
  confidenceScore: number;
};

// Run the engine once per item with decisionInput; results are shared across all candidates.
function buildBaselineCache(
  items: PdfDecisionGoldSetSnapshotItem[],
): Map<string, ItemEngineResult> {
  const cache = new Map<string, ItemEngineResult>();
  for (const item of items) {
    if (!item.decisionInput) continue;
    try {
      const result = runPdfDecisionEngine(item.decisionInput);
      cache.set(item.filingId, {
        route: result.route,
        riskLevel: result.riskLevel,
        confidenceScore: result.confidenceScore,
      });
    } catch {
      // Item not added to cache; treated as unevaluable.
    }
  }
  return cache;
}

function compareSnapshotItemToCandidate(
  item: PdfDecisionGoldSetSnapshotItem,
  candidateConfig: PdfDecisionRuleConfigOverrides,
  baseline: ItemEngineResult | undefined,
): {
  changeType: PdfDecisionGoldSetRuleTuningChangeType;
  candidateRoute?: string | null;
  candidateRiskLevel?: string | null;
  candidateConfidenceScore?: number | null;
  baselineConfidenceScore?: number | null;
  notes: string[];
} {
  const notes: string[] = [];

  if (!item.decisionInput || !baseline) {
    notes.push("INSUFFICIENT_INPUT_FOR_RERUN: snapshot item has no decisionInput.");
    return { changeType: "UNCHANGED", candidateRoute: null, candidateRiskLevel: null, notes };
  }

  let candidateResult: ItemEngineResult | undefined;
  try {
    const result = runPdfDecisionEngine(item.decisionInput, { ruleConfig: candidateConfig });
    candidateResult = {
      route: result.route,
      riskLevel: result.riskLevel,
      confidenceScore: result.confidenceScore,
    };
  } catch {
    notes.push("INSUFFICIENT_INPUT_FOR_RERUN: engine evaluation failed.");
    return { changeType: "UNCHANGED", candidateRoute: null, candidateRiskLevel: null, notes };
  }

  const candidateRoute = candidateResult.route;
  const candidateRiskLevel = candidateResult.riskLevel;
  const baselineRoute = baseline.route;
  const baselineRiskLevel = baseline.riskLevel;

  const expectedRoute = item.expectedRoute;
  const expectedRiskLevel = item.expectedRiskLevel;

  const baselineRouteMatch = !expectedRoute || baselineRoute === expectedRoute;
  const baselineRiskMatch = !expectedRiskLevel || baselineRiskLevel === expectedRiskLevel;
  const candidateRouteMatch = !expectedRoute || candidateRoute === expectedRoute;
  const candidateRiskMatch = !expectedRiskLevel || candidateRiskLevel === expectedRiskLevel;

  const baselineOk = baselineRouteMatch && baselineRiskMatch;
  const candidateOk = candidateRouteMatch && candidateRiskMatch;

  if (!baselineOk && candidateOk) {
    notes.push("Candidate resolves a baseline mismatch against expected values.");
    return {
      changeType: "IMPROVED",
      candidateRoute,
      candidateRiskLevel,
      candidateConfidenceScore: candidateResult.confidenceScore,
      baselineConfidenceScore: baseline.confidenceScore,
      notes,
    };
  }

  if (baselineOk && !candidateOk) {
    notes.push("Candidate introduces a mismatch against expected values.");
    if (!candidateRouteMatch) {
      notes.push(`Route: expected ${expectedRoute}, candidate ${candidateRoute}.`);
    }
    if (!candidateRiskMatch) {
      notes.push(`Risk: expected ${expectedRiskLevel}, candidate ${candidateRiskLevel}.`);
    }
    return {
      changeType: "REGRESSED",
      candidateRoute,
      candidateRiskLevel,
      candidateConfidenceScore: candidateResult.confidenceScore,
      baselineConfidenceScore: baseline.confidenceScore,
      notes,
    };
  }

  if (baselineRoute !== candidateRoute) {
    notes.push(`Route changed from ${baselineRoute} to ${candidateRoute} (expected: ${expectedRoute ?? "any"}).`);
    return {
      changeType: "ROUTE_CHANGED",
      candidateRoute,
      candidateRiskLevel,
      candidateConfidenceScore: candidateResult.confidenceScore,
      baselineConfidenceScore: baseline.confidenceScore,
      notes,
    };
  }

  if (baselineRiskLevel !== candidateRiskLevel) {
    notes.push(`Risk changed from ${baselineRiskLevel} to ${candidateRiskLevel} (expected: ${expectedRiskLevel ?? "any"}).`);
    return {
      changeType: "RISK_CHANGED",
      candidateRoute,
      candidateRiskLevel,
      candidateConfidenceScore: candidateResult.confidenceScore,
      baselineConfidenceScore: baseline.confidenceScore,
      notes,
    };
  }

  const baselineConf = baseline.confidenceScore;
  const candidateConf = candidateResult.confidenceScore;
  const confDelta = Number((candidateConf - baselineConf).toFixed(4));
  if (Math.abs(confDelta) >= 0.05) {
    notes.push(`Confidence changed by ${confDelta}.`);
    return {
      changeType: "CONFIDENCE_CHANGED",
      candidateRoute,
      candidateRiskLevel,
      candidateConfidenceScore: candidateConf,
      baselineConfidenceScore: baselineConf,
      notes,
    };
  }

  return { changeType: "UNCHANGED", candidateRoute, candidateRiskLevel, notes };
}

function compareGoldSetCandidate(
  snapshot: PdfDecisionGoldSetSnapshot,
  candidate: PdfDecisionRuleTuningCandidate,
  baselineCache: Map<string, ItemEngineResult>,
): PdfDecisionGoldSetRuleTuningComparison {
  const changedItems: PdfDecisionGoldSetRuleTuningComparison["changedItems"] = [];
  let evaluatedCount = 0;
  let matchedCount = 0;
  let mismatchCount = 0;
  let routeMismatchCount = 0;
  let riskMismatchCount = 0;
  let outcomeMismatchCount = 0;
  let confidenceImprovementCount = 0;
  let confidenceRegressionCount = 0;

  for (const item of snapshot.items) {
    const baseline = baselineCache.get(item.filingId);
    const {
      changeType,
      candidateRoute,
      candidateRiskLevel,
      candidateConfidenceScore,
      baselineConfidenceScore,
      notes,
    } = compareSnapshotItemToCandidate(item, candidate.ruleConfigOverride, baseline);

    if (item.decisionInput && baseline && !notes.some((n) => n.includes("INSUFFICIENT_INPUT_FOR_RERUN"))) {
      evaluatedCount++;
    }

    if (changeType === "UNCHANGED") {
      matchedCount++;
    } else {
      mismatchCount++;
      if (changeType === "ROUTE_CHANGED") routeMismatchCount++;
      if (changeType === "RISK_CHANGED") riskMismatchCount++;
      if (changeType === "REGRESSED") mismatchCount++;

      const expectedRoute = item.expectedRoute;

      if (changeType === "ROUTE_CHANGED" && expectedRoute && candidateRoute === expectedRoute) {
        routeMismatchCount = Math.max(0, routeMismatchCount - 1);
      }

      if (changeType === "CONFIDENCE_CHANGED") {
        // Use already-computed confidence scores — no additional engine call needed.
        const baselineConf = baselineConfidenceScore ?? 0;
        const candidateConf = candidateConfidenceScore ?? null;
        if (candidateConf !== null) {
          if (candidateConf > baselineConf) confidenceImprovementCount++;
          else confidenceRegressionCount++;
        } else {
          if (notes.some((n) => n.includes("changed by -"))) {
            confidenceRegressionCount++;
          } else {
            confidenceImprovementCount++;
          }
        }
      }

      changedItems.push({
        filingId: item.filingId,
        orgNumber: item.orgNumber,
        fiscalYear: item.fiscalYear,
        expectedRoute: item.expectedRoute,
        candidateRoute,
        expectedRiskLevel: item.expectedRiskLevel,
        candidateRiskLevel,
        expectedOutcome: item.expectedOutcome,
        notes,
        changeType,
      });
    }
  }

  return {
    candidateId: candidate.id,
    candidateDescription: candidate.description,
    snapshotItemCount: snapshot.items.length,
    evaluatedCount,
    matchedCount,
    mismatchCount: changedItems.filter((i) => i.changeType === "REGRESSED").length,
    routeMismatchCount,
    riskMismatchCount,
    outcomeMismatchCount,
    confidenceImprovementCount,
    confidenceRegressionCount,
    changedItems,
  };
}

function recommendFromGoldSet(
  candidates: PdfDecisionGoldSetRuleTuningComparison[],
): PdfDecisionGoldSetRuleTuningReport["recommendation"] {
  if (candidates.length === 0) {
    return { reason: "No tuning candidates provided." };
  }

  const evaluable = candidates.filter((c) => c.evaluatedCount > 0);

  if (evaluable.length === 0) {
    return {
      reason:
        "No candidates could be evaluated: all snapshot items lack decisionInput for engine re-run.",
    };
  }

  const noRegressions = evaluable.filter(
    (c) => !c.changedItems.some((i) => i.changeType === "REGRESSED"),
  );

  if (noRegressions.length === 0) {
    return { reason: "All evaluable candidates introduced regressions against gold-set expectations." };
  }

  const minMismatch = Math.min(...noRegressions.map((c) => c.mismatchCount));
  const best = noRegressions.filter((c) => c.mismatchCount === minMismatch);

  if (best.length === 1) {
    return {
      bestCandidateId: best[0].candidateId,
      reason: `${best[0].candidateId} has the fewest mismatches (${minMismatch}) against the gold-set without regressions.`,
    };
  }

  return {
    reason: `Multiple candidates tied with ${minMismatch} mismatches: ${best.map((c) => c.candidateId).join(", ")}.`,
  };
}

export function evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot(input: {
  snapshot: PdfDecisionGoldSetSnapshot;
  candidates: PdfDecisionRuleTuningCandidate[];
}): PdfDecisionGoldSetRuleTuningReport {
  const baselineConfig = normalizePdfDecisionRuleConfig();
  const baselineCache = buildBaselineCache(input.snapshot.items);
  const candidates = input.candidates.map((candidate) =>
    compareGoldSetCandidate(input.snapshot, candidate, baselineCache),
  );

  return {
    version: "pdf-decision-gold-set-rule-tuning-v1",
    generatedAt: new Date().toISOString(),
    snapshotVersion: input.snapshot.version,
    candidateCount: input.candidates.length,
    baselineRuleConfigVersion: baselineConfig.version,
    candidates,
    recommendation: recommendFromGoldSet(candidates),
  };
}

// Helper to build a minimal fixture from a snapshot item that has decisionInput,
// usable for passing to evaluatePdfDecisionFixtures.
export function snapshotItemToEvaluationFixture(
  item: PdfDecisionGoldSetSnapshotItem,
): PdfDecisionEvaluationFixture | null {
  if (!item.decisionInput) return null;
  return {
    name: item.filingId,
    description: item.goldSetNote ?? undefined,
    input: item.decisionInput as PdfDecisionEvaluationFixture["input"],
    expected: {
      route: (item.expectedRoute as PdfDecisionEvaluationFixture["expected"]["route"]) ?? undefined,
      riskLevel:
        (item.expectedRiskLevel as PdfDecisionEvaluationFixture["expected"]["riskLevel"]) ?? undefined,
    },
  };
}
