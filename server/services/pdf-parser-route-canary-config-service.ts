/**
 * PDF Parser Route Canary Config Service
 *
 * Provides a typed configuration structure for canary routing experiments.
 * The default config is DISABLED with maxCanaryPercent=0 — no production
 * routing is changed at any point. All preview output carries
 * canUseForProductionRouting=false.
 *
 * This service is read-only: it only validates config shapes and computes
 * previews of hypothetical routing eligibility. Actual routing decisions,
 * fact extraction, and publishing are not affected.
 */

import type {
  PdfParserRouteRecommendationV2Decision,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";
import {
  buildPdfParserRouteRecommendationV2Report,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";

// ---- Config types -----------------------------------------------------------

export type PdfParserRouteCanaryMode = "DISABLED" | "DRY_RUN" | "SHADOW_ONLY";

export type PdfParserRouteCanaryAllowedRoute =
  | "OCR"
  | "OPENDATALOADER_LOCAL"
  | "HYBRID";

export type PdfParserRouteCanaryRequiredConfidence =
  | "HIGH"
  | "MEDIUM"
  | "LOW";

export type PdfParserRouteCanaryAllowedRisk = "LOW" | "MEDIUM";

export interface PdfParserRouteCanaryHardBlocks {
  /** Block if confidence is INSUFFICIENT_DATA */
  blockIfInsufficientData: boolean;
  /** Block if recommendation requires manual review */
  blockIfManualReviewRequired: boolean;
  /** Block if any route has more warnings than this threshold (0 = any warning blocks) */
  blockIfParserWarningsAbove: number;
  /** Block if any route has more errors than this threshold (0 = any error blocks) */
  blockIfParserErrorsAbove: number;
  /** Block if best route shows no financial section coverage */
  blockIfMissingFinancialCoverage: boolean;
  /** Block if best route shows no auditor report coverage */
  blockIfMissingAuditorReport: boolean;
}

export interface PdfParserRouteCanaryAudit {
  createdAt: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
  note?: string | null;
}

export interface PdfParserRouteCanaryConfig {
  version: "pdf-parser-route-canary-config-v1";
  /**
   * DISABLED  — canary routing is completely off (default)
   * DRY_RUN   — eligibility is computed but never applied
   * SHADOW_ONLY — applies to shadow runs only, not production ingestion
   */
  mode: PdfParserRouteCanaryMode;
  /** Which non-TEXT_LAYER routes may be canary-promoted */
  allowedRoutes: PdfParserRouteCanaryAllowedRoute[];
  /**
   * Maximum percentage of eligible filings that may be canary-routed.
   * 0 = none (effectively disabled even if mode != DISABLED).
   */
  maxCanaryPercent: number;
  /** When non-empty, only these org numbers are eligible */
  orgNumberAllowlist: string[];
  /** These org numbers are always blocked regardless of other config */
  orgNumberBlocklist: string[];
  /** When non-empty, only these fiscal years are eligible */
  fiscalYearAllowlist: number[];
  /** Minimum recommendation confidence required for canary eligibility */
  requiredRecommendationConfidence: PdfParserRouteCanaryRequiredConfidence;
  /** Acceptable risk levels for canary routing */
  allowedRecommendationRisks: PdfParserRouteCanaryAllowedRisk[];
  /** Require a passing shadow gate before canary promotion */
  requireShadowGatePass: boolean;
  /** Require that the filing's route model candidate is approved for shadow */
  requireModelCandidateApprovedForShadow: boolean;
  /** Require that a MANUAL_REVIEW fallback path is available */
  requireManualReviewFallback: boolean;
  hardBlocks: PdfParserRouteCanaryHardBlocks;
  audit: PdfParserRouteCanaryAudit;
}

// ---- Default config (production-safe, fully disabled) -----------------------

export const DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG: PdfParserRouteCanaryConfig = {
  version: "pdf-parser-route-canary-config-v1",
  mode: "DISABLED",
  allowedRoutes: ["OCR", "OPENDATALOADER_LOCAL", "HYBRID"],
  maxCanaryPercent: 0,
  orgNumberAllowlist: [],
  orgNumberBlocklist: [],
  fiscalYearAllowlist: [],
  requiredRecommendationConfidence: "HIGH",
  allowedRecommendationRisks: ["LOW"],
  requireShadowGatePass: true,
  requireModelCandidateApprovedForShadow: true,
  requireManualReviewFallback: true,
  hardBlocks: {
    blockIfInsufficientData: true,
    blockIfManualReviewRequired: true,
    blockIfParserWarningsAbove: 0,
    blockIfParserErrorsAbove: 0,
    blockIfMissingFinancialCoverage: true,
    blockIfMissingAuditorReport: false,
  },
  audit: {
    createdAt: new Date().toISOString(),
  },
};

// ---- Config validation -------------------------------------------------------

export interface PdfParserRouteCanaryConfigValidationResult {
  valid: boolean;
  issues: string[];
}

export function validatePdfParserRouteCanaryConfig(
  config: PdfParserRouteCanaryConfig,
): PdfParserRouteCanaryConfigValidationResult {
  const issues: string[] = [];

  if (config.version !== "pdf-parser-route-canary-config-v1") {
    issues.push(`version must be "pdf-parser-route-canary-config-v1", got "${String(config.version)}".`);
  }

  const validModes: PdfParserRouteCanaryMode[] = ["DISABLED", "DRY_RUN", "SHADOW_ONLY"];
  if (!validModes.includes(config.mode)) {
    issues.push(`mode must be one of ${validModes.join(", ")}.`);
  }

  if (!Array.isArray(config.allowedRoutes)) {
    issues.push("allowedRoutes must be an array.");
  } else {
    const validRoutes: PdfParserRouteCanaryAllowedRoute[] = [
      "OCR",
      "OPENDATALOADER_LOCAL",
      "HYBRID",
    ];
    for (const r of config.allowedRoutes) {
      if (!validRoutes.includes(r)) {
        issues.push(`allowedRoutes contains invalid route "${String(r)}".`);
      }
    }
  }

  if (
    typeof config.maxCanaryPercent !== "number" ||
    config.maxCanaryPercent < 0 ||
    config.maxCanaryPercent > 100
  ) {
    issues.push("maxCanaryPercent must be a number between 0 and 100.");
  }

  if (config.mode !== "DISABLED" && config.maxCanaryPercent > 0) {
    issues.push(
      "maxCanaryPercent must be 0 in the default config — canary traffic is disabled unless explicitly configured.",
    );
  }

  const validConfidences: PdfParserRouteCanaryRequiredConfidence[] = ["HIGH", "MEDIUM", "LOW"];
  if (!validConfidences.includes(config.requiredRecommendationConfidence)) {
    issues.push(
      `requiredRecommendationConfidence must be one of ${validConfidences.join(", ")}.`,
    );
  }

  if (!Array.isArray(config.allowedRecommendationRisks)) {
    issues.push("allowedRecommendationRisks must be an array.");
  } else {
    const validRisks: PdfParserRouteCanaryAllowedRisk[] = ["LOW", "MEDIUM"];
    for (const r of config.allowedRecommendationRisks) {
      if (!validRisks.includes(r)) {
        issues.push(
          `allowedRecommendationRisks contains invalid risk "${String(r)}". HIGH and UNKNOWN are never allowed.`,
        );
      }
    }
  }

  if (typeof config.hardBlocks !== "object" || config.hardBlocks === null) {
    issues.push("hardBlocks must be an object.");
  } else {
    if (typeof config.hardBlocks.blockIfParserWarningsAbove !== "number") {
      issues.push("hardBlocks.blockIfParserWarningsAbove must be a number.");
    }
    if (typeof config.hardBlocks.blockIfParserErrorsAbove !== "number") {
      issues.push("hardBlocks.blockIfParserErrorsAbove must be a number.");
    }
  }

  if (!config.audit?.createdAt) {
    issues.push("audit.createdAt is required.");
  }

  return { valid: issues.length === 0, issues };
}

// ---- Filing eligibility preview ---------------------------------------------

export type PdfParserRouteCanaryEligibilityVerdict = "ELIGIBLE" | "BLOCKED" | "DISABLED";

export interface PdfParserRouteCanaryFilingEligibility {
  filingId: string;
  orgNumber: string | null;
  fiscalYear: number | null;
  verdict: PdfParserRouteCanaryEligibilityVerdict;
  canaryRoute: PdfParserRouteCanaryAllowedRoute | null;
  blockedReasons: string[];
  /** Always false — preview only, no production routing changes */
  canUseForProductionRouting: false;
}

function confidenceOrder(c: string): number {
  if (c === "HIGH") return 3;
  if (c === "MEDIUM") return 2;
  if (c === "LOW") return 1;
  return 0;
}

function assessFilingEligibility(
  decision: PdfParserRouteRecommendationV2Decision,
  config: PdfParserRouteCanaryConfig,
): PdfParserRouteCanaryFilingEligibility {
  const base: Omit<PdfParserRouteCanaryFilingEligibility, "verdict" | "canaryRoute" | "blockedReasons"> = {
    filingId: decision.filingId,
    orgNumber: decision.orgNumber,
    fiscalYear: decision.fiscalYear,
    canUseForProductionRouting: false,
  };

  const blocked: string[] = [];

  // Mode check — DISABLED always blocks.
  if (config.mode === "DISABLED" || config.maxCanaryPercent === 0) {
    return {
      ...base,
      verdict: "DISABLED",
      canaryRoute: null,
      blockedReasons: ["Canary routing is disabled (mode=DISABLED or maxCanaryPercent=0)."],
    };
  }

  // Recommended route must be in allowedRoutes.
  const recommendedRoute = decision.recommendedRoute as PdfParserRouteCanaryAllowedRoute;
  if (!config.allowedRoutes.includes(recommendedRoute)) {
    blocked.push(
      `Recommended route "${decision.recommendedRoute}" is not in allowedRoutes.`,
    );
  }

  // Org number allowlist / blocklist.
  const orgNumber = decision.orgNumber ?? "";
  if (config.orgNumberBlocklist.includes(orgNumber)) {
    blocked.push(`Org number "${orgNumber}" is in the blocklist.`);
  }
  if (config.orgNumberAllowlist.length > 0 && !config.orgNumberAllowlist.includes(orgNumber)) {
    blocked.push(`Org number "${orgNumber}" is not in the allowlist.`);
  }

  // Fiscal year allowlist.
  if (
    config.fiscalYearAllowlist.length > 0 &&
    decision.fiscalYear !== null &&
    !config.fiscalYearAllowlist.includes(decision.fiscalYear)
  ) {
    blocked.push(`Fiscal year ${String(decision.fiscalYear)} is not in the fiscal year allowlist.`);
  }

  // Confidence check.
  const requiredConfidenceLevel = confidenceOrder(config.requiredRecommendationConfidence);
  const actualConfidenceLevel = confidenceOrder(decision.confidence);
  if (actualConfidenceLevel < requiredConfidenceLevel) {
    blocked.push(
      `Confidence "${decision.confidence}" is below required "${config.requiredRecommendationConfidence}".`,
    );
  }

  // Risk check.
  if (!config.allowedRecommendationRisks.includes(decision.risk as PdfParserRouteCanaryAllowedRisk)) {
    blocked.push(
      `Risk "${decision.risk}" is not in allowedRecommendationRisks (${config.allowedRecommendationRisks.join(", ")}).`,
    );
  }

  // Hard blocks.
  const hb = config.hardBlocks;

  if (hb.blockIfInsufficientData && decision.confidence === "INSUFFICIENT_DATA") {
    blocked.push("Blocked: confidence is INSUFFICIENT_DATA.");
  }

  if (hb.blockIfManualReviewRequired && decision.guardrails.requiresManualReview) {
    blocked.push("Blocked: decision requires manual review.");
  }

  if (
    hb.blockIfParserWarningsAbove >= 0 &&
    decision.evidence.warningCount > hb.blockIfParserWarningsAbove
  ) {
    blocked.push(
      `Blocked: warning count (${decision.evidence.warningCount}) exceeds threshold (${hb.blockIfParserWarningsAbove}).`,
    );
  }

  if (
    hb.blockIfParserErrorsAbove >= 0 &&
    decision.evidence.errorCount > hb.blockIfParserErrorsAbove
  ) {
    blocked.push(
      `Blocked: error count (${decision.evidence.errorCount}) exceeds threshold (${hb.blockIfParserErrorsAbove}).`,
    );
  }

  if (hb.blockIfMissingFinancialCoverage && !decision.evidence.hasFinancialCoverage) {
    blocked.push("Blocked: no financial section coverage detected.");
  }

  if (hb.blockIfMissingAuditorReport && !decision.evidence.hasAuditorReportCoverage) {
    blocked.push("Blocked: no auditor report coverage detected.");
  }

  if (blocked.length > 0) {
    return {
      ...base,
      verdict: "BLOCKED",
      canaryRoute: null,
      blockedReasons: blocked,
    };
  }

  return {
    ...base,
    verdict: "ELIGIBLE",
    canaryRoute: recommendedRoute,
    blockedReasons: [],
  };
}

// ---- Preview report ---------------------------------------------------------

export interface PdfParserRouteCanaryPreviewInput {
  from?: string;
  to?: string;
  fiscalYear?: number;
  organizationNumber?: string;
  limit?: number;
  config?: PdfParserRouteCanaryConfig;
}

export interface PdfParserRouteCanaryPreviewSummary {
  totalDocuments: number;
  eligible: number;
  blocked: number;
  disabled: number;
  eligibleByRoute: Record<string, number>;
}

export interface PdfParserRouteCanaryPreviewReport {
  schemaVersion: 1;
  generatedAt: string;
  config: PdfParserRouteCanaryConfig;
  configValid: boolean;
  configIssues: string[];
  filings: PdfParserRouteCanaryFilingEligibility[];
  summary: PdfParserRouteCanaryPreviewSummary;
  safety: {
    readOnly: true;
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
    shadowOnly: true;
    canUseForProductionRouting: false;
  };
}

export async function buildPdfParserRouteCanaryPreviewReport(
  input?: PdfParserRouteCanaryPreviewInput,
  deps?: {
    buildRecommendationReport?: typeof buildPdfParserRouteRecommendationV2Report;
  },
): Promise<PdfParserRouteCanaryPreviewReport> {
  const config = input?.config ?? DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG;
  const { valid: configValid, issues: configIssues } =
    validatePdfParserRouteCanaryConfig(config);

  const buildRec = deps?.buildRecommendationReport ?? buildPdfParserRouteRecommendationV2Report;

  const recommendationReport = await buildRec({
    from: input?.from,
    to: input?.to,
    fiscalYear: input?.fiscalYear,
    organizationNumber: input?.organizationNumber,
    limit: input?.limit,
  });

  const filings: PdfParserRouteCanaryFilingEligibility[] =
    recommendationReport.decisions.map((decision) =>
      assessFilingEligibility(decision, config),
    );

  const eligibleByRoute: Record<string, number> = {};
  for (const f of filings) {
    if (f.verdict === "ELIGIBLE" && f.canaryRoute) {
      eligibleByRoute[f.canaryRoute] = (eligibleByRoute[f.canaryRoute] ?? 0) + 1;
    }
  }

  const summary: PdfParserRouteCanaryPreviewSummary = {
    totalDocuments: filings.length,
    eligible: filings.filter((f) => f.verdict === "ELIGIBLE").length,
    blocked: filings.filter((f) => f.verdict === "BLOCKED").length,
    disabled: filings.filter((f) => f.verdict === "DISABLED").length,
    eligibleByRoute,
  };

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    config,
    configValid,
    configIssues,
    filings,
    summary,
    safety: {
      readOnly: true,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
  };
}

// ---- Serialization ----------------------------------------------------------

export function serializePdfParserRouteCanaryPreviewReport(
  report: PdfParserRouteCanaryPreviewReport,
): string {
  return JSON.stringify(report, null, 2);
}
