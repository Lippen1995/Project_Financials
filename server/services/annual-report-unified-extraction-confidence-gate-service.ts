/**
 * Unified Extraction Confidence Gate Service
 *
 * Evaluates the quality of a unified extraction run (financial + narrative)
 * against a configurable set of checks. Produces a structured gate report
 * with per-check verdicts (PASS / WARN / FAIL / INSUFFICIENT_DATA) and an
 * overall gate verdict.
 *
 * Design principles:
 * - No production routing, fact, or publish changes.
 * - All outputs are shadow-only (canUseForProductionRouting always false).
 * - Purely computational; no DB access.
 * - All check thresholds are configurable.
 * - Checks degrade gracefully to INSUFFICIENT_DATA when inputs are absent.
 */

import type {
  UnifiedFinancialStatementExtractionResult,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type {
  UnifiedNarrativeExtractionResult,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import type {
  AnnualReportLegacyVsUnifiedComparisonReport,
  FinancialFactMatchKind,
} from "@/server/services/annual-report-legacy-vs-unified-comparison-service";

// ── Version ────────────────────────────────────────────────────────────────────

export type UnifiedExtractionConfidenceGateVersion =
  "unified-extraction-confidence-gate-v1";
export const UNIFIED_EXTRACTION_CONFIDENCE_GATE_VERSION: UnifiedExtractionConfidenceGateVersion =
  "unified-extraction-confidence-gate-v1";

// ── Check codes ────────────────────────────────────────────────────────────────

/**
 * All 13 check codes evaluated by the gate.
 *
 * Financial coverage checks (rely on UnifiedFinancialStatementExtractionResult):
 *   FINANCIAL_EXTRACTION_PRESENT — at least one financial line item was extracted
 *   UNIT_SCALE_RESOLVED         — detected unit scale is not UNKNOWN
 *   INCOME_STATEMENT_COVERAGE   — income statement line items found
 *   BALANCE_SHEET_COVERAGE      — balance sheet line items found
 *   REVENUE_FOUND               — canonical key "revenue" found
 *   NET_INCOME_FOUND            — canonical key "net_income" found
 *   TOTAL_ASSETS_FOUND          — canonical key "total_assets" found
 *   CANONICAL_KEY_COVERAGE      — fraction of canonical keys mapped >= threshold
 *
 * Narrative coverage checks (rely on UnifiedNarrativeExtractionResult):
 *   NARRATIVE_EXTRACTION_PRESENT — at least one narrative section was found
 *   BOARD_REPORT_FOUND           — BOARD_REPORT narrative section present
 *   AUDITOR_REPORT_FOUND         — AUDITOR_REPORT or AUDITOR_OPINION section present
 *
 * Comparison checks (rely on AnnualReportLegacyVsUnifiedComparisonReport):
 *   COMPARISON_MATCH_RATE        — fraction of exact+scaled matches >= threshold
 *   COMPARISON_NO_MAJOR_MISMATCHES — no MISMATCH facts with large relative deviation
 *
 * Safety check (always evaluated):
 *   SAFETY_FLAGS_CLEAN           — all safety flags are false (invariant check)
 */
export type UnifiedExtractionConfidenceGateCheckCode =
  | "FINANCIAL_EXTRACTION_PRESENT"
  | "UNIT_SCALE_RESOLVED"
  | "INCOME_STATEMENT_COVERAGE"
  | "BALANCE_SHEET_COVERAGE"
  | "REVENUE_FOUND"
  | "NET_INCOME_FOUND"
  | "TOTAL_ASSETS_FOUND"
  | "CANONICAL_KEY_COVERAGE"
  | "NARRATIVE_EXTRACTION_PRESENT"
  | "BOARD_REPORT_FOUND"
  | "AUDITOR_REPORT_FOUND"
  | "COMPARISON_MATCH_RATE"
  | "COMPARISON_NO_MAJOR_MISMATCHES"
  | "SAFETY_FLAGS_CLEAN";

export type UnifiedExtractionGateVerdict =
  | "PASS"
  | "WARN"
  | "FAIL"
  | "INSUFFICIENT_DATA";

export type UnifiedExtractionGateOverallVerdict =
  | "PASS"
  | "WARN"
  | "FAIL"
  | "INSUFFICIENT_DATA";

// ── Config ─────────────────────────────────────────────────────────────────────

export type UnifiedExtractionConfidenceGateConfig = {
  /**
   * Minimum fraction of detected canonical keys to be mapped for CANONICAL_KEY_COVERAGE to PASS.
   * Default: 0.5
   */
  minCanonicalKeyCoverageForPass: number;
  /**
   * Fraction below which CANONICAL_KEY_COVERAGE becomes FAIL (vs WARN).
   * Default: 0.2
   */
  minCanonicalKeyCoverageForFail: number;

  /**
   * Minimum fraction of comparison facts matching (exact or scaled) for COMPARISON_MATCH_RATE to PASS.
   * Default: 0.8
   */
  minComparisonMatchRateForPass: number;
  /**
   * Fraction below which COMPARISON_MATCH_RATE becomes FAIL (vs WARN).
   * Default: 0.5
   */
  minComparisonMatchRateForFail: number;

  /**
   * Maximum absolute relative deviation allowed for "major mismatch" detection.
   * A comparison fact with match=MISMATCH and relativeDeviation > this threshold is flagged.
   * Default: 0.5 (50%)
   */
  majorMismatchDeviationThreshold: number;

  /**
   * Maximum number of major mismatches allowed before COMPARISON_NO_MAJOR_MISMATCHES FAILs.
   * Default: 0 (any major mismatch FAILs)
   */
  maxMajorMismatchCountForFail: number;

  /**
   * If true, narrative checks (BOARD_REPORT_FOUND, AUDITOR_REPORT_FOUND) produce FAIL on absence.
   * If false, they produce WARN.
   * Default: false (narrative absence is a warning, not a failure)
   */
  narrativeAbsenceIsFail: boolean;
};

export const DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG: UnifiedExtractionConfidenceGateConfig =
  {
    minCanonicalKeyCoverageForPass: 0.5,
    minCanonicalKeyCoverageForFail: 0.2,
    minComparisonMatchRateForPass: 0.8,
    minComparisonMatchRateForFail: 0.5,
    majorMismatchDeviationThreshold: 0.5,
    maxMajorMismatchCountForFail: 0,
    narrativeAbsenceIsFail: false,
  };

// ── Per-check result ───────────────────────────────────────────────────────────

export type UnifiedExtractionGateCheckResult = {
  checkCode: UnifiedExtractionConfidenceGateCheckCode;
  verdict: UnifiedExtractionGateVerdict;
  /** Human-readable explanation */
  message: string;
  /** Numeric evidence (e.g. count, rate) when available */
  value: number | null;
  /** Threshold used in this check, when applicable */
  threshold: number | null;
};

// ── Gate report ────────────────────────────────────────────────────────────────

export type UnifiedExtractionConfidenceGateSafety = {
  /** Always false — gate results must not influence production routing */
  canUseForProductionRouting: false;
  productionRoutingChanged: false;
  productionFactsMutated: false;
  publishAffected: false;
};

export type UnifiedExtractionConfidenceGateReport = {
  version: UnifiedExtractionConfidenceGateVersion;
  generatedAt: string;
  /** Filing/org metadata (optional) */
  meta: {
    filingId: string | null;
    orgNumber: string | null;
    fiscalYear: number | null;
  };
  safety: UnifiedExtractionConfidenceGateSafety;
  config: UnifiedExtractionConfidenceGateConfig;
  overallVerdict: UnifiedExtractionGateOverallVerdict;
  /** Number of PASS checks */
  passCount: number;
  /** Number of WARN checks */
  warnCount: number;
  /** Number of FAIL checks */
  failCount: number;
  /** Number of INSUFFICIENT_DATA checks */
  insufficientDataCount: number;
  /** Checks that caused FAIL */
  blockingChecks: UnifiedExtractionGateCheckResult[];
  /** Checks that produced WARN */
  warningChecks: UnifiedExtractionGateCheckResult[];
  /** All check results */
  checks: UnifiedExtractionGateCheckResult[];
};

// ── Input ──────────────────────────────────────────────────────────────────────

export type BuildUnifiedExtractionConfidenceGateReportInput = {
  /** Unified financial extraction result; null if not yet run */
  financial: UnifiedFinancialStatementExtractionResult | null;
  /** Unified narrative extraction result; null if not yet run */
  narrative: UnifiedNarrativeExtractionResult | null;
  /** Legacy-vs-unified comparison report; null if not yet run */
  comparison: AnnualReportLegacyVsUnifiedComparisonReport | null;
  /** Optional filing metadata */
  meta?: {
    filingId?: string | null;
    orgNumber?: string | null;
    fiscalYear?: number | null;
  };
  /** Override the default config */
  config?: Partial<UnifiedExtractionConfidenceGateConfig>;
};

// ── Check helpers ──────────────────────────────────────────────────────────────

function pass(
  checkCode: UnifiedExtractionConfidenceGateCheckCode,
  message: string,
  value: number | null = null,
  threshold: number | null = null,
): UnifiedExtractionGateCheckResult {
  return { checkCode, verdict: "PASS", message, value, threshold };
}

function warn(
  checkCode: UnifiedExtractionConfidenceGateCheckCode,
  message: string,
  value: number | null = null,
  threshold: number | null = null,
): UnifiedExtractionGateCheckResult {
  return { checkCode, verdict: "WARN", message, value, threshold };
}

function fail(
  checkCode: UnifiedExtractionConfidenceGateCheckCode,
  message: string,
  value: number | null = null,
  threshold: number | null = null,
): UnifiedExtractionGateCheckResult {
  return { checkCode, verdict: "FAIL", message, value, threshold };
}

function insufficientData(
  checkCode: UnifiedExtractionConfidenceGateCheckCode,
  message: string,
): UnifiedExtractionGateCheckResult {
  return { checkCode, verdict: "INSUFFICIENT_DATA", message, value: null, threshold: null };
}

// ── Individual check evaluators ────────────────────────────────────────────────

function checkFinancialExtractionPresent(
  financial: UnifiedFinancialStatementExtractionResult | null,
): UnifiedExtractionGateCheckResult {
  if (financial === null) {
    return insufficientData("FINANCIAL_EXTRACTION_PRESENT", "Financial extraction was not run.");
  }
  const totalItems = financial.statements.reduce((n, s) => n + s.lineItems.length, 0);
  if (totalItems === 0) {
    return fail("FINANCIAL_EXTRACTION_PRESENT", `No financial line items extracted (0 items found).`, 0);
  }
  return pass("FINANCIAL_EXTRACTION_PRESENT", `${totalItems} financial line items extracted.`, totalItems);
}

function checkUnitScaleResolved(
  financial: UnifiedFinancialStatementExtractionResult | null,
): UnifiedExtractionGateCheckResult {
  if (financial === null) {
    return insufficientData("UNIT_SCALE_RESOLVED", "Financial extraction was not run.");
  }
  const unknownCount = financial.statements.reduce(
    (n, s) => n + s.lineItems.filter((li) => li.unitScale === "UNKNOWN").length,
    0,
  );
  const totalItems = financial.statements.reduce((n, s) => n + s.lineItems.length, 0);
  if (totalItems === 0) {
    return insufficientData("UNIT_SCALE_RESOLVED", "No financial line items to evaluate unit scale.");
  }
  const unknownRate = unknownCount / totalItems;
  if (unknownRate >= 0.5) {
    return fail(
      "UNIT_SCALE_RESOLVED",
      `${unknownCount}/${totalItems} (${(unknownRate * 100).toFixed(0)}%) line items have UNKNOWN unit scale.`,
      unknownRate,
    );
  }
  if (unknownRate > 0) {
    return warn(
      "UNIT_SCALE_RESOLVED",
      `${unknownCount}/${totalItems} line items have UNKNOWN unit scale.`,
      unknownRate,
    );
  }
  return pass("UNIT_SCALE_RESOLVED", "All line items have resolved unit scale.", 0);
}

function checkStatementKindCoverage(
  financial: UnifiedFinancialStatementExtractionResult | null,
  kind: "INCOME_STATEMENT" | "BALANCE_SHEET",
  checkCode: UnifiedExtractionConfidenceGateCheckCode,
): UnifiedExtractionGateCheckResult {
  if (financial === null) {
    return insufficientData(checkCode, "Financial extraction was not run.");
  }
  const statement = financial.statements.find((s) => s.kind === kind);
  const itemCount = statement?.lineItems.length ?? 0;
  if (itemCount === 0) {
    return fail(checkCode, `No ${kind.replace("_", " ").toLowerCase()} line items found.`, 0);
  }
  return pass(checkCode, `${itemCount} ${kind.replace("_", " ").toLowerCase()} items found.`, itemCount);
}

function checkCanonicalKeyFound(
  financial: UnifiedFinancialStatementExtractionResult | null,
  canonicalKey: string,
  checkCode: UnifiedExtractionConfidenceGateCheckCode,
): UnifiedExtractionGateCheckResult {
  if (financial === null) {
    return insufficientData(checkCode, "Financial extraction was not run.");
  }
  const allItems = financial.statements.flatMap((s) => s.lineItems);
  const found = allItems.some((li) => li.canonicalKey === canonicalKey);
  if (!found) {
    return warn(checkCode, `Canonical key "${canonicalKey}" not found in extracted line items.`);
  }
  return pass(checkCode, `Canonical key "${canonicalKey}" found.`);
}

function checkCanonicalKeyCoverage(
  financial: UnifiedFinancialStatementExtractionResult | null,
  config: UnifiedExtractionConfidenceGateConfig,
): UnifiedExtractionGateCheckResult {
  if (financial === null) {
    return insufficientData("CANONICAL_KEY_COVERAGE", "Financial extraction was not run.");
  }
  const allItems = financial.statements.flatMap((s) => s.lineItems);
  if (allItems.length === 0) {
    return insufficientData("CANONICAL_KEY_COVERAGE", "No financial line items to evaluate.");
  }
  const mappedCount = allItems.filter((li) => li.canonicalKey !== null).length;
  const coverage = mappedCount / allItems.length;
  if (coverage < config.minCanonicalKeyCoverageForFail) {
    return fail(
      "CANONICAL_KEY_COVERAGE",
      `Only ${(coverage * 100).toFixed(0)}% of line items have mapped canonical keys (minimum: ${(config.minCanonicalKeyCoverageForFail * 100).toFixed(0)}% to avoid FAIL).`,
      coverage,
      config.minCanonicalKeyCoverageForFail,
    );
  }
  if (coverage < config.minCanonicalKeyCoverageForPass) {
    return warn(
      "CANONICAL_KEY_COVERAGE",
      `${(coverage * 100).toFixed(0)}% of line items have canonical keys (below PASS threshold of ${(config.minCanonicalKeyCoverageForPass * 100).toFixed(0)}%).`,
      coverage,
      config.minCanonicalKeyCoverageForPass,
    );
  }
  return pass(
    "CANONICAL_KEY_COVERAGE",
    `${(coverage * 100).toFixed(0)}% of line items have canonical keys.`,
    coverage,
    config.minCanonicalKeyCoverageForPass,
  );
}

function checkNarrativeExtractionPresent(
  narrative: UnifiedNarrativeExtractionResult | null,
): UnifiedExtractionGateCheckResult {
  if (narrative === null) {
    return insufficientData(
      "NARRATIVE_EXTRACTION_PRESENT",
      "Narrative extraction was not run.",
    );
  }
  if (narrative.sections.length === 0) {
    return warn("NARRATIVE_EXTRACTION_PRESENT", "No narrative sections found.");
  }
  return pass(
    "NARRATIVE_EXTRACTION_PRESENT",
    `${narrative.sections.length} narrative sections found.`,
    narrative.sections.length,
  );
}

function checkNarrativeSectionFound(
  narrative: UnifiedNarrativeExtractionResult | null,
  kinds: string[],
  checkCode: UnifiedExtractionConfidenceGateCheckCode,
  label: string,
  isFail: boolean,
): UnifiedExtractionGateCheckResult {
  if (narrative === null) {
    return insufficientData(checkCode, "Narrative extraction was not run.");
  }
  const found = narrative.sections.some((s) => kinds.includes(s.kind));
  if (!found) {
    const message = `${label} not found in narrative sections.`;
    return isFail ? fail(checkCode, message) : warn(checkCode, message);
  }
  return pass(checkCode, `${label} found.`);
}

function checkComparisonMatchRate(
  comparison: AnnualReportLegacyVsUnifiedComparisonReport | null,
  config: UnifiedExtractionConfidenceGateConfig,
): UnifiedExtractionGateCheckResult {
  if (comparison === null) {
    return insufficientData("COMPARISON_MATCH_RATE", "Comparison report was not run.");
  }
  const total = comparison.financialComparisons.length;
  if (total === 0) {
    return insufficientData("COMPARISON_MATCH_RATE", "No financial comparisons to evaluate.");
  }
  const goodMatches: FinancialFactMatchKind[] = ["EXACT", "SCALED"];
  const matchCount = comparison.financialComparisons.filter((c) =>
    goodMatches.includes(c.match),
  ).length;
  const matchRate = matchCount / total;
  if (matchRate < config.minComparisonMatchRateForFail) {
    return fail(
      "COMPARISON_MATCH_RATE",
      `Match rate ${(matchRate * 100).toFixed(0)}% (${matchCount}/${total}) is below FAIL threshold of ${(config.minComparisonMatchRateForFail * 100).toFixed(0)}%.`,
      matchRate,
      config.minComparisonMatchRateForFail,
    );
  }
  if (matchRate < config.minComparisonMatchRateForPass) {
    return warn(
      "COMPARISON_MATCH_RATE",
      `Match rate ${(matchRate * 100).toFixed(0)}% (${matchCount}/${total}) is below PASS threshold of ${(config.minComparisonMatchRateForPass * 100).toFixed(0)}%.`,
      matchRate,
      config.minComparisonMatchRateForPass,
    );
  }
  return pass(
    "COMPARISON_MATCH_RATE",
    `Match rate ${(matchRate * 100).toFixed(0)}% (${matchCount}/${total}).`,
    matchRate,
    config.minComparisonMatchRateForPass,
  );
}

function checkComparisonNoMajorMismatches(
  comparison: AnnualReportLegacyVsUnifiedComparisonReport | null,
  config: UnifiedExtractionConfidenceGateConfig,
): UnifiedExtractionGateCheckResult {
  if (comparison === null) {
    return insufficientData(
      "COMPARISON_NO_MAJOR_MISMATCHES",
      "Comparison report was not run.",
    );
  }
  const majorMismatches = comparison.financialComparisons.filter(
    (c) =>
      c.match === "MISMATCH" &&
      c.relativeDeviation !== null &&
      c.relativeDeviation > config.majorMismatchDeviationThreshold,
  );
  if (majorMismatches.length > config.maxMajorMismatchCountForFail) {
    return fail(
      "COMPARISON_NO_MAJOR_MISMATCHES",
      `${majorMismatches.length} major mismatches (deviation > ${(config.majorMismatchDeviationThreshold * 100).toFixed(0)}%) found.`,
      majorMismatches.length,
      config.majorMismatchDeviationThreshold,
    );
  }
  if (majorMismatches.length > 0) {
    return warn(
      "COMPARISON_NO_MAJOR_MISMATCHES",
      `${majorMismatches.length} major mismatches found (within tolerance).`,
      majorMismatches.length,
      config.majorMismatchDeviationThreshold,
    );
  }
  return pass(
    "COMPARISON_NO_MAJOR_MISMATCHES",
    "No major mismatches found.",
    0,
    config.majorMismatchDeviationThreshold,
  );
}

function checkSafetyFlagsClean(
  financial: UnifiedFinancialStatementExtractionResult | null,
  narrative: UnifiedNarrativeExtractionResult | null,
): UnifiedExtractionGateCheckResult {
  if (financial === null && narrative === null) {
    return insufficientData("SAFETY_FLAGS_CLEAN", "No inputs available to check safety flags.");
  }
  const violations: string[] = [];
  if (financial !== null) {
    if (financial.safety.canUseForProductionRouting !== false)
      violations.push("financial.safety.canUseForProductionRouting is not false");
    if (financial.safety.productionRoutingChanged !== false)
      violations.push("financial.safety.productionRoutingChanged is not false");
    if (financial.safety.productionFactsMutated !== false)
      violations.push("financial.safety.productionFactsMutated is not false");
    if (financial.safety.publishAffected !== false)
      violations.push("financial.safety.publishAffected is not false");
    if (financial.safety.shadowOnly !== true)
      violations.push("financial.safety.shadowOnly is not true");
  }
  if (narrative !== null) {
    if (narrative.safety.canUseForProductionRouting !== false)
      violations.push("narrative.safety.canUseForProductionRouting is not false");
    if (narrative.safety.productionRoutingChanged !== false)
      violations.push("narrative.safety.productionRoutingChanged is not false");
    if (narrative.safety.productionFactsMutated !== false)
      violations.push("narrative.safety.productionFactsMutated is not false");
    if (narrative.safety.publishAffected !== false)
      violations.push("narrative.safety.publishAffected is not false");
    if (narrative.safety.shadowOnly !== true)
      violations.push("narrative.safety.shadowOnly is not true");
  }
  if (violations.length > 0) {
    return fail(
      "SAFETY_FLAGS_CLEAN",
      `Safety flag violations: ${violations.join("; ")}`,
    );
  }
  return pass("SAFETY_FLAGS_CLEAN", "All safety flags are clean.");
}

// ── Overall verdict ────────────────────────────────────────────────────────────

function deriveOverallVerdict(
  checks: UnifiedExtractionGateCheckResult[],
): UnifiedExtractionGateOverallVerdict {
  if (checks.some((c) => c.verdict === "FAIL")) return "FAIL";
  if (checks.every((c) => c.verdict === "INSUFFICIENT_DATA")) return "INSUFFICIENT_DATA";
  if (checks.some((c) => c.verdict === "WARN")) return "WARN";
  return "PASS";
}

// ── Main function ──────────────────────────────────────────────────────────────

/**
 * Builds a confidence gate report for a unified extraction run.
 *
 * Evaluates all 14 checks in order and returns a structured report.
 * No exceptions are thrown — all check errors degrade gracefully to
 * INSUFFICIENT_DATA.
 *
 * Safety: outputs are shadow-only; canUseForProductionRouting is always false.
 */
export function buildUnifiedExtractionConfidenceGateReport(
  input: BuildUnifiedExtractionConfidenceGateReportInput,
): UnifiedExtractionConfidenceGateReport {
  const { financial, narrative, comparison } = input;
  const config: UnifiedExtractionConfidenceGateConfig = {
    ...DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
    ...input.config,
  };
  const meta = {
    filingId: input.meta?.filingId ?? null,
    orgNumber: input.meta?.orgNumber ?? null,
    fiscalYear: input.meta?.fiscalYear ?? null,
  };

  const checks: UnifiedExtractionGateCheckResult[] = [
    // Financial checks
    checkFinancialExtractionPresent(financial),
    checkUnitScaleResolved(financial),
    checkStatementKindCoverage(financial, "INCOME_STATEMENT", "INCOME_STATEMENT_COVERAGE"),
    checkStatementKindCoverage(financial, "BALANCE_SHEET", "BALANCE_SHEET_COVERAGE"),
    checkCanonicalKeyFound(financial, "revenue", "REVENUE_FOUND"),
    checkCanonicalKeyFound(financial, "net_income", "NET_INCOME_FOUND"),
    checkCanonicalKeyFound(financial, "total_assets", "TOTAL_ASSETS_FOUND"),
    checkCanonicalKeyCoverage(financial, config),
    // Narrative checks
    checkNarrativeExtractionPresent(narrative),
    checkNarrativeSectionFound(
      narrative,
      ["BOARD_REPORT"],
      "BOARD_REPORT_FOUND",
      "Board report",
      config.narrativeAbsenceIsFail,
    ),
    checkNarrativeSectionFound(
      narrative,
      ["AUDITOR_REPORT", "AUDITOR_OPINION"],
      "AUDITOR_REPORT_FOUND",
      "Auditor report or opinion",
      config.narrativeAbsenceIsFail,
    ),
    // Comparison checks
    checkComparisonMatchRate(comparison, config),
    checkComparisonNoMajorMismatches(comparison, config),
    // Safety check (always last)
    checkSafetyFlagsClean(financial, narrative),
  ];

  const overallVerdict = deriveOverallVerdict(checks);
  const passCount = checks.filter((c) => c.verdict === "PASS").length;
  const warnCount = checks.filter((c) => c.verdict === "WARN").length;
  const failCount = checks.filter((c) => c.verdict === "FAIL").length;
  const insufficientDataCount = checks.filter((c) => c.verdict === "INSUFFICIENT_DATA").length;

  return {
    version: UNIFIED_EXTRACTION_CONFIDENCE_GATE_VERSION,
    generatedAt: new Date().toISOString(),
    meta,
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
    config,
    overallVerdict,
    passCount,
    warnCount,
    failCount,
    insufficientDataCount,
    blockingChecks: checks.filter((c) => c.verdict === "FAIL"),
    warningChecks: checks.filter((c) => c.verdict === "WARN"),
    checks,
  };
}

// ── Validation ─────────────────────────────────────────────────────────────────

export type UnifiedExtractionConfidenceGateValidationIssue = {
  path: string;
  message: string;
};

export function validateUnifiedExtractionConfidenceGateReport(
  report: UnifiedExtractionConfidenceGateReport,
): UnifiedExtractionConfidenceGateValidationIssue[] {
  const issues: UnifiedExtractionConfidenceGateValidationIssue[] = [];

  if (report.version !== "unified-extraction-confidence-gate-v1") {
    issues.push({ path: "version", message: `Expected "unified-extraction-confidence-gate-v1", got "${String(report.version)}"` });
  }
  if (report.safety.canUseForProductionRouting !== false) {
    issues.push({ path: "safety.canUseForProductionRouting", message: "Must be false." });
  }
  if (report.safety.productionRoutingChanged !== false) {
    issues.push({ path: "safety.productionRoutingChanged", message: "Must be false." });
  }
  if (report.safety.productionFactsMutated !== false) {
    issues.push({ path: "safety.productionFactsMutated", message: "Must be false." });
  }
  if (report.safety.publishAffected !== false) {
    issues.push({ path: "safety.publishAffected", message: "Must be false." });
  }
  if (!report.generatedAt) {
    issues.push({ path: "generatedAt", message: "Required." });
  }
  if (!["PASS", "WARN", "FAIL", "INSUFFICIENT_DATA"].includes(report.overallVerdict)) {
    issues.push({ path: "overallVerdict", message: `Invalid overall verdict "${String(report.overallVerdict)}".` });
  }
  if (report.checks.length !== 14) {
    issues.push({ path: "checks", message: `Expected 14 checks, got ${report.checks.length}.` });
  }

  return issues;
}

// ── Serialization ──────────────────────────────────────────────────────────────

export function serializeUnifiedExtractionConfidenceGateReportAsJson(
  report: UnifiedExtractionConfidenceGateReport,
): string {
  return JSON.stringify(report, null, 2);
}
