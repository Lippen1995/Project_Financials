/**
 * PDF Decision Engine v1.
 *
 * Pure, deterministic routing and diagnostics over preflight, section,
 * page-hint, and validation signals. No I/O happens here.
 */

import type { FinancialExtractionPageHints } from "@/integrations/brreg/annual-report-financials/financial-extraction-page-hints";
import type { AnnualReportDocument } from "@/integrations/brreg/annual-report-financials/document-model";
import type { PreflightResult } from "@/integrations/brreg/annual-report-financials/types";
import type { OpenDataLoaderResolvedConfig } from "@/server/document-understanding/opendataloader-types";
import {
  clampPdfDecisionConfidence,
  normalizePdfDecisionRuleConfig,
  type PdfDecisionRuleConfig,
  type PdfDecisionRuleConfigOverrides,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";
import type {
  JsonSafePdfDecisionArtifactPayload,
  PdfDecisionEngineOutput,
  PdfDecisionPageHints,
  PdfDecisionPhase,
  PdfDecisionRiskLevel,
  PdfDecisionRoute,
  PdfDecisionValidationSummary,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-types";

export const PDF_DECISION_ENGINE_VERSION = "pdf-decision-engine-v1";

const FINANCIAL_SECTION_KINDS = new Set([
  "INCOME_STATEMENT",
  "BALANCE",
  "BALANCE_SHEET",
  "BALANCE_ASSETS",
  "BALANCE_EQUITY_LIABILITIES",
  "CASH_FLOW",
]);

const BALANCE_SECTION_KINDS = new Set([
  "BALANCE",
  "BALANCE_SHEET",
  "BALANCE_ASSETS",
  "BALANCE_EQUITY_LIABILITIES",
]);

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sortedNumbers(values: Iterable<number>) {
  return Array.from(new Set(Array.from(values).filter(Number.isFinite))).sort(
    (left, right) => left - right,
  );
}

function buildPageHints(
  hints: FinancialExtractionPageHints | null | undefined,
): PdfDecisionPageHints {
  return {
    hasReliableHints: hints?.hasReliableHints ?? false,
    includePages: sortedNumbers(hints?.includePages ?? []),
    excludePages: sortedNumbers(hints?.excludePages ?? []),
    preferredIncomeStatementPages: sortedNumbers(
      hints?.preferredIncomeStatementPages ?? [],
    ),
    preferredBalancePages: sortedNumbers(hints?.preferredBalancePages ?? []),
    notePages: sortedNumbers(hints?.notePages ?? []),
    reasons: hints?.reasons ?? [],
  };
}

function resolveStructuredDocument(input: {
  preflight: PreflightResult;
  structuredDocument?: AnnualReportDocument | null;
}) {
  return input.structuredDocument ?? input.preflight.structuredDocument ?? null;
}

function computeRisk(input: {
  hasReliableTextLayer: boolean;
  qualityRisk?: string | null;
  hasFinancialSections: boolean;
  hasWeakHints: boolean;
  validationSummary?: PdfDecisionValidationSummary | null;
  ruleConfig: PdfDecisionRuleConfig;
}): PdfDecisionRiskLevel {
  if (input.validationSummary?.hasBlockingErrors) return "HIGH";
  if (!input.hasReliableTextLayer) return "HIGH";
  if (
    input.qualityRisk &&
    input.ruleConfig.risk.highRiskQualityRiskValues.includes(input.qualityRisk)
  ) {
    return "HIGH";
  }
  if (!input.hasFinancialSections) return "HIGH";
  if (
    (input.qualityRisk &&
      input.ruleConfig.risk.mediumRiskQualityRiskValues.includes(input.qualityRisk)) ||
    input.hasWeakHints
  ) {
    return "MEDIUM";
  }
  return "LOW";
}

function chooseRoute(input: {
  hasReliableTextLayer: boolean;
  odlEnabled: boolean;
  riskLevel: PdfDecisionRiskLevel;
  manualReviewRequired: boolean;
}): PdfDecisionRoute {
  if (input.manualReviewRequired) return "MANUAL_REVIEW";
  if (input.odlEnabled) {
    return input.hasReliableTextLayer ? "OPENDATALOADER_LOCAL" : "OPENDATALOADER_HYBRID";
  }
  if (!input.hasReliableTextLayer) return "FORCE_OCR";
  return "TEXT_LAYER";
}

function computeConfidence(input: {
  hasReliableTextLayer: boolean;
  qualityRisk?: string | null;
  hasIncomeSection: boolean;
  hasBalanceSection: boolean;
  hasFinancialSections: boolean;
  hasReliableHints: boolean;
  hasPageHints: boolean;
  hasNarratives: boolean;
  validationSummary?: PdfDecisionValidationSummary | null;
  highRiskFallbackUnavailable: boolean;
  parserRiskReasonCount: number;
  ruleConfig: PdfDecisionRuleConfig;
}) {
  const { bonuses, penalties } = input.ruleConfig.confidence;
  let score = input.ruleConfig.confidence.base;

  if (!input.hasReliableTextLayer) score -= penalties.noReliableTextLayer;
  if (input.qualityRisk === "HIGH") score -= penalties.highQualityRisk;
  else if (input.qualityRisk === "MEDIUM") score -= penalties.mediumQualityRisk;
  if (!input.hasIncomeSection) score -= penalties.missingIncomeStatement;
  if (!input.hasBalanceSection) score -= penalties.missingBalance;
  if (!input.hasFinancialSections) score -= penalties.missingFinancialSections;
  if (!input.hasReliableHints) {
    score -= input.hasPageHints ? penalties.weakPageHints * 0.8 : penalties.weakPageHints;
  }
  if (input.validationSummary?.hasBlockingErrors) score -= penalties.validationBlockingErrors;
  if (input.highRiskFallbackUnavailable) score -= penalties.highRiskWithoutOcrOrOdl;
  if (input.parserRiskReasonCount > 0) score -= penalties.parserRiskReasons;

  if (input.hasReliableHints) score += bonuses.reliablePageHints;
  if (input.hasIncomeSection && input.hasBalanceSection) {
    score += bonuses.incomeAndBalanceDetected;
  }
  if (input.hasNarratives) score += bonuses.boardOrAuditorNarrativeDetected;
  if (input.validationSummary?.validationScore != null) {
    score +=
      (input.validationSummary.validationScore - 0.5) *
      bonuses.postValidationDecision;
  }

  return clampPdfDecisionConfidence(score, input.ruleConfig);
}

export function runPdfDecisionEngine(
  input: {
    preflight: PreflightResult;
    structuredDocument?: AnnualReportDocument | null;
    pageHints?: FinancialExtractionPageHints | null;
    odlConfig?: Pick<OpenDataLoaderResolvedConfig, "enabled" | "mode"> | null;
    validationSummary?: PdfDecisionValidationSummary | null;
    blockingRuleCodes?: string[];
  },
  options?: { ruleConfig?: PdfDecisionRuleConfigOverrides | PdfDecisionRuleConfig },
): PdfDecisionEngineOutput {
  const ruleConfig = normalizePdfDecisionRuleConfig(options?.ruleConfig);
  const structuredDocument = resolveStructuredDocument(input);
  const diagnostics = input.preflight.diagnostics ?? structuredDocument?.diagnostics ?? null;
  const sections = structuredDocument?.sections ?? [];
  const sectionKinds = sections.map((section) => section.kind);
  const pageHints = buildPageHints(input.pageHints);
  const validationSummary =
    input.validationSummary ??
    (input.blockingRuleCodes
      ? {
          hasBlockingErrors: input.blockingRuleCodes.length > 0,
          blockingRuleCodes: input.blockingRuleCodes,
          warningRuleCodes: [],
        }
      : null);

  const hasIncomeSection = sectionKinds.includes("INCOME_STATEMENT");
  const hasBalanceSection = sectionKinds.some((kind) => BALANCE_SECTION_KINDS.has(kind));
  const hasFinancialSections = sectionKinds.some((kind) => FINANCIAL_SECTION_KINDS.has(kind));
  const hasBoardReport = sectionKinds.includes("BOARD_REPORT");
  const hasAuditorReport = sectionKinds.includes("AUDITOR_REPORT");
  const hasNotes = sectionKinds.includes("NOTES");
  const hasNarratives = hasBoardReport || hasAuditorReport;
  const hasPageHints =
    pageHints.includePages.length > 0 ||
    pageHints.excludePages.length > 0 ||
    pageHints.preferredIncomeStatementPages.length > 0 ||
    pageHints.preferredBalancePages.length > 0 ||
    pageHints.notePages.length > 0;
  const hasFinancialPageHints =
    pageHints.includePages.length > 0 ||
    pageHints.preferredIncomeStatementPages.length > 0 ||
    pageHints.preferredBalancePages.length > 0;

  const qualityRisk = diagnostics?.qualityRisk ?? null;
  const missingCoreSections = uniqueStrings(
    (diagnostics?.missingExpectedSections ?? []).filter((kind) =>
      ["INCOME_STATEMENT", "BALANCE", "BALANCE_SHEET", "BALANCE_ASSETS", "BALANCE_EQUITY_LIABILITIES"].includes(
        kind,
      ),
    ),
  );
  const parserRiskReasons = diagnostics?.parserRiskReasons ?? [];
  const extractionWarnings = diagnostics?.extractionWarnings ?? [];
  const odlEnabled = input.odlConfig?.enabled ?? false;
  const highRiskFallbackUnavailable =
    !odlEnabled && !input.preflight.hasReliableTextLayer && qualityRisk === "HIGH";

  const reasons: string[] = [];
  const manualReviewReasons: string[] = [];

  if (input.preflight.hasReliableTextLayer) {
    reasons.push("Reliable embedded text layer detected");
  } else {
    reasons.push("No reliable embedded text layer detected");
  }
  if (qualityRisk) reasons.push(`Document quality risk is ${qualityRisk}`);
  if (hasFinancialSections) reasons.push("Financial statement sections detected");
  if (pageHints.hasReliableHints) reasons.push("Reliable financial page hints available");
  if (hasPageHints && !pageHints.hasReliableHints) {
    reasons.push("Page hints are weak or advisory only; full text extraction recommended");
  }
  if (validationSummary?.hasBlockingErrors) {
    reasons.push("Blocking validation errors detected");
    manualReviewReasons.push(
      `Blocking validation errors: ${validationSummary.blockingRuleCodes.join(", ")}`,
    );
  }
  if (!hasFinancialSections) {
    manualReviewReasons.push("No financial statement sections detected in the document");
  }
  if (hasNarratives && !hasFinancialSections) {
    manualReviewReasons.push(
      "Document contains board/auditor narratives but no financial statement sections",
    );
  }
  if (qualityRisk === "HIGH") {
    manualReviewReasons.push(
      parserRiskReasons.length > 0
        ? `High document quality risk detected: ${parserRiskReasons.join("; ")}`
        : "High document quality risk detected",
    );
  }
  if (missingCoreSections.length > 0) {
    manualReviewReasons.push(`Expected financial sections missing: ${missingCoreSections.join(", ")}`);
  }
  if (highRiskFallbackUnavailable) {
    manualReviewReasons.push(
      "High-risk document has no reliable text layer and OpenDataLoader is unavailable",
    );
  }

  const manualReviewRequired =
    validationSummary?.hasBlockingErrors === true || !hasFinancialSections;
  const riskLevel = computeRisk({
    hasReliableTextLayer: input.preflight.hasReliableTextLayer,
    qualityRisk,
    hasFinancialSections,
    hasWeakHints: hasPageHints && !pageHints.hasReliableHints,
    validationSummary,
    ruleConfig,
  });
  const route = chooseRoute({
    hasReliableTextLayer: input.preflight.hasReliableTextLayer,
    odlEnabled,
    riskLevel,
    manualReviewRequired,
  });
  const confidenceScore = computeConfidence({
    hasReliableTextLayer: input.preflight.hasReliableTextLayer,
    qualityRisk,
    hasIncomeSection,
    hasBalanceSection,
    hasFinancialSections,
    hasReliableHints: pageHints.hasReliableHints,
    hasPageHints,
    hasNarratives,
    validationSummary,
    highRiskFallbackUnavailable,
    parserRiskReasonCount: parserRiskReasons.length,
    ruleConfig,
  });

  if (route === "OPENDATALOADER_HYBRID") {
    reasons.push("OpenDataLoader hybrid processing selected: text layer not reliable");
  } else if (route === "OPENDATALOADER_LOCAL") {
    reasons.push("OpenDataLoader local processing selected");
  }

  if (reasons.length === 0) {
    reasons.push("Insufficient signals; conservative decision produced");
  }

  return {
    version: PDF_DECISION_ENGINE_VERSION,
    ruleConfigVersion: ruleConfig.version,
    route,
    riskLevel,
    confidenceScore,
    reasons: uniqueStrings(reasons),
    manualReviewReasons: uniqueStrings(manualReviewReasons),
    enabledExtractors: {
      financialFacts:
        route !== "MANUAL_REVIEW" &&
        (hasFinancialSections || hasFinancialPageHints || input.preflight.hasReliableTextLayer),
      boardReport: hasBoardReport,
      auditorReport: hasAuditorReport,
      notes: hasNotes,
    },
    pageHints,
    diagnostics: {
      qualityRisk: qualityRisk ?? undefined,
      ruleConfigVersion: ruleConfig.version,
      recommendedRouteHint:
        diagnostics?.recommendedRouteHint ?? input.preflight.recommendedRouteHint ?? undefined,
      parserRiskReasons,
      extractionWarnings,
      missingCoreSections,
      detectedSections: sections.map((section) => ({
        kind: section.kind,
        startPage: section.startPage,
        endPage: section.endPage,
        confidenceScore: clampPdfDecisionConfidence(section.confidenceScore, ruleConfig),
      })),
    },
  };
}

export function buildPdfDecisionArtifactPayload(input: {
  decision: PdfDecisionEngineOutput;
  orgNumber?: string;
  fiscalYear?: number;
  filingId?: string;
  extractionRunId?: string | null;
  phase: PdfDecisionPhase;
  hasPreflight: boolean;
  hasStructuredDocument: boolean;
  hasPageHints: boolean;
  hasValidationSummary: boolean;
  openDataLoaderEnabled: boolean;
}): JsonSafePdfDecisionArtifactPayload {
  const inputSummary: JsonSafePdfDecisionArtifactPayload["inputSummary"] = {
    hasPreflight: input.hasPreflight,
    hasStructuredDocument: input.hasStructuredDocument,
    hasPageHints: input.hasPageHints,
    hasValidationSummary: input.hasValidationSummary,
    openDataLoaderEnabled: input.openDataLoaderEnabled,
  };
  if (input.orgNumber !== undefined) inputSummary.orgNumber = input.orgNumber;
  if (input.fiscalYear !== undefined) inputSummary.fiscalYear = input.fiscalYear;
  if (input.filingId !== undefined) inputSummary.filingId = input.filingId;
  if (input.extractionRunId !== undefined) {
    inputSummary.extractionRunId = input.extractionRunId;
  }

  return {
    version: PDF_DECISION_ENGINE_VERSION,
    phase: input.phase,
    decision: input.decision,
    inputSummary,
    createdAt: new Date().toISOString(),
    source: "annual-report-financials-service",
  };
}

