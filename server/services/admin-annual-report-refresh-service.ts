import { AnnualReportReviewStatus } from "@prisma/client";

import { listAnnualReportReviews } from "@/server/persistence/annual-report-ingestion-repository";
import {
  reprocessAnnualReportFilingById,
  reprocessAnnualReportFilingsByCriteria,
} from "@/server/services/annual-report-financials-service";
import {
  listUnifiedConfidenceGateResultsForAdmin,
  type UnifiedConfidenceAdminRow,
} from "@/server/services/annual-report-unified-confidence-admin-service";

export type AnnualReportRefreshSource = "review_queue" | "unified_confidence";

export type AdminAffectedAnnualReportFiling = {
  filingId: string;
  orgNumber: string | null;
  companyName: string | null;
  fiscalYear: number | null;
  sources: AnnualReportRefreshSource[];
  reasons: string[];
  reviewCount: number;
  gateVerdict: UnifiedConfidenceAdminRow["gateVerdict"] | null;
  financialLineItemCount: number | null;
  narrativeSectionCount: number | null;
};

export type AdminAnnualReportRefreshDeps = {
  listReviews?: typeof listAnnualReportReviews;
  listUnifiedConfidence?: typeof listUnifiedConfidenceGateResultsForAdmin;
  reprocessByFilingId?: typeof reprocessAnnualReportFilingById;
  reprocessByCriteria?: typeof reprocessAnnualReportFilingsByCriteria;
};

function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function isUnifiedRefreshCandidate(row: UnifiedConfidenceAdminRow) {
  return (
    row.gateVerdict === "FAIL" ||
    row.gateVerdict === "INSUFFICIENT_DATA" ||
    row.financialLineItemCount === null ||
    row.financialLineItemCount === 0 ||
    row.narrativeSectionCount === null ||
    row.narrativeSectionCount === 0
  );
}

function buildUnifiedReasons(row: UnifiedConfidenceAdminRow) {
  const reasons: string[] = [];

  if (row.gateVerdict === "FAIL" || row.gateVerdict === "INSUFFICIENT_DATA") {
    reasons.push(`Unified verdict er ${row.gateVerdict}.`);
  }
  if (row.financialLineItemCount === null || row.financialLineItemCount === 0) {
    reasons.push("Unified mangler finansielle linjer.");
  }
  if (row.narrativeSectionCount === null || row.narrativeSectionCount === 0) {
    reasons.push("Unified mangler tekstseksjoner.");
  }

  return reasons;
}

function mergeAffectedEntry(
  map: Map<string, AdminAffectedAnnualReportFiling>,
  next: AdminAffectedAnnualReportFiling,
) {
  const existing = map.get(next.filingId);
  if (!existing) {
    map.set(next.filingId, next);
    return;
  }

  existing.sources = Array.from(new Set([...existing.sources, ...next.sources]));
  existing.reasons = Array.from(new Set([...existing.reasons, ...next.reasons]));
  existing.reviewCount = Math.max(existing.reviewCount, next.reviewCount);
  existing.gateVerdict = existing.gateVerdict ?? next.gateVerdict;
  existing.financialLineItemCount = existing.financialLineItemCount ?? next.financialLineItemCount;
  existing.narrativeSectionCount = existing.narrativeSectionCount ?? next.narrativeSectionCount;
  existing.orgNumber = existing.orgNumber ?? next.orgNumber;
  existing.companyName = existing.companyName ?? next.companyName;
  existing.fiscalYear = existing.fiscalYear ?? next.fiscalYear;
}

function selectLatestUnifiedRows(rows: UnifiedConfidenceAdminRow[]) {
  const latestByFiling = new Map<string, UnifiedConfidenceAdminRow>();

  for (const row of rows) {
    const existing = latestByFiling.get(row.filingId);
    if (!existing) {
      latestByFiling.set(row.filingId, row);
      continue;
    }

    const existingTimestamp = Math.max(
      toTimestamp(existing.generatedAt),
      toTimestamp(existing.artifactCreatedAt),
    );
    const candidateTimestamp = Math.max(
      toTimestamp(row.generatedAt),
      toTimestamp(row.artifactCreatedAt),
    );

    if (candidateTimestamp >= existingTimestamp) {
      latestByFiling.set(row.filingId, row);
    }
  }

  return [...latestByFiling.values()];
}

export async function listAffectedAnnualReportFilingsForRefresh(
  deps: AdminAnnualReportRefreshDeps = {},
) {
  const listReviews = deps.listReviews ?? listAnnualReportReviews;
  const listUnifiedConfidence =
    deps.listUnifiedConfidence ?? listUnifiedConfidenceGateResultsForAdmin;

  const [reviews, unified] = await Promise.all([
    listReviews({
      statuses: [
        AnnualReportReviewStatus.PENDING_REVIEW,
        AnnualReportReviewStatus.REPROCESS_REQUESTED,
      ],
      limit: 1000,
    }),
    listUnifiedConfidence({
      limit: 1000,
    }),
  ]);

  const affected = new Map<string, AdminAffectedAnnualReportFiling>();

  const reviewCounts = new Map<string, number>();
  for (const review of reviews) {
    reviewCounts.set(review.filingId, (reviewCounts.get(review.filingId) ?? 0) + 1);
  }

  for (const review of reviews) {
    mergeAffectedEntry(affected, {
      filingId: review.filingId,
      orgNumber: review.company.orgNumber,
      companyName: review.company.name,
      fiscalYear: review.fiscalYear,
      sources: ["review_queue"],
      reasons: [`Har ${review.status === "PENDING_REVIEW" ? "aktiv manuell kontroll" : "venter på ny behandling"}.`],
      reviewCount: reviewCounts.get(review.filingId) ?? 1,
      gateVerdict: null,
      financialLineItemCount: null,
      narrativeSectionCount: null,
    });
  }

  for (const row of selectLatestUnifiedRows(unified.items)) {
    if (!isUnifiedRefreshCandidate(row)) {
      continue;
    }

    mergeAffectedEntry(affected, {
      filingId: row.filingId,
      orgNumber: row.orgNumber,
      companyName: row.companyName,
      fiscalYear: row.fiscalYear,
      sources: ["unified_confidence"],
      reasons: buildUnifiedReasons(row),
      reviewCount: reviewCounts.get(row.filingId) ?? 0,
      gateVerdict: row.gateVerdict,
      financialLineItemCount: row.financialLineItemCount,
      narrativeSectionCount: row.narrativeSectionCount,
    });
  }

  return [...affected.values()].sort((left, right) => {
    const rightYear = right.fiscalYear ?? 0;
    const leftYear = left.fiscalYear ?? 0;
    if (rightYear !== leftYear) {
      return rightYear - leftYear;
    }
    return (left.companyName ?? "").localeCompare(right.companyName ?? ""); // stable enough for admin list
  });
}

export async function refreshAnnualReportFilingFromAdmin(
  filingId: string,
  deps: AdminAnnualReportRefreshDeps = {},
) {
  const reprocessByFilingId =
    deps.reprocessByFilingId ?? reprocessAnnualReportFilingById;

  return reprocessByFilingId(filingId, {
    note: "Admin refresh requested from UI",
  });
}

export async function refreshAffectedAnnualReportFilingsFromAdmin(
  deps: AdminAnnualReportRefreshDeps = {},
) {
  const reprocessByCriteria =
    deps.reprocessByCriteria ?? reprocessAnnualReportFilingsByCriteria;
  const affected = await listAffectedAnnualReportFilingsForRefresh(deps);
  const filingIds = Array.from(new Set(affected.map((item) => item.filingId)));

  if (filingIds.length === 0) {
    return {
      affectedFilings: [],
      refreshResult: {
        matchedFilings: [],
        results: [],
      },
    };
  }

  const refreshResult = await reprocessByCriteria({
    filingIds,
    note: "Admin refresh requested for affected filings",
    limit: filingIds.length,
  });

  return {
    affectedFilings: affected,
    refreshResult,
  };
}
