import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
  type UnifiedExtractionConfidenceGateConfig,
  type UnifiedExtractionGateOverallVerdict,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import {
  buildAnnualReportManualReviewRound,
  readLatestAnnualReportManualReviewRound,
  type AnnualReportManualReviewCandidate,
  type AnnualReportManualReviewDecisionValue,
  type AnnualReportManualReviewRound,
} from "@/server/services/annual-report-manual-review-round-service";
import type { AnnualReportGoldSetShadowRun } from "@/server/benchmarking/annual-report-gold-set-shadow-run";

const GOLD_SET_SHADOW_RUN_DIR = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-gold-set-shadow-runs",
);

const CALIBRATION_OUTPUT_DIR = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-unified-confidence-calibration",
);

const KEY_FIELDS = [
  "revenue",
  "operating_result",
  "net_income",
  "total_assets",
  "total_equity",
  "total_liabilities",
  "cash_and_cash_equivalents",
] as const;

const HIGH_RISK_TAGS = [
  "manual_review_expected",
  "degraded_ambiguous",
  "ocr_token_noise",
  "continuation_complex",
  "unit_scale_sensitive",
  "formatting_edge",
  "scan_or_ocr",
] as const;

const FAIL_CLASS_SET = new Set([
  "missing_legacy_result",
  "artifact_or_runtime_blocker",
  "large_relative_deviation",
  "norwegian_statement_line_item_conflict",
]);

const SAFE_REVIEW_DECISIONS = new Set<AnnualReportManualReviewDecisionValue>([
  "UNIFIED_CORRECT",
  "BOTH_CORRECT",
]);

const UNSAFE_REVIEW_DECISIONS = new Set<AnnualReportManualReviewDecisionValue>([
  "LEGACY_CORRECT",
  "BOTH_WRONG",
  "AMBIGUOUS",
  "NEEDS_EXTRACTION_FIX",
  "BLOCK_PUBLISH",
]);

export type CalibrationDirection = "KEEP" | "TIGHTEN" | "RELAX" | "NEEDS_MORE_DATA";
export type CalibrationStatus = "STABLE" | "TIGHTENED" | "REVIEW_REQUIRED" | "INSUFFICIENT_EVIDENCE";
export type CalibratedConfidenceDecision = "PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA";

export type AnnualReportUnifiedConfidenceCalibrationPolicy = {
  minComparisonMatchRateForPass: number;
  majorMismatchDeviationThreshold: number;
  missingSourcePdfDecision: Extract<CalibratedConfidenceDecision, "WARN" | "FAIL">;
  missingStructuredDocumentDecision: Extract<CalibratedConfidenceDecision, "WARN" | "FAIL">;
  parserRuntimeUnavailableDecision: Extract<CalibratedConfidenceDecision, "WARN" | "FAIL">;
  unitScaleAmbiguityDecision: Extract<CalibratedConfidenceDecision, "WARN" | "FAIL">;
  missingPrimaryStatementDecision: Extract<CalibratedConfidenceDecision, "WARN" | "FAIL">;
  narrativeMismatchDecision: Extract<CalibratedConfidenceDecision, "WARN" | "FAIL">;
  highSeverityCandidateDecision: Extract<CalibratedConfidenceDecision, "WARN" | "FAIL">;
  highRiskTagsForceReview: string[];
  explanationNotes: string[];
};

export type AnnualReportUnifiedConfidenceCalibrationInput = {
  runId?: string;
  includeUnreviewed?: boolean;
  generatedBy?: string | null;
};

export type AnnualReportUnifiedConfidenceCalibrationMetric = {
  totalReviewedCases: number;
  autoPassCandidates: number;
  reviewCandidates: number;
  blockedCandidates: number;
  falsePassCount: number;
  falsePassRate: number | null;
  falseReviewCount: number;
  falseReviewRate: number | null;
  falseBlockCount: number;
  falseBlockRate: number | null;
  safeAutoPassPrecision: number | null;
  safeAutoPassRecall: number | null;
  highSeverityMissCount: number;
  manualReviewRate: number | null;
  narrativeMismatchCount: number;
  unitScaleAmbiguityCount: number;
};

export type AnnualReportUnifiedConfidenceCalibrationDistribution = {
  PASS: number;
  WARN: number;
  FAIL: number;
  INSUFFICIENT_DATA: number;
};

export type AnnualReportUnifiedConfidenceCalibrationThresholdAdjustment = {
  key: string;
  direction: CalibrationDirection;
  currentValue: string;
  proposedValue: string;
  sampleSize: number;
  rationale: string;
};

export type AnnualReportUnifiedConfidenceCalibrationCaseExample = {
  filingId: string;
  companyName: string | null;
  orgNumber: string | null;
  accountingYear: number | null;
  rawDecision: CalibratedConfidenceDecision;
  calibratedDecision: CalibratedConfidenceDecision;
  severity: string | null;
  reviewDecision: AnnualReportManualReviewDecisionValue | null;
  topReason: string;
  issueClasses: string[];
  tags: string[];
};

export type AnnualReportUnifiedConfidenceCalibrationReport = {
  version: "annual-report-unified-confidence-calibration-v2";
  generatedAt: string;
  input: {
    runId: string | null;
    includeUnreviewed: boolean;
    generatedBy: string | null;
  };
  sourceRun: {
    runId: string | null;
    generatedAt: string | null;
    gitCommitSha: string | null;
    manifestName: string | null;
  };
  evidenceUsed: {
    totalGoldSetFilings: number;
    totalManualReviewCandidates: number;
    reviewedCandidates: number;
    pendingCandidates: number;
    blockedCandidates: number;
  };
  thresholdBehavior: {
    before: {
      gateConfig: UnifiedExtractionConfidenceGateConfig;
      policy: AnnualReportUnifiedConfidenceCalibrationPolicy;
      distribution: AnnualReportUnifiedConfidenceCalibrationDistribution;
    };
    after: {
      gateConfig: UnifiedExtractionConfidenceGateConfig;
      policy: AnnualReportUnifiedConfidenceCalibrationPolicy;
      distribution: AnnualReportUnifiedConfidenceCalibrationDistribution;
      status: CalibrationStatus;
    };
  };
  metrics: AnnualReportUnifiedConfidenceCalibrationMetric;
  distributions: {
    byTag: Array<{
      tag: string;
      before: AnnualReportUnifiedConfidenceCalibrationDistribution;
      after: AnnualReportUnifiedConfidenceCalibrationDistribution;
      reviewedCount: number;
      unsafeReviewedCount: number;
    }>;
    byIssueClass: Array<{
      issueClass: string;
      before: AnnualReportUnifiedConfidenceCalibrationDistribution;
      after: AnnualReportUnifiedConfidenceCalibrationDistribution;
      reviewedCount: number;
      unsafeReviewedCount: number;
    }>;
    canonicalKeyMismatchRates: Array<{
      canonicalKey: string;
      reviewedCount: number;
      mismatchCount: number;
      mismatchRate: number | null;
    }>;
  };
  thresholdAdjustments: AnnualReportUnifiedConfidenceCalibrationThresholdAdjustment[];
  remainingHighRiskCases: AnnualReportUnifiedConfidenceCalibrationCaseExample[];
  affectedExamples: AnnualReportUnifiedConfidenceCalibrationCaseExample[];
  recommendations: {
    pr78FailureTaxonomy: string[];
    pr79ExtractionFixes: string[];
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
  safety: {
    canUseForProductionRouting: false;
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
  };
};

export type AnnualReportUnifiedConfidenceCalibrationServiceDeps = {
  readLatestManualReviewRound?: typeof readLatestAnnualReportManualReviewRound;
  buildManualReviewRound?: typeof buildAnnualReportManualReviewRound;
  readShadowRunByRunId?: (runId: string) => Promise<AnnualReportGoldSetShadowRun | null>;
  readLatestShadowRun?: () => Promise<AnnualReportGoldSetShadowRun | null>;
  readFile?: typeof fs.readFile;
  readDir?: typeof fs.readdir;
  writeFile?: typeof fs.writeFile;
  mkdir?: typeof fs.mkdir;
  now?: () => Date;
};

type CalibrationCase = {
  filingId: string;
  companyName: string | null;
  orgNumber: string | null;
  accountingYear: number | null;
  rawDecision: CalibratedConfidenceDecision;
  tags: string[];
  candidate: AnnualReportManualReviewCandidate | null;
  reviewDecision: AnnualReportManualReviewDecisionValue | null;
  reviewed: boolean;
  safeReviewed: boolean;
  unsafeReviewed: boolean;
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function roundThreshold(value: number) {
  return Math.round(value * 100) / 100;
}

function emptyDistribution(): AnnualReportUnifiedConfidenceCalibrationDistribution {
  return {
    PASS: 0,
    WARN: 0,
    FAIL: 0,
    INSUFFICIENT_DATA: 0,
  };
}

function recordDistribution(
  distribution: AnnualReportUnifiedConfidenceCalibrationDistribution,
  verdict: CalibratedConfidenceDecision,
) {
  distribution[verdict] += 1;
}

function uniqueStrings(values: Iterable<string>) {
  return Array.from(new Set(Array.from(values).filter((value) => value.trim().length > 0)));
}

async function readShadowRunByRunIdFromDisk(
  runId: string,
  deps: AnnualReportUnifiedConfidenceCalibrationServiceDeps,
): Promise<AnnualReportGoldSetShadowRun | null> {
  const readDir = deps.readDir ?? fs.readdir;
  const readFile = deps.readFile ?? fs.readFile;
  const files = await readDir(GOLD_SET_SHADOW_RUN_DIR);
  const jsonFiles = files.filter((file) => file.endsWith(".json") && file !== "latest.json");

  for (const file of jsonFiles) {
    const raw = await readFile(path.join(GOLD_SET_SHADOW_RUN_DIR, file), "utf8");
    const parsed = JSON.parse(raw) as AnnualReportGoldSetShadowRun;
    if (parsed.version === "annual-report-gold-set-shadow-run-v1" && parsed.runId === runId) {
      return parsed;
    }
  }

  return null;
}

async function readLatestShadowRunFromDisk(
  deps: AnnualReportUnifiedConfidenceCalibrationServiceDeps,
): Promise<AnnualReportGoldSetShadowRun | null> {
  const readFile = deps.readFile ?? fs.readFile;
  try {
    const raw = await readFile(path.join(GOLD_SET_SHADOW_RUN_DIR, "latest.json"), "utf8");
    const parsed = JSON.parse(raw) as AnnualReportGoldSetShadowRun;
    return parsed.version === "annual-report-gold-set-shadow-run-v1" ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function isMissingPrimaryStatement(candidate: AnnualReportManualReviewCandidate | null) {
  if (!candidate) {
    return false;
  }

  return candidate.confidenceGateDiagnostics.some(
    (check) =>
      check.checkCode === "INCOME_STATEMENT_COVERAGE" ||
      check.checkCode === "BALANCE_SHEET_COVERAGE" ||
      check.checkCode === "TOTAL_ASSETS_FOUND",
  );
}

function maxRelativeDeviation(candidate: AnnualReportManualReviewCandidate | null) {
  if (!candidate) {
    return null;
  }

  const values = candidate.financialComparisons
    .map((item) => item.relativeDeviation)
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}

function hasMissingArtifact(candidate: AnnualReportManualReviewCandidate | null, key?: string) {
  if (!candidate) {
    return false;
  }

  return candidate.artifactRefs.some(
    (artifact) =>
      artifact.status !== "available" &&
      (key ? artifact.key === key : true),
  );
}

function hasHighRiskTag(tags: string[]) {
  return tags.some((tag) => HIGH_RISK_TAGS.includes(tag as (typeof HIGH_RISK_TAGS)[number]));
}

function baselinePolicy(): AnnualReportUnifiedConfidenceCalibrationPolicy {
  return {
    minComparisonMatchRateForPass:
      DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG.minComparisonMatchRateForPass,
    majorMismatchDeviationThreshold:
      DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG.majorMismatchDeviationThreshold,
    missingSourcePdfDecision: "WARN",
    missingStructuredDocumentDecision: "WARN",
    parserRuntimeUnavailableDecision: "WARN",
    unitScaleAmbiguityDecision: "FAIL",
    missingPrimaryStatementDecision: "WARN",
    narrativeMismatchDecision: "WARN",
    highSeverityCandidateDecision: "WARN",
    highRiskTagsForceReview: [...HIGH_RISK_TAGS],
    explanationNotes: [
      "Baseline policy mirrors dagens gate og holder strukturelle mangler på WARN der vi ennå mangler review-fasit.",
    ],
  };
}

function deriveCalibrationPolicy(cases: CalibrationCase[]): AnnualReportUnifiedConfidenceCalibrationPolicy {
  const policy = baselinePolicy();
  const notes: string[] = [];

  const reviewedCandidates = cases
    .filter((item): item is CalibrationCase & { candidate: AnnualReportManualReviewCandidate } =>
      item.reviewed && item.candidate !== null,
    );

  const unsafePassCases = reviewedCandidates.filter(
    (item) => item.rawDecision === "PASS" && item.unsafeReviewed,
  );

  const unsafeMatchRates = unsafePassCases
    .map((item) => item.candidate.comparisonResult.matchRate)
    .filter((value): value is number => value !== null);
  if (unsafeMatchRates.length > 0) {
    const highestUnsafePassRate = Math.max(...unsafeMatchRates);
    policy.minComparisonMatchRateForPass = roundThreshold(
      Math.min(0.95, Math.max(policy.minComparisonMatchRateForPass, highestUnsafePassRate + 0.05)),
    );
    notes.push(
      `Tightened comparison-match PASS threshold because ${unsafePassCases.length} reviewed PASS cases were not safe.`,
    );
  } else {
    notes.push("No reviewed unsafe PASS cases forced a tighter comparison-match PASS threshold.");
  }

  const unsafeDeviationValues = reviewedCandidates
    .filter((item) => item.unsafeReviewed)
    .flatMap((item) =>
      item.candidate.financialComparisons
        .filter((comparison) => comparison.match === "CONFLICTING_VALUES")
        .map((comparison) => comparison.relativeDeviation)
        .filter((value): value is number => value !== null),
    );
  if (unsafeDeviationValues.length > 0) {
    policy.majorMismatchDeviationThreshold = roundThreshold(
      Math.max(0.2, Math.min(policy.majorMismatchDeviationThreshold, Math.min(...unsafeDeviationValues))),
    );
    notes.push(
      `Major mismatch threshold tightened using ${unsafeDeviationValues.length} reviewed conflicting-value deviations.`,
    );
  }

  const unsafeMissingStructured = reviewedCandidates.filter(
    (item) => item.unsafeReviewed && hasMissingArtifact(item.candidate, "structured_document_json"),
  ).length;
  if (unsafeMissingStructured > 0) {
    policy.missingStructuredDocumentDecision = "FAIL";
    notes.push("Missing structured document artifact escalates to FAIL based on reviewed unsafe cases.");
  }

  const unsafeMissingSourcePdf = reviewedCandidates.filter(
    (item) => item.unsafeReviewed && hasMissingArtifact(item.candidate, "source_pdf"),
  ).length;
  if (unsafeMissingSourcePdf > 0) {
    policy.missingSourcePdfDecision = "FAIL";
    notes.push("Missing source PDF escalates to FAIL based on reviewed unsafe cases.");
  }

  const unsafeRuntimeCases = reviewedCandidates.filter(
    (item) => item.unsafeReviewed && item.candidate.issueClasses.includes("artifact_or_runtime_blocker"),
  ).length;
  if (unsafeRuntimeCases > 0) {
    policy.parserRuntimeUnavailableDecision = "FAIL";
    notes.push("Runtime/parser blockers escalate to FAIL based on reviewed unsafe cases.");
  }

  const reviewedUnitScaleCases = reviewedCandidates.filter((item) =>
    item.candidate.issueClasses.includes("unit_scale_ambiguity"),
  );
  if (reviewedUnitScaleCases.some((item) => item.unsafeReviewed)) {
    policy.unitScaleAmbiguityDecision = "FAIL";
    notes.push("Unit-scale ambiguity stays on FAIL because reviewed cases were not safely auto-passable.");
  }

  const reviewedPrimaryStatementCases = reviewedCandidates.filter((item) =>
    isMissingPrimaryStatement(item.candidate),
  );
  if (reviewedPrimaryStatementCases.some((item) => item.unsafeReviewed)) {
    policy.missingPrimaryStatementDecision = "FAIL";
    notes.push("Missing primary statement coverage escalates to FAIL based on reviewed unsafe cases.");
  }

  const reviewedNarrativeCases = reviewedCandidates.filter((item) =>
    item.candidate.issueClasses.includes("narrative_mismatch"),
  );
  if (reviewedNarrativeCases.length > 0) {
    policy.narrativeMismatchDecision = reviewedNarrativeCases.some((item) => item.unsafeReviewed)
      ? "WARN"
      : "WARN";
    notes.push("Narrative mismatch remains review-worthy but not auto-pass safe.");
  }

  const reviewedHighSeverityPasses = reviewedCandidates.filter(
    (item) => item.candidate.severity === "HIGH",
  );
  if (reviewedHighSeverityPasses.length > 0) {
    policy.highSeverityCandidateDecision = reviewedHighSeverityPasses.some((item) => item.unsafeReviewed)
      ? "FAIL"
      : "WARN";
    notes.push("Reviewed HIGH-severity candidates no longer auto-pass after calibration.");
  }

  policy.explanationNotes = notes.length > 0 ? notes : policy.explanationNotes;
  return policy;
}

function compareSeverity(left: CalibratedConfidenceDecision, right: CalibratedConfidenceDecision) {
  const order: Record<CalibratedConfidenceDecision, number> = {
    PASS: 0,
    WARN: 1,
    FAIL: 2,
    INSUFFICIENT_DATA: 1,
  };
  return order[left] >= order[right] ? left : right;
}

export function buildCalibratedUnifiedConfidenceCaseDecision(input: {
  rawDecision: CalibratedConfidenceDecision;
  candidate: AnnualReportManualReviewCandidate | null;
  tags: string[];
  policy: AnnualReportUnifiedConfidenceCalibrationPolicy;
}): { decision: CalibratedConfidenceDecision; reasons: string[] } {
  const reasons: string[] = [];
  const candidate = input.candidate;
  let decision = input.rawDecision;

  if (!candidate) {
    if (decision === "PASS" && hasHighRiskTag(input.tags)) {
      decision = "WARN";
      reasons.push("High-risk gold-set tag forces review even without detailed candidate diagnostics.");
    }
    return { decision, reasons };
  }

  if (hasMissingArtifact(candidate, "source_pdf")) {
    decision = compareSeverity(decision, input.policy.missingSourcePdfDecision);
    reasons.push("Source PDF is missing.");
  }

  if (hasMissingArtifact(candidate, "structured_document_json")) {
    decision = compareSeverity(decision, input.policy.missingStructuredDocumentDecision);
    reasons.push("Structured document JSON is missing.");
  }

  if (candidate.issueClasses.includes("artifact_or_runtime_blocker")) {
    decision = compareSeverity(decision, input.policy.parserRuntimeUnavailableDecision);
    reasons.push("Artifact/runtime/parser blocker detected.");
  }

  if (candidate.issueClasses.includes("unit_scale_ambiguity")) {
    decision = compareSeverity(decision, input.policy.unitScaleAmbiguityDecision);
    reasons.push("Unit scale is ambiguous.");
  }

  if (isMissingPrimaryStatement(candidate)) {
    decision = compareSeverity(decision, input.policy.missingPrimaryStatementDecision);
    reasons.push("Primary financial statement coverage is incomplete.");
  }

  const deviation = maxRelativeDeviation(candidate);
  if (
    deviation !== null &&
    deviation >= input.policy.majorMismatchDeviationThreshold
  ) {
    decision = compareSeverity(decision, "FAIL");
    reasons.push(
      `Relative deviation ${deviation.toFixed(2)} exceeds calibrated major-mismatch threshold.`,
    );
  }

  if (
    decision === "PASS" &&
    candidate.comparisonResult.matchRate !== null &&
    candidate.comparisonResult.matchRate < input.policy.minComparisonMatchRateForPass
  ) {
    decision = "WARN";
    reasons.push("Comparison match rate is below the calibrated PASS threshold.");
  }

  if (candidate.issueClasses.includes("narrative_mismatch")) {
    decision = compareSeverity(decision, input.policy.narrativeMismatchDecision);
    reasons.push("Narrative mismatch requires review.");
  }

  if (candidate.severity === "HIGH") {
    decision = compareSeverity(decision, input.policy.highSeverityCandidateDecision);
    reasons.push("HIGH severity candidate must not auto-pass after review calibration.");
  }

  if (candidate.issueClasses.some((issueClass) => FAIL_CLASS_SET.has(issueClass))) {
    decision = compareSeverity(decision, "FAIL");
    reasons.push("Known high-risk issue class blocks a safe auto-pass.");
  }

  if (decision === "PASS" && hasHighRiskTag(candidate.tags)) {
    decision = "WARN";
    reasons.push("High-risk gold-set tag keeps the filing in review.");
  }

  if (decision === "PASS" && candidate.latestDecision && UNSAFE_REVIEW_DECISIONS.has(candidate.latestDecision.decision)) {
    decision = "FAIL";
    reasons.push("Manual review evidence says the filing was not safe despite a PASS gate.");
  }

  return { decision, reasons: uniqueStrings(reasons) };
}

function mapRawDecision(verdict: UnifiedExtractionGateOverallVerdict | null): CalibratedConfidenceDecision {
  return verdict ?? "INSUFFICIENT_DATA";
}

function toCalibrationCase(
  shadowCase: AnnualReportGoldSetShadowRun["batch"]["cases"][number],
  candidate: AnnualReportManualReviewCandidate | null,
): CalibrationCase {
  const reviewDecision = candidate?.latestDecision?.decision ?? null;
  return {
    filingId: shadowCase.filingId,
    companyName: shadowCase.companyName,
    orgNumber: shadowCase.orgNumber,
    accountingYear: shadowCase.fiscalYear,
    rawDecision: mapRawDecision(shadowCase.gateSummary.overallVerdict),
    tags: [...shadowCase.tagHints],
    candidate,
    reviewDecision,
    reviewed: reviewDecision !== null,
    safeReviewed: reviewDecision !== null && SAFE_REVIEW_DECISIONS.has(reviewDecision),
    unsafeReviewed: reviewDecision !== null && UNSAFE_REVIEW_DECISIONS.has(reviewDecision),
  };
}

function distributionFromCases(
  cases: CalibrationCase[],
  resolver: (item: CalibrationCase) => CalibratedConfidenceDecision,
) {
  const distribution = emptyDistribution();
  for (const item of cases) {
    recordDistribution(distribution, resolver(item));
  }
  return distribution;
}

function buildThresholdAdjustments(
  policy: AnnualReportUnifiedConfidenceCalibrationPolicy,
): AnnualReportUnifiedConfidenceCalibrationThresholdAdjustment[] {
  const baseline = baselinePolicy();
  const adjustments: AnnualReportUnifiedConfidenceCalibrationThresholdAdjustment[] = [];

  adjustments.push({
    key: "minComparisonMatchRateForPass",
    direction:
      policy.minComparisonMatchRateForPass > baseline.minComparisonMatchRateForPass
        ? "TIGHTEN"
        : policy.minComparisonMatchRateForPass < baseline.minComparisonMatchRateForPass
          ? "RELAX"
          : "KEEP",
    currentValue: String(baseline.minComparisonMatchRateForPass),
    proposedValue: String(policy.minComparisonMatchRateForPass),
    sampleSize: 0,
    rationale: "Calibrated from reviewed PASS cases versus unsafe outcomes.",
  });

  adjustments.push({
    key: "majorMismatchDeviationThreshold",
    direction:
      policy.majorMismatchDeviationThreshold < baseline.majorMismatchDeviationThreshold
        ? "TIGHTEN"
        : policy.majorMismatchDeviationThreshold > baseline.majorMismatchDeviationThreshold
          ? "RELAX"
          : "KEEP",
    currentValue: String(baseline.majorMismatchDeviationThreshold),
    proposedValue: String(policy.majorMismatchDeviationThreshold),
    sampleSize: 0,
    rationale: "Calibrated from reviewed conflicting-value deviations.",
  });

  for (const key of [
    "missingSourcePdfDecision",
    "missingStructuredDocumentDecision",
    "parserRuntimeUnavailableDecision",
    "unitScaleAmbiguityDecision",
    "missingPrimaryStatementDecision",
    "narrativeMismatchDecision",
    "highSeverityCandidateDecision",
  ] as const) {
    adjustments.push({
      key,
      direction:
        policy[key] === baseline[key]
          ? "KEEP"
          : policy[key] === "FAIL"
            ? "TIGHTEN"
            : "RELAX",
      currentValue: baseline[key],
      proposedValue: policy[key],
      sampleSize: 0,
      rationale: `Structural calibration for ${key}.`,
    });
  }

  return adjustments;
}

function buildMetrics(
  cases: CalibrationCase[],
  policy: AnnualReportUnifiedConfidenceCalibrationPolicy,
): AnnualReportUnifiedConfidenceCalibrationMetric {
  const reviewedCases = cases.filter((item) => item.reviewed);
  const autoPassCases = cases.filter((item) => item.rawDecision === "PASS");
  const reviewCases = cases.filter((item) => item.rawDecision === "WARN");
  const blockedCases = cases.filter((item) => item.rawDecision === "FAIL");
  const falsePassCount = reviewedCases.filter(
    (item) => item.rawDecision === "PASS" && item.unsafeReviewed,
  ).length;
  const falseReviewCount = reviewedCases.filter(
    (item) => item.rawDecision === "WARN" && item.safeReviewed,
  ).length;
  const falseBlockCount = reviewedCases.filter(
    (item) => item.rawDecision === "FAIL" && item.safeReviewed,
  ).length;
  const predictedSafeReviewed = reviewedCases.filter((item) => item.rawDecision === "PASS");
  const safePredictedSafe = predictedSafeReviewed.filter((item) => item.safeReviewed).length;
  const totalSafeReviewed = reviewedCases.filter((item) => item.safeReviewed).length;
  const highSeverityMissCount = reviewedCases.filter(
    (item) =>
      item.rawDecision === "PASS" &&
      item.candidate?.severity === "HIGH" &&
      item.unsafeReviewed,
  ).length;

  const candidateCases = cases
    .map((item) => item.candidate)
    .filter((item): item is AnnualReportManualReviewCandidate => item !== null);
  const narrativeMismatchCount = candidateCases.filter(
    (item) => item.issueClasses.includes("narrative_mismatch"),
  ).length;
  const unitScaleAmbiguityCount = candidateCases.filter(
    (item) => item.issueClasses.includes("unit_scale_ambiguity"),
  ).length;

  return {
    totalReviewedCases: reviewedCases.length,
    autoPassCandidates: autoPassCases.length,
    reviewCandidates: reviewCases.length,
    blockedCandidates: blockedCases.length,
    falsePassCount,
    falsePassRate: ratio(falsePassCount, predictedSafeReviewed.length),
    falseReviewCount,
    falseReviewRate: ratio(falseReviewCount, reviewedCases.filter((item) => item.rawDecision === "WARN").length),
    falseBlockCount,
    falseBlockRate: ratio(falseBlockCount, reviewedCases.filter((item) => item.rawDecision === "FAIL").length),
    safeAutoPassPrecision: ratio(safePredictedSafe, predictedSafeReviewed.length),
    safeAutoPassRecall: ratio(safePredictedSafe, totalSafeReviewed),
    highSeverityMissCount,
    manualReviewRate: ratio(candidateCases.length, cases.length),
    narrativeMismatchCount,
    unitScaleAmbiguityCount,
  };
}

function buildDistributionByTag(
  cases: CalibrationCase[],
  policy: AnnualReportUnifiedConfidenceCalibrationPolicy,
) {
  const byTag = new Map<
    string,
    {
      before: AnnualReportUnifiedConfidenceCalibrationDistribution;
      after: AnnualReportUnifiedConfidenceCalibrationDistribution;
      reviewedCount: number;
      unsafeReviewedCount: number;
    }
  >();

  for (const item of cases) {
    for (const tag of item.tags) {
      const bucket = byTag.get(tag) ?? {
        before: emptyDistribution(),
        after: emptyDistribution(),
        reviewedCount: 0,
        unsafeReviewedCount: 0,
      };
      recordDistribution(bucket.before, item.rawDecision);
      recordDistribution(
        bucket.after,
        buildCalibratedUnifiedConfidenceCaseDecision({
          rawDecision: item.rawDecision,
          candidate: item.candidate,
          tags: item.tags,
          policy,
        }).decision,
      );
      if (item.reviewed) {
        bucket.reviewedCount += 1;
      }
      if (item.unsafeReviewed) {
        bucket.unsafeReviewedCount += 1;
      }
      byTag.set(tag, bucket);
    }
  }

  return Array.from(byTag.entries())
    .map(([tag, bucket]) => ({ tag, ...bucket }))
    .sort((left, right) => right.reviewedCount - left.reviewedCount || left.tag.localeCompare(right.tag));
}

function buildDistributionByIssueClass(
  cases: CalibrationCase[],
  policy: AnnualReportUnifiedConfidenceCalibrationPolicy,
) {
  const byIssueClass = new Map<
    string,
    {
      before: AnnualReportUnifiedConfidenceCalibrationDistribution;
      after: AnnualReportUnifiedConfidenceCalibrationDistribution;
      reviewedCount: number;
      unsafeReviewedCount: number;
    }
  >();

  for (const item of cases) {
    if (!item.candidate) {
      continue;
    }

    for (const issueClass of item.candidate.issueClasses) {
      const bucket = byIssueClass.get(issueClass) ?? {
        before: emptyDistribution(),
        after: emptyDistribution(),
        reviewedCount: 0,
        unsafeReviewedCount: 0,
      };
      recordDistribution(bucket.before, item.rawDecision);
      recordDistribution(
        bucket.after,
        buildCalibratedUnifiedConfidenceCaseDecision({
          rawDecision: item.rawDecision,
          candidate: item.candidate,
          tags: item.tags,
          policy,
        }).decision,
      );
      if (item.reviewed) {
        bucket.reviewedCount += 1;
      }
      if (item.unsafeReviewed) {
        bucket.unsafeReviewedCount += 1;
      }
      byIssueClass.set(issueClass, bucket);
    }
  }

  return Array.from(byIssueClass.entries())
    .map(([issueClass, bucket]) => ({ issueClass, ...bucket }))
    .sort(
      (left, right) => right.reviewedCount - left.reviewedCount || left.issueClass.localeCompare(right.issueClass),
    );
}

function isMismatchMatch(value: string | null) {
  return (
    value === "CONFLICTING_VALUES" ||
    value === "MISSING_IN_LEGACY" ||
    value === "MISSING_IN_UNIFIED" ||
    value === "LOW_CONFIDENCE_AMBIGUOUS"
  );
}

function buildCanonicalKeyMismatchRates(cases: CalibrationCase[]) {
  return KEY_FIELDS.map((canonicalKey) => {
    const reviewedWithKey = cases.filter(
      (item) =>
        item.reviewed &&
        item.candidate?.financialComparisons.some((comparison) => comparison.canonicalKey === canonicalKey),
    );
    const mismatchCount = reviewedWithKey.filter((item) =>
      item.candidate!.financialComparisons.some(
        (comparison) =>
          comparison.canonicalKey === canonicalKey && isMismatchMatch(comparison.match),
      ),
    ).length;

    return {
      canonicalKey,
      reviewedCount: reviewedWithKey.length,
      mismatchCount,
      mismatchRate: ratio(mismatchCount, reviewedWithKey.length),
    };
  });
}

function toCaseExample(
  item: CalibrationCase,
  policy: AnnualReportUnifiedConfidenceCalibrationPolicy,
): AnnualReportUnifiedConfidenceCalibrationCaseExample {
  return {
    filingId: item.filingId,
    companyName: item.companyName,
    orgNumber: item.orgNumber,
    accountingYear: item.accountingYear,
    rawDecision: item.rawDecision,
    calibratedDecision: buildCalibratedUnifiedConfidenceCaseDecision({
      rawDecision: item.rawDecision,
      candidate: item.candidate,
      tags: item.tags,
      policy,
    }).decision,
    severity: item.candidate?.severity ?? null,
    reviewDecision: item.reviewDecision,
    topReason:
      item.candidate?.reviewReasons[0] ??
      (item.unsafeReviewed ? "Manual review marked the filing as unsafe." : "No candidate reason captured."),
    issueClasses: item.candidate?.issueClasses ?? [],
    tags: item.tags,
  };
}

function buildRecommendations(
  report: {
    metrics: AnnualReportUnifiedConfidenceCalibrationMetric;
    distributions: {
      byIssueClass: Array<{ issueClass: string; unsafeReviewedCount: number }>;
      canonicalKeyMismatchRates: Array<{ canonicalKey: string; mismatchCount: number }>;
    };
  },
) {
  const topIssueClass = report.distributions.byIssueClass
    .filter((item) => item.unsafeReviewedCount > 0)
    .sort((left, right) => right.unsafeReviewedCount - left.unsafeReviewedCount || left.issueClass.localeCompare(right.issueClass))[0];

  const topKey = report.distributions.canonicalKeyMismatchRates
    .filter((item) => item.mismatchCount > 0)
    .sort((left, right) => right.mismatchCount - left.mismatchCount || left.canonicalKey.localeCompare(right.canonicalKey))[0];

  return {
    pr78FailureTaxonomy: [
      topIssueClass
        ? `Start PR78 with "${topIssueClass.issueClass}" because it has the most reviewed unsafe cases in calibration data.`
        : "Calibration did not surface a dominant reviewed unsafe issue class yet.",
      report.metrics.unitScaleAmbiguityCount > 0
        ? "Keep unit-scale ambiguity as a first-class failure category in PR78."
        : "Unit-scale ambiguity was not a dominant reviewed pattern in this sample.",
    ],
    pr79ExtractionFixes: [
      topKey
        ? `Prioritise PR79 fixes for canonical key "${topKey.canonicalKey}" because it mismatched most often in reviewed cases.`
        : "Calibration did not surface a single dominant canonical key mismatch yet.",
      report.metrics.highSeverityMissCount > 0
        ? "Fix the patterns behind reviewed HIGH-severity misses before any broader rollout decision."
        : "No reviewed HIGH-severity PASS misses were found in this calibration sample.",
    ],
  };
}

function calibrationStatus(
  metrics: AnnualReportUnifiedConfidenceCalibrationMetric,
  adjustments: AnnualReportUnifiedConfidenceCalibrationThresholdAdjustment[],
): CalibrationStatus {
  if (metrics.totalReviewedCases === 0) {
    return "INSUFFICIENT_EVIDENCE";
  }
  if (metrics.highSeverityMissCount > 0 || metrics.falsePassCount > 0) {
    return "REVIEW_REQUIRED";
  }
  if (adjustments.some((item) => item.direction === "TIGHTEN")) {
    return "TIGHTENED";
  }
  return "STABLE";
}

function renderDistribution(label: string, distribution: AnnualReportUnifiedConfidenceCalibrationDistribution) {
  return `${label}: PASS=${distribution.PASS}, WARN=${distribution.WARN}, FAIL=${distribution.FAIL}, INSUFFICIENT_DATA=${distribution.INSUFFICIENT_DATA}`;
}

function defaultOutputPaths(runId: string | null) {
  const stem = runId ?? "latest";
  return {
    jsonPath: path.join(CALIBRATION_OUTPUT_DIR, `${stem}.json`),
    markdownPath: path.join(CALIBRATION_OUTPUT_DIR, `${stem}.md`),
  };
}

export async function buildUnifiedConfidenceThresholdCalibrationReport(
  input: AnnualReportUnifiedConfidenceCalibrationInput = {},
  deps: AnnualReportUnifiedConfidenceCalibrationServiceDeps = {},
): Promise<AnnualReportUnifiedConfidenceCalibrationReport> {
  const now = deps.now?.() ?? new Date();
  const buildManualReviewRound = deps.buildManualReviewRound ?? buildAnnualReportManualReviewRound;
  const readManualReviewRound = deps.readLatestManualReviewRound ?? readLatestAnnualReportManualReviewRound;
  const readShadowRunByRunId = deps.readShadowRunByRunId ?? ((runId: string) => readShadowRunByRunIdFromDisk(runId, deps));
  const readLatestShadowRun = deps.readLatestShadowRun ?? (() => readLatestShadowRunFromDisk(deps));

  const round =
    input.runId !== undefined
      ? await buildManualReviewRound({ runId: input.runId })
      : await readManualReviewRound();
  const shadowRun =
    input.runId !== undefined
      ? await readShadowRunByRunId(input.runId)
      : await readLatestShadowRun();

  const candidateByFilingId = new Map<string, AnnualReportManualReviewCandidate>();
  for (const candidate of round?.candidates ?? []) {
    candidateByFilingId.set(candidate.filingId, candidate);
  }

  const cases = (shadowRun?.batch.cases ?? [])
    .map((shadowCase) => toCalibrationCase(shadowCase, candidateByFilingId.get(shadowCase.filingId) ?? null))
    .filter((item) => input.includeUnreviewed || item.reviewed);

  const policy = deriveCalibrationPolicy(cases);
  const beforeDistribution = distributionFromCases(cases, (item) => item.rawDecision);
  const afterDistribution = distributionFromCases(cases, (item) =>
    buildCalibratedUnifiedConfidenceCaseDecision({
      rawDecision: item.rawDecision,
      candidate: item.candidate,
      tags: item.tags,
      policy,
    }).decision,
  );

  const metrics = buildMetrics(cases, policy);
  const byTag = buildDistributionByTag(cases, policy);
  const byIssueClass = buildDistributionByIssueClass(cases, policy);
  const canonicalKeyMismatchRates = buildCanonicalKeyMismatchRates(cases);
  const thresholdAdjustments = buildThresholdAdjustments(policy);
  const status = calibrationStatus(metrics, thresholdAdjustments);
  const recommendations = buildRecommendations({
    metrics,
    distributions: {
      byIssueClass,
      canonicalKeyMismatchRates,
    },
  });

  const affectedExamples = cases
    .filter((item) => {
      const calibrated = buildCalibratedUnifiedConfidenceCaseDecision({
        rawDecision: item.rawDecision,
        candidate: item.candidate,
        tags: item.tags,
        policy,
      }).decision;
      return calibrated !== item.rawDecision;
    })
    .slice(0, 10)
    .map((item) => toCaseExample(item, policy));

  const remainingHighRiskCases = cases
    .filter(
      (item) =>
        item.candidate?.severity === "HIGH" ||
        item.unsafeReviewed ||
        (item.candidate?.issueClasses.some((issueClass) => FAIL_CLASS_SET.has(issueClass)) ?? false),
    )
    .slice(0, 10)
    .map((item) => toCaseExample(item, policy));

  const output = defaultOutputPaths(shadowRun?.runId ?? round?.reviewRoundId ?? input.runId ?? null);

  return {
    version: "annual-report-unified-confidence-calibration-v2",
    generatedAt: now.toISOString(),
    input: {
      runId: input.runId ?? round?.reviewRoundId ?? shadowRun?.runId ?? null,
      includeUnreviewed: input.includeUnreviewed ?? false,
      generatedBy: input.generatedBy ?? null,
    },
    sourceRun: {
      runId: shadowRun?.runId ?? round?.sourceRun.runId ?? null,
      generatedAt: shadowRun?.generatedAt ?? round?.sourceRun.generatedAt ?? null,
      gitCommitSha: shadowRun?.gitCommitSha ?? round?.sourceRun.gitCommitSha ?? null,
      manifestName: shadowRun?.manifest.name ?? round?.sourceRun.manifestName ?? null,
    },
    evidenceUsed: {
      totalGoldSetFilings: shadowRun?.batch.cases.length ?? 0,
      totalManualReviewCandidates: round?.summary.reviewCandidateCount ?? 0,
      reviewedCandidates: round?.summary.reviewedCount ?? 0,
      pendingCandidates: round?.summary.pendingCount ?? 0,
      blockedCandidates: round?.summary.blockedCount ?? 0,
    },
    thresholdBehavior: {
      before: {
        gateConfig: DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
        policy: baselinePolicy(),
        distribution: beforeDistribution,
      },
      after: {
        gateConfig: {
          ...DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
          minComparisonMatchRateForPass: policy.minComparisonMatchRateForPass,
          majorMismatchDeviationThreshold: policy.majorMismatchDeviationThreshold,
        },
        policy,
        distribution: afterDistribution,
        status,
      },
    },
    metrics,
    distributions: {
      byTag,
      byIssueClass,
      canonicalKeyMismatchRates,
    },
    thresholdAdjustments,
    remainingHighRiskCases,
    affectedExamples,
    recommendations,
    output,
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
  };
}

export function renderUnifiedConfidenceThresholdCalibrationMarkdown(
  report: AnnualReportUnifiedConfidenceCalibrationReport,
) {
  const lines = [
    "# Unified confidence calibration",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Source run: ${report.sourceRun.runId ?? "unknown"}`,
    `- Manual review candidates: ${report.evidenceUsed.totalManualReviewCandidates}`,
    `- Reviewed candidates: ${report.evidenceUsed.reviewedCandidates}`,
    `- Calibration status: ${report.thresholdBehavior.after.status}`,
    "",
    "## Metrics",
    "",
    `- Total reviewed cases: ${report.metrics.totalReviewedCases}`,
    `- Auto-pass candidates: ${report.metrics.autoPassCandidates}`,
    `- Review candidates: ${report.metrics.reviewCandidates}`,
    `- Blocked candidates: ${report.metrics.blockedCandidates}`,
    `- False pass count: ${report.metrics.falsePassCount}`,
    `- False review count: ${report.metrics.falseReviewCount}`,
    `- False block count: ${report.metrics.falseBlockCount}`,
    `- High severity miss count: ${report.metrics.highSeverityMissCount}`,
    `- Manual review rate: ${report.metrics.manualReviewRate === null ? "unknown" : `${(report.metrics.manualReviewRate * 100).toFixed(0)}%`}`,
    "",
    "## Threshold behavior",
    "",
    `- ${renderDistribution("Before", report.thresholdBehavior.before.distribution)}`,
    `- ${renderDistribution("After", report.thresholdBehavior.after.distribution)}`,
    "",
    "## Adjustments",
    "",
    ...report.thresholdAdjustments.map(
      (item) =>
        `- ${item.key}: ${item.direction} (${item.currentValue} -> ${item.proposedValue}) — ${item.rationale}`,
    ),
    "",
    "## PR78 recommendations",
    "",
    ...report.recommendations.pr78FailureTaxonomy.map((item) => `- ${item}`),
    "",
    "## PR79 recommendations",
    "",
    ...report.recommendations.pr79ExtractionFixes.map((item) => `- ${item}`),
    "",
  ];

  if (report.affectedExamples.length > 0) {
    lines.push("## Affected examples", "");
    for (const example of report.affectedExamples) {
      lines.push(
        `- ${example.companyName ?? example.filingId} (${example.orgNumber ?? "ukjent org.nr"})`,
        `  - Filing: ${example.filingId}`,
        `  - Raw -> calibrated: ${example.rawDecision} -> ${example.calibratedDecision}`,
        `  - Review decision: ${example.reviewDecision ?? "none"}`,
        `  - Top reason: ${example.topReason}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function persistUnifiedConfidenceThresholdCalibrationArtifacts(
  report: AnnualReportUnifiedConfidenceCalibrationReport,
  deps: AnnualReportUnifiedConfidenceCalibrationServiceDeps = {},
) {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const markdown = renderUnifiedConfidenceThresholdCalibrationMarkdown(report);
  const json = JSON.stringify(report, null, 2);

  await mkdir(CALIBRATION_OUTPUT_DIR, { recursive: true });
  await writeFile(report.output.jsonPath, json, "utf8");
  await writeFile(report.output.markdownPath, markdown, "utf8");
  await writeFile(path.join(CALIBRATION_OUTPUT_DIR, "latest.json"), json, "utf8");
  await writeFile(path.join(CALIBRATION_OUTPUT_DIR, "latest.md"), markdown, "utf8");
}

export async function readLatestUnifiedConfidenceThresholdCalibrationReport(
  deps: AnnualReportUnifiedConfidenceCalibrationServiceDeps = {},
) {
  const readFile = deps.readFile ?? fs.readFile;
  try {
    const raw = await readFile(path.join(CALIBRATION_OUTPUT_DIR, "latest.json"), "utf8");
    const parsed = JSON.parse(raw) as AnnualReportUnifiedConfidenceCalibrationReport;
    return parsed.version === "annual-report-unified-confidence-calibration-v2" ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export const CURRENT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG =
  DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG;
