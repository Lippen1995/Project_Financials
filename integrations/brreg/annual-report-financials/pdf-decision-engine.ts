/**
 * PDF Decision Engine v1
 *
 * Lightweight, purely-functional decision engine. It takes the artefacts
 * already produced by the preflight step (PreflightResult, page hints, and
 * optional validation issues) together with the current OpenDataLoader config,
 * and produces a PdfDecisionResult that can be persisted as a
 * PDF_DECISION_JSON artifact and surfaced in the admin review UI.
 *
 * No I/O is performed here. All inputs are plain values.
 */

import type { PreflightResult } from "@/integrations/brreg/annual-report-financials/types";
import type { FinancialExtractionPageHints } from "@/integrations/brreg/annual-report-financials/financial-extraction-page-hints";
import type { OpenDataLoaderResolvedConfig } from "@/server/document-understanding/opendataloader-types";
import type {
  PdfDecisionPageHintSummary,
  PdfDecisionResult,
  PdfDecisionRisk,
  PdfDecisionRoute,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-types";

export const PDF_DECISION_ENGINE_VERSION = "pdf-decision-engine-v1";

// Financial section kinds that confirm the document contains statements.
const FINANCIAL_SECTION_KINDS = new Set([
  "INCOME_STATEMENT",
  "BALANCE",
  "BALANCE_SHEET",
  "BALANCE_ASSETS",
  "BALANCE_EQUITY_LIABILITIES",
  "CASH_FLOW",
]);

// Narrative-only kinds — their presence without financial sections is a risk.
const NARRATIVE_ONLY_KINDS = new Set(["BOARD_REPORT", "AUDITOR_REPORT"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPageHintSummary(
  hints: FinancialExtractionPageHints | null | undefined,
): PdfDecisionPageHintSummary | null {
  if (!hints) return null;
  return {
    hasReliableHints: hints.hasReliableHints,
    includePageCount: hints.includePages.length,
    excludePageCount: hints.excludePages.size,
    preferredIncomeStatementPageCount: hints.preferredIncomeStatementPages.length,
    preferredBalancePageCount: hints.preferredBalancePages.length,
    notePageCount: hints.notePages.length,
    reasons: hints.reasons,
  };
}

function chooseRoute(input: {
  hasReliableTextLayer: boolean;
  odlEnabled: boolean;
  odlMode: OpenDataLoaderResolvedConfig["mode"];
  qualityRisk: PdfDecisionRisk;
  manualReviewRequired: boolean;
}): PdfDecisionRoute {
  if (input.manualReviewRequired) {
    return "MANUAL_REVIEW";
  }

  if (input.hasReliableTextLayer && !input.odlEnabled) {
    return "TEXT_LAYER";
  }

  if (input.odlEnabled) {
    if (input.hasReliableTextLayer) {
      return "OPENDATALOADER_LOCAL";
    }
    return "OPENDATALOADER_HYBRID";
  }

  // ODL disabled, unreliable text layer
  if (!input.hasReliableTextLayer) {
    return "FORCE_OCR";
  }

  return "TEXT_LAYER";
}

function computeRisk(input: {
  hasReliableTextLayer: boolean;
  qualityRisk: "LOW" | "MEDIUM" | "HIGH" | null;
  financialFacts: boolean;
  blockingRuleCodes: string[];
}): PdfDecisionRisk {
  // Blocking validation errors → always HIGH
  if (input.blockingRuleCodes.length > 0) {
    return "HIGH";
  }
  // No reliable text → HIGH
  if (!input.hasReliableTextLayer) {
    return "HIGH";
  }
  // Document diagnostics risk
  if (input.qualityRisk === "HIGH") {
    return "HIGH";
  }
  // No financial sections is a strong signal of extraction problems
  if (!input.financialFacts) {
    return "HIGH";
  }
  if (input.qualityRisk === "MEDIUM") {
    return "MEDIUM";
  }
  return "LOW";
}

// ---------------------------------------------------------------------------
// Main engine function
// ---------------------------------------------------------------------------

export function runPdfDecisionEngine(input: {
  preflight: PreflightResult;
  pageHints?: FinancialExtractionPageHints | null;
  odlConfig?: Pick<OpenDataLoaderResolvedConfig, "enabled" | "mode"> | null;
  /** Optional blocking rule codes from an earlier validation pass. */
  blockingRuleCodes?: string[];
}): PdfDecisionResult {
  const decidedAt = new Date().toISOString();

  // Safely extract diagnostics — all fields may be absent
  const diagnostics = input.preflight.diagnostics ?? null;
  const structuredDoc = input.preflight.structuredDocument ?? null;

  const sections = structuredDoc?.sections ?? [];
  const sectionKinds = sections.map((s) => s.kind);
  const financialSectionKinds = sectionKinds.filter((k) => FINANCIAL_SECTION_KINDS.has(k));
  const narrativeOnlyKinds = sectionKinds.filter((k) => NARRATIVE_ONLY_KINDS.has(k));

  const financialFacts = financialSectionKinds.length > 0;
  const hasNarrativesOnly = !financialFacts && narrativeOnlyKinds.length > 0;

  const blockingRuleCodes = input.blockingRuleCodes ?? [];
  const odlEnabled = input.odlConfig?.enabled ?? false;
  const odlMode = input.odlConfig?.mode ?? "local";

  const qualityRisk = diagnostics?.qualityRisk ?? null;
  const recommendedRouteHint = diagnostics?.recommendedRouteHint ?? input.preflight.recommendedRouteHint ?? null;
  const financialStatementPageCount = diagnostics?.financialStatementPageCount ?? 0;
  const likelyImageOnlyPageCount = diagnostics?.likelyImageOnlyPages?.length ?? 0;
  const sectionsFound = diagnostics?.sectionsFound ?? sections.length;
  const missingExpectedSections = diagnostics?.missingExpectedSections ?? [];

  // ---- Collect manual-review reasons ----
  const manualReviewReasons: string[] = [];

  if (blockingRuleCodes.length > 0) {
    manualReviewReasons.push(
      `Blocking validation errors: ${blockingRuleCodes.join(", ")}`,
    );
  }

  if (!financialFacts) {
    manualReviewReasons.push(
      "No financial statement sections detected in the document",
    );
  }

  if (hasNarrativesOnly) {
    manualReviewReasons.push(
      "Document contains board/auditor narratives but no financial statement sections",
    );
  }

  if (qualityRisk === "HIGH") {
    const parserRiskReasons = diagnostics?.parserRiskReasons ?? [];
    const extra =
      parserRiskReasons.length > 0 ? `: ${parserRiskReasons.join("; ")}` : "";
    manualReviewReasons.push(`High document quality risk detected${extra}`);
  }

  if (likelyImageOnlyPageCount > 0 && !odlEnabled && !input.preflight.hasReliableTextLayer) {
    manualReviewReasons.push(
      `${likelyImageOnlyPageCount} likely image-only page(s) detected and OCR fallback is limited`,
    );
  }

  if (missingExpectedSections.length > 0) {
    manualReviewReasons.push(
      `Expected sections missing: ${missingExpectedSections.join(", ")}`,
    );
  }

  // Manual review is required when there are blocking errors or no financial facts
  const manualReviewRequired =
    blockingRuleCodes.length > 0 || !financialFacts;

  const risk = computeRisk({
    hasReliableTextLayer: input.preflight.hasReliableTextLayer,
    qualityRisk,
    financialFacts,
    blockingRuleCodes,
  });

  const route = chooseRoute({
    hasReliableTextLayer: input.preflight.hasReliableTextLayer,
    odlEnabled,
    odlMode,
    qualityRisk: risk,
    manualReviewRequired,
  });

  return {
    route,
    risk,
    financialFacts,
    manualReviewReasons,
    manualReviewRequired,
    pageHintSummary: buildPageHintSummary(input.pageHints),
    blockingRuleCodes,
    preflightSignals: {
      hasTextLayer: input.preflight.hasTextLayer,
      hasReliableTextLayer: input.preflight.hasReliableTextLayer,
      pageCount: input.preflight.pageCount,
      qualityRisk,
      recommendedRouteHint: recommendedRouteHint ?? null,
      financialStatementPageCount,
      likelyImageOnlyPageCount,
      sectionsFound,
      sectionKinds,
      missingExpectedSections: missingExpectedSections as string[],
    },
    odlEnabled,
    decidedAt,
    engineVersion: PDF_DECISION_ENGINE_VERSION,
  } satisfies PdfDecisionResult;
}
