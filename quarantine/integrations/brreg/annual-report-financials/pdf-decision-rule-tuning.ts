import {
  normalizePdfDecisionRuleConfig,
  type PdfDecisionRuleConfig,
  type PdfDecisionRuleConfigOverrides,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";
import {
  evaluatePdfDecisionFixtures,
  type PdfDecisionEvaluationFixture,
  type PdfDecisionEvaluationResult,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-evaluation";

export type PdfDecisionRuleTuningCandidate = {
  id: string;
  family?: string;
  description?: string;
  rationale?: string;
  expectedEffect?: string;
  ruleConfigOverride: PdfDecisionRuleConfigOverrides;
};

export type PdfDecisionRuleTuningFixtureComparison = {
  candidateId: string;
  candidateFamily?: string;
  candidateDescription?: string;
  defaultPassed: boolean;
  candidatePassed: boolean;
  defaultFailedCount: number;
  candidateFailedCount: number;
  deltaFailedCount: number;
  changedDecisions: Array<{
    fixtureName: string;
    defaultRoute: string;
    candidateRoute: string;
    defaultRiskLevel: string;
    candidateRiskLevel: string;
    defaultConfidenceScore: number;
    candidateConfidenceScore: number;
    defaultPassed: boolean;
    candidatePassed: boolean;
    changeType:
      | "IMPROVED"
      | "REGRESSED"
      | "ROUTE_CHANGED"
      | "RISK_CHANGED"
      | "CONFIDENCE_CHANGED"
      | "UNCHANGED";
    notes: string[];
  }>;
};

export type PdfDecisionRuleTuningReport = {
  version: "pdf-decision-rule-tuning-v1";
  generatedAt: string;
  baselineRuleConfigVersion: string;
  fixtureCount: number;
  candidates: PdfDecisionRuleTuningFixtureComparison[];
  recommendation: {
    bestCandidateId?: string;
    reason: string;
  };
};

function classifyChange(
  baseline: PdfDecisionEvaluationResult,
  candidate: PdfDecisionEvaluationResult,
) {
  const notes: string[] = [];
  const confidenceDelta = Number(
    (candidate.confidenceScore - baseline.confidenceScore).toFixed(4),
  );
  if (!baseline.passed && candidate.passed) {
    notes.push("Candidate turns a failing fixture into a passing fixture.");
    return { changeType: "IMPROVED" as const, notes };
  }
  if (baseline.passed && !candidate.passed) {
    notes.push("Candidate regresses a passing fixture.");
    notes.push(...candidate.failures);
    return { changeType: "REGRESSED" as const, notes };
  }
  if (baseline.route !== candidate.route) {
    notes.push(`Route changed from ${baseline.route} to ${candidate.route}.`);
    return { changeType: "ROUTE_CHANGED" as const, notes };
  }
  if (baseline.riskLevel !== candidate.riskLevel) {
    notes.push(`Risk changed from ${baseline.riskLevel} to ${candidate.riskLevel}.`);
    return { changeType: "RISK_CHANGED" as const, notes };
  }
  if (Math.abs(confidenceDelta) >= 0.05) {
    notes.push(`Confidence changed by ${confidenceDelta}.`);
    return { changeType: "CONFIDENCE_CHANGED" as const, notes };
  }
  return { changeType: "UNCHANGED" as const, notes };
}

function compareCandidate(input: {
  candidate: PdfDecisionRuleTuningCandidate;
  fixtures: PdfDecisionEvaluationFixture[];
  defaultResults: PdfDecisionEvaluationResult[];
  defaultFailedCount: number;
}): PdfDecisionRuleTuningFixtureComparison {
  const candidateSummary = evaluatePdfDecisionFixtures(input.fixtures, {
    ruleConfig: input.candidate.ruleConfigOverride,
  });
  const changedDecisions = candidateSummary.results.map((candidateResult, index) => {
    const defaultResult = input.defaultResults[index];
    const change = classifyChange(defaultResult, candidateResult);
    return {
      fixtureName: candidateResult.name,
      defaultRoute: defaultResult.route,
      candidateRoute: candidateResult.route,
      defaultRiskLevel: defaultResult.riskLevel,
      candidateRiskLevel: candidateResult.riskLevel,
      defaultConfidenceScore: defaultResult.confidenceScore,
      candidateConfidenceScore: candidateResult.confidenceScore,
      defaultPassed: defaultResult.passed,
      candidatePassed: candidateResult.passed,
      changeType: change.changeType,
      notes: change.notes,
    };
  }).filter((change) => change.changeType !== "UNCHANGED");

  return {
    candidateId: input.candidate.id,
    candidateFamily: input.candidate.family,
    candidateDescription: input.candidate.description,
    defaultPassed: input.defaultFailedCount === 0,
    candidatePassed: candidateSummary.failedCount === 0,
    defaultFailedCount: input.defaultFailedCount,
    candidateFailedCount: candidateSummary.failedCount,
    deltaFailedCount: candidateSummary.failedCount - input.defaultFailedCount,
    changedDecisions,
  };
}

function recommend(
  candidates: PdfDecisionRuleTuningFixtureComparison[],
): PdfDecisionRuleTuningReport["recommendation"] {
  if (candidates.length === 0) {
    return { reason: "No tuning candidates were provided." };
  }
  const eligible = candidates.filter(
    (candidate) =>
      candidate.candidateFailedCount ===
        Math.min(...candidates.map((item) => item.candidateFailedCount)) &&
      !candidate.changedDecisions.some((change) => change.changeType === "REGRESSED"),
  );
  if (eligible.length === 0) {
    return { reason: "No candidate avoided regressions." };
  }
  if (eligible.length > 1) {
    return {
      reason: `Multiple candidates tied without regressions: ${eligible.map((item) => item.candidateId).join(", ")}.`,
    };
  }
  return {
    bestCandidateId: eligible[0].candidateId,
    reason: `${eligible[0].candidateId} has the fewest failed fixtures without regressions.`,
  };
}

export function evaluatePdfDecisionRuleTuningCandidates(input: {
  fixtures: PdfDecisionEvaluationFixture[];
  candidates: PdfDecisionRuleTuningCandidate[];
}): PdfDecisionRuleTuningReport {
  const baselineConfig: PdfDecisionRuleConfig = normalizePdfDecisionRuleConfig();
  const defaultSummary = evaluatePdfDecisionFixtures(input.fixtures);
  const candidates = input.candidates.map((candidate) =>
    compareCandidate({
      candidate,
      fixtures: input.fixtures,
      defaultResults: defaultSummary.results,
      defaultFailedCount: defaultSummary.failedCount,
    }),
  );

  return {
    version: "pdf-decision-rule-tuning-v1",
    generatedAt: new Date().toISOString(),
    baselineRuleConfigVersion: baselineConfig.version,
    fixtureCount: input.fixtures.length,
    candidates,
    recommendation: recommend(candidates),
  };
}
