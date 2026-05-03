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

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
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
}): PdfDecisionRiskLevel {
  if (input.validationSummary?.hasBlockingErrors) return "HIGH";
  if (!input.hasReliableTextLayer) return "HIGH";
  if (input.qualityRisk === "HIGH") return "HIGH";
  if (!input.hasFinancialSections) return "HIGH";
  if (input.qualityRisk === "MEDIUM" || input.hasWeakHints) return "MEDIUM";
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
}) {
  let score = 0.85;

  if (!input.hasReliableTextLayer) score -= 0.22;
  if (input.qualityRisk === "HIGH") score -= 0.24;
  else if (input.qualityRisk === "MEDIUM") score -= 0.08;
  if (!input.hasIncomeSection) score -= 0.12;
  if (!input.hasBalanceSection) score -= 0.12;
  if (!input.hasFinancialSections) score -= 0.18;
  if (!input.hasReliableHints) score -= input.hasPageHints ? 0.08 : 0.1;
  if (input.validationSummary?.hasBlockingErrors) score -= 0.22;
  if (input.highRiskFallbackUnavailable) score -= 0.08;

  if (input.hasReliableHints) score += 0.05;
  if (input.hasIncomeSection && input.hasBalanceSection) score += 0.06;
  if (input.hasNarratives) score += 0.03;
  if (input.validationSummary?.validationScore != null) {
    score += (input.validationSummary.validationScore - 0.5) * 0.08;
  }

  return clamp01(score);
}

export function runPdfDecisionEngine(input: {
  preflight: PreflightResult;
  structuredDocument?: AnnualReportDocument | null;
  pageHints?: FinancialExtractionPageHints | null;
  odlConfig?: Pick<OpenDataLoaderResolvedConfig, "enabled" | "mode"> | null;
  validationSummary?: PdfDecisionValidationSummary | null;
  blockingRuleCodes?: string[];
}): PdfDecisionEngineOutput {
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
  });

  if (reasons.length === 0) {
    reasons.push("Insufficient signals; conservative decision produced");
  }

  return {
    version: PDF_DECISION_ENGINE_VERSION,
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
      recommendedRouteHint:
        diagnostics?.recommendedRouteHint ?? input.preflight.recommendedRouteHint ?? undefined,
      parserRiskReasons,
      extractionWarnings,
      missingCoreSections,
      detectedSections: sections.map((section) => ({
        kind: section.kind,
        startPage: section.startPage,
        endPage: section.endPage,
        confidenceScore: clamp01(section.confidenceScore),
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

