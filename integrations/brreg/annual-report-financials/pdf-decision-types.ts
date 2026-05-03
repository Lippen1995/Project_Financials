/**
 * PDF Decision Engine – types
 *
 * These types describe the output of the lightweight decision engine that
 * analyses the results of preflight + section-segmentation and recommends a
 * parsing route, a quality-risk level, and reasons for any manual-review flag.
 *
 * The engine never calls external services; it only inspects the artefacts
 * that are already produced by the preflight step.
 */

// ---------------------------------------------------------------------------
// Route recommendation
// ---------------------------------------------------------------------------

/**
 * The recommended parsing route for the filing.
 *
 * - TEXT_LAYER           – PDF has a reliable embedded text layer; use the
 *                          deterministic legacy parser.
 * - OPENDATALOADER_LOCAL – OpenDataLoader is enabled; run the local (no-OCR)
 *                          mode.
 * - OPENDATALOADER_HYBRID – OpenDataLoader is enabled; run in hybrid/OCR mode
 *                           because the text layer is weak or absent.
 * - FORCE_OCR            – OpenDataLoader is disabled; fall back to Tesseract
 *                          OCR.
 * - MANUAL_REVIEW        – The document is too problematic to process
 *                          automatically; send straight to manual review.
 * - UNKNOWN              – Inputs were insufficient to make a decision.
 */
export type PdfDecisionRoute =
  | "TEXT_LAYER"
  | "OPENDATALOADER_LOCAL"
  | "OPENDATALOADER_HYBRID"
  | "FORCE_OCR"
  | "MANUAL_REVIEW"
  | "UNKNOWN";

// ---------------------------------------------------------------------------
// Risk level
// ---------------------------------------------------------------------------

export type PdfDecisionRisk = "LOW" | "MEDIUM" | "HIGH";

// ---------------------------------------------------------------------------
// Page-hint summary (serialisable subset of FinancialExtractionPageHints)
// ---------------------------------------------------------------------------

export type PdfDecisionPageHintSummary = {
  hasReliableHints: boolean;
  includePageCount: number;
  excludePageCount: number;
  preferredIncomeStatementPageCount: number;
  preferredBalancePageCount: number;
  notePageCount: number;
  reasons: string[];
};

// ---------------------------------------------------------------------------
// Main output
// ---------------------------------------------------------------------------

export type PdfDecisionResult = {
  /** Recommended parsing route. */
  route: PdfDecisionRoute;
  /** Overall quality risk for downstream extraction. */
  risk: PdfDecisionRisk;
  /** True when at least one recognised financial statement section was found. */
  financialFacts: boolean;
  /**
   * Human-readable reasons explaining why a manual-review flag was raised.
   * Empty when manualReviewRequired is false.
   */
  manualReviewReasons: string[];
  /** True when the engine recommends routing to manual review immediately. */
  manualReviewRequired: boolean;
  /** Condensed page-hint information for traceability. */
  pageHintSummary: PdfDecisionPageHintSummary | null;
  /** Codes from blocking validation issues that influenced the decision. */
  blockingRuleCodes: string[];
  /** Originating preflight signals. */
  preflightSignals: {
    hasTextLayer: boolean;
    hasReliableTextLayer: boolean;
    pageCount: number;
    qualityRisk: "LOW" | "MEDIUM" | "HIGH" | null;
    recommendedRouteHint: string | null;
    financialStatementPageCount: number;
    likelyImageOnlyPageCount: number;
    sectionsFound: number;
    sectionKinds: string[];
    missingExpectedSections: string[];
  };
  /** Whether OpenDataLoader was enabled when the decision was made. */
  odlEnabled: boolean;
  /** ISO-8601 timestamp of when the decision was produced. */
  decidedAt: string;
  /** Engine version string for traceability. */
  engineVersion: string;
};
