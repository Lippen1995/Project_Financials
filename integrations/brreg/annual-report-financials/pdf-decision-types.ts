/**
 * PDF Decision Engine types.
 *
 * The engine is deterministic and explainable. It only inspects already
 * produced preflight, document-structure, page-hint, and validation signals.
 */

export type PdfDecisionRoute =
  | "TEXT_LAYER"
  | "OPENDATALOADER_LOCAL"
  | "OPENDATALOADER_HYBRID"
  | "FORCE_OCR"
  | "MANUAL_REVIEW"
  | "UNKNOWN";

export type PdfDecisionRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type PdfDecisionRisk = PdfDecisionRiskLevel;

export type PdfDecisionPhase = "pre_extraction" | "post_validation";

export type PdfDecisionEnabledExtractors = {
  financialFacts: boolean;
  boardReport: boolean;
  auditorReport: boolean;
  notes: boolean;
};

export type PdfDecisionPageHints = {
  hasReliableHints: boolean;
  includePages: number[];
  excludePages: number[];
  preferredIncomeStatementPages: number[];
  preferredBalancePages: number[];
  notePages: number[];
  reasons: string[];
};

export type PdfDecisionDiagnostics = {
  qualityRisk?: string;
  recommendedRouteHint?: string;
  parserRiskReasons: string[];
  extractionWarnings: string[];
  missingCoreSections: string[];
  detectedSections: Array<{
    kind: string;
    startPage: number;
    endPage: number;
    confidenceScore: number;
  }>;
};

export type PdfDecisionValidationSummary = {
  hasBlockingErrors: boolean;
  blockingRuleCodes: string[];
  warningRuleCodes: string[];
  validationScore?: number;
};

export type PdfDecisionEngineOutput = {
  version: "pdf-decision-engine-v1";
  route: PdfDecisionRoute;
  riskLevel: PdfDecisionRiskLevel;
  confidenceScore: number;
  reasons: string[];
  manualReviewReasons: string[];
  enabledExtractors: PdfDecisionEnabledExtractors;
  pageHints: PdfDecisionPageHints;
  diagnostics: PdfDecisionDiagnostics;
};

export type PdfDecisionResult = PdfDecisionEngineOutput;

export type JsonSafePdfDecisionArtifactPayload = {
  version: "pdf-decision-engine-v1";
  phase: PdfDecisionPhase;
  decision: PdfDecisionEngineOutput;
  inputSummary: {
    orgNumber?: string;
    fiscalYear?: number;
    filingId?: string;
    extractionRunId?: string | null;
    hasPreflight: boolean;
    hasStructuredDocument: boolean;
    hasPageHints: boolean;
    hasValidationSummary: boolean;
    openDataLoaderEnabled: boolean;
  };
  createdAt: string;
  source: "annual-report-financials-service";
};

