/**
 * PDF Parser Route Assignment Preview Service
 *
 * Deterministically previews which parse route each filing *would* be assigned
 * to under a given canary config, without touching production routing, fact
 * extraction, or publishing.
 *
 * Assignment logic:
 *   1. Compute canary eligibility for the filing (via canary config service).
 *   2. Hash `seed:filingId:orgNumber` to a stable 0-99 bucket.
 *   3. If eligible AND bucket < config.maxCanaryPercent → WOULD_USE_CANARY_ROUTE
 *   4. If eligibility verdict is DISABLED                → DISABLED
 *   5. If eligibility verdict is BLOCKED                → BLOCKED
 *   6. If underlying recommendation is MANUAL_REVIEW    → MANUAL_REVIEW
 *   7. Otherwise                                        → WOULD_USE_TEXT_LAYER
 *
 * All output carries canUseForProductionRouting=false.
 */

import type {
  PdfParserRouteCanaryAllowedRoute,
  PdfParserRouteCanaryConfig,
  PdfParserRouteCanaryPreviewReport,
} from "@/server/services/pdf-parser-route-canary-config-service";
import {
  DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
  buildPdfParserRouteCanaryPreviewReport,
} from "@/server/services/pdf-parser-route-canary-config-service";
import type {
  PdfParserRouteRecommendationV2Decision,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";
import {
  buildPdfParserRouteRecommendationV2Report,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";

// ---- Hash -------------------------------------------------------------------

/**
 * djb2-style deterministic hash, returns a bucket in [0, 99].
 * Input is the string `seed:filingId:orgNumber` (orgNumber empty string if null).
 */
export function stableHashBucket(seed: string, filingId: string, orgNumber: string | null): number {
  const s = `${seed}:${filingId}:${orgNumber ?? ""}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // Keep as unsigned 32-bit integer
  }
  return h % 100;
}

// ---- Types ------------------------------------------------------------------

export type PdfParserRouteAssignmentVerdict =
  | "DISABLED"
  | "BLOCKED"
  | "WOULD_USE_TEXT_LAYER"
  | "WOULD_USE_CANARY_ROUTE"
  | "MANUAL_REVIEW";

export interface PdfParserRouteAssignmentPreviewItem {
  filingId: string;
  orgNumber: string | null;
  fiscalYear: number | null;
  /** Deterministic cohort bucket 0-99 for this filing under the given seed */
  bucket: number;
  /** maxCanaryPercent from the config at evaluation time */
  maxCanaryPercent: number;
  verdict: PdfParserRouteAssignmentVerdict;
  /** Set to the canary route only when verdict=WOULD_USE_CANARY_ROUTE */
  assignedCanaryRoute: PdfParserRouteCanaryAllowedRoute | null;
  blockedReasons: string[];
  /** Always false — preview only, no production routing changes */
  canUseForProductionRouting: false;
}

export interface PdfParserRouteAssignmentPreviewSummary {
  totalDocuments: number;
  wouldUseCanaryRoute: number;
  wouldUseTextLayer: number;
  manualReview: number;
  blocked: number;
  disabled: number;
  byAssignedRoute: Record<string, number>;
}

export interface PdfParserRouteAssignmentPreviewReport {
  schemaVersion: 1;
  generatedAt: string;
  seed: string;
  config: PdfParserRouteCanaryConfig;
  assignments: PdfParserRouteAssignmentPreviewItem[];
  summary: PdfParserRouteAssignmentPreviewSummary;
  safety: {
    readOnly: true;
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
    shadowOnly: true;
    canUseForProductionRouting: false;
  };
}

export interface PdfParserRouteAssignmentPreviewInput {
  /** Stable seed string for cohort hashing; defaults to "preview" */
  seed?: string;
  from?: string;
  to?: string;
  fiscalYear?: number;
  organizationNumber?: string;
  limit?: number;
  config?: PdfParserRouteCanaryConfig;
}

// ---- Core build function ----------------------------------------------------

export async function buildPdfParserRouteAssignmentPreviewReport(
  input?: PdfParserRouteAssignmentPreviewInput,
  deps?: {
    buildCanaryReport?: typeof buildPdfParserRouteCanaryPreviewReport;
    buildRecommendationReport?: typeof buildPdfParserRouteRecommendationV2Report;
  },
): Promise<PdfParserRouteAssignmentPreviewReport> {
  const seed = input?.seed ?? "preview";
  const config = input?.config ?? DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG;

  const buildCanary = deps?.buildCanaryReport ?? buildPdfParserRouteCanaryPreviewReport;

  const canaryReport: PdfParserRouteCanaryPreviewReport = await buildCanary(
    {
      from: input?.from,
      to: input?.to,
      fiscalYear: input?.fiscalYear,
      organizationNumber: input?.organizationNumber,
      limit: input?.limit,
      config,
    },
    deps?.buildRecommendationReport
      ? { buildRecommendationReport: deps.buildRecommendationReport }
      : undefined,
  );

  // We need the underlying recommendation decisions to know whether a filing
  // is MANUAL_REVIEW. We index them by filingId for O(1) lookup.
  // The canary report's filings map 1:1 with the recommendation decisions —
  // rebuild the recommendation only if a separate dep was provided; otherwise
  // reuse the data already embedded in the canary report.
  //
  // NOTE: The canary report's `filings` only carries eligibility verdicts, not
  // the recommendedRoute. We need the recommendation report for MANUAL_REVIEW
  // detection. We call buildRecommendationReport separately when needed, or
  // accept it as a dep.
  //
  // To avoid a second DB round-trip in production, we call buildCanary which
  // already calls buildRecommendationReport internally. For MANUAL_REVIEW
  // detection we look at blockedReasons: a BLOCKED filing with reason
  // "decision requires manual review" → MANUAL_REVIEW verdict.
  // A DISABLED filing from DISABLED mode → DISABLED verdict.

  const assignments: PdfParserRouteAssignmentPreviewItem[] = canaryReport.filings.map(
    (eligibility) => {
      const bucket = stableHashBucket(seed, eligibility.filingId, eligibility.orgNumber);
      const maxCanaryPercent = config.maxCanaryPercent;

      // DISABLED — canary is fully off.
      if (eligibility.verdict === "DISABLED") {
        return {
          filingId: eligibility.filingId,
          orgNumber: eligibility.orgNumber,
          fiscalYear: eligibility.fiscalYear,
          bucket,
          maxCanaryPercent,
          verdict: "DISABLED" as const,
          assignedCanaryRoute: null,
          blockedReasons: eligibility.blockedReasons,
          canUseForProductionRouting: false,
        };
      }

      // BLOCKED — filing did not pass eligibility gates.
      if (eligibility.verdict === "BLOCKED") {
        // Detect MANUAL_REVIEW from blockedReasons.
        const isManualReview = eligibility.blockedReasons.some((r) =>
          r.toLowerCase().includes("manual review"),
        );
        return {
          filingId: eligibility.filingId,
          orgNumber: eligibility.orgNumber,
          fiscalYear: eligibility.fiscalYear,
          bucket,
          maxCanaryPercent,
          verdict: isManualReview ? ("MANUAL_REVIEW" as const) : ("BLOCKED" as const),
          assignedCanaryRoute: null,
          blockedReasons: eligibility.blockedReasons,
          canUseForProductionRouting: false,
        };
      }

      // ELIGIBLE — apply bucket-based cohort assignment.
      if (eligibility.verdict === "ELIGIBLE" && eligibility.canaryRoute !== null) {
        if (bucket < maxCanaryPercent) {
          return {
            filingId: eligibility.filingId,
            orgNumber: eligibility.orgNumber,
            fiscalYear: eligibility.fiscalYear,
            bucket,
            maxCanaryPercent,
            verdict: "WOULD_USE_CANARY_ROUTE" as const,
            assignedCanaryRoute: eligibility.canaryRoute,
            blockedReasons: [],
            canUseForProductionRouting: false,
          };
        }
        // Eligible but not in canary cohort.
        return {
          filingId: eligibility.filingId,
          orgNumber: eligibility.orgNumber,
          fiscalYear: eligibility.fiscalYear,
          bucket,
          maxCanaryPercent,
          verdict: "WOULD_USE_TEXT_LAYER" as const,
          assignedCanaryRoute: null,
          blockedReasons: [],
          canUseForProductionRouting: false,
        };
      }

      // Fallback (should not normally occur).
      return {
        filingId: eligibility.filingId,
        orgNumber: eligibility.orgNumber,
        fiscalYear: eligibility.fiscalYear,
        bucket,
        maxCanaryPercent,
        verdict: "WOULD_USE_TEXT_LAYER" as const,
        assignedCanaryRoute: null,
        blockedReasons: eligibility.blockedReasons,
        canUseForProductionRouting: false,
      };
    },
  );

  const byAssignedRoute: Record<string, number> = {};
  for (const a of assignments) {
    if (a.verdict === "WOULD_USE_CANARY_ROUTE" && a.assignedCanaryRoute) {
      byAssignedRoute[a.assignedCanaryRoute] =
        (byAssignedRoute[a.assignedCanaryRoute] ?? 0) + 1;
    }
  }

  const summary: PdfParserRouteAssignmentPreviewSummary = {
    totalDocuments: assignments.length,
    wouldUseCanaryRoute: assignments.filter((a) => a.verdict === "WOULD_USE_CANARY_ROUTE").length,
    wouldUseTextLayer: assignments.filter((a) => a.verdict === "WOULD_USE_TEXT_LAYER").length,
    manualReview: assignments.filter((a) => a.verdict === "MANUAL_REVIEW").length,
    blocked: assignments.filter((a) => a.verdict === "BLOCKED").length,
    disabled: assignments.filter((a) => a.verdict === "DISABLED").length,
    byAssignedRoute,
  };

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    seed,
    config,
    assignments,
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

// ---- Validation -------------------------------------------------------------

export function validatePdfParserRouteAssignmentPreviewReport(
  report: PdfParserRouteAssignmentPreviewReport,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (report.schemaVersion !== 1) {
    issues.push(`schemaVersion must be 1, got ${String(report.schemaVersion)}.`);
  }
  if (!report.generatedAt) {
    issues.push("generatedAt is required.");
  }
  if (!report.seed) {
    issues.push("seed is required.");
  }
  if (report.safety.canUseForProductionRouting !== false) {
    issues.push("safety.canUseForProductionRouting must be false.");
  }
  if (report.safety.productionRoutingChanged !== false) {
    issues.push("safety.productionRoutingChanged must be false.");
  }

  for (const a of report.assignments) {
    if (a.canUseForProductionRouting !== false) {
      issues.push(
        `Assignment for filingId "${a.filingId}" has canUseForProductionRouting !== false.`,
      );
    }
    if (typeof a.bucket !== "number" || a.bucket < 0 || a.bucket > 99) {
      issues.push(`Assignment for filingId "${a.filingId}" has invalid bucket ${String(a.bucket)}.`);
    }
  }

  return { valid: issues.length === 0, issues };
}

// ---- Serialization ----------------------------------------------------------

export function serializePdfParserRouteAssignmentPreviewReport(
  report: PdfParserRouteAssignmentPreviewReport,
): string {
  return JSON.stringify(report, null, 2);
}
