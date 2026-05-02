import { AnnualReportReviewStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  createReviewDecision,
  createTrainingLabels,
  getAdminReviewDetail,
  listAdminReviewQueue,
  setFilingStatus,
  setReviewStatus,
} from "@/server/persistence/annual-report-review-repository";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FactCorrection = {
  metricKey: string;
  fiscalYear: number;
  value: number | null;
  rawLabel?: string | null;
  sourcePage?: number | null;
  unitScale?: number | null;
  confidenceScore?: number | null;
};

export type SectionCorrection = {
  sectionType: string;
  startPage?: number;
  endPage?: number;
  text?: string;
  confidenceScore?: number;
};

export type AuditorOpinionCorrection = {
  opinionType: "CLEAN" | "QUALIFIED" | "ADVERSE" | "DISCLAIMER" | "UNKNOWN";
  hasGoingConcernEmphasis?: boolean;
  hasEmphasisOfMatter?: boolean;
  conclusionText?: string | null;
  auditorName?: string | null;
  auditorFirm?: string | null;
  signedDate?: string | null;
};

export type ReviewCorrections = {
  facts?: FactCorrection[];
  sections?: SectionCorrection[];
  auditorOpinion?: AuditorOpinionCorrection;
  failureReason?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadReviewOrThrow(reviewId: string) {
  const review = await prisma.annualReportReview.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      filingId: true,
      extractionRunId: true,
      companyId: true,
      fiscalYear: true,
      status: true,
      reviewPayload: true,
    },
  });
  if (!review) throw new Error(`Review ${reviewId} ikke funnet.`);
  return review;
}

// ---------------------------------------------------------------------------
// List queue (thin wrapper so UI can import from service layer)
// ---------------------------------------------------------------------------

export async function listReviewQueue(options?: {
  statuses?: AnnualReportReviewStatus[];
  orgNumbers?: string[];
  fiscalYear?: number;
  ruleCodes?: string[];
  minQualityScore?: number;
  maxQualityScore?: number;
  limit?: number;
}) {
  return listAdminReviewQueue(options);
}

export { getAdminReviewDetail as getReviewDetail };

// ---------------------------------------------------------------------------
// Accept
// ---------------------------------------------------------------------------

export async function acceptAnnualReportReview(
  reviewId: string,
  reviewerUserId: string,
  notes?: string | null,
) {
  const review = await loadReviewOrThrow(reviewId);

  const payload =
    review.reviewPayload && typeof review.reviewPayload === "object"
      ? (review.reviewPayload as Record<string, unknown>)
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.annualReportReviewDecision.create({
      data: {
        reviewId: review.id,
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        companyId: review.companyId,
        fiscalYear: review.fiscalYear,
        reviewerUserId,
        decisionType: "ACCEPTED",
        beforePayload: (review.reviewPayload as never) ?? undefined,
        correctionNotes: notes ?? null,
        validationPassed: true,
      },
    });

    await tx.annualReportReview.update({
      where: { id: review.id },
      data: {
        status: "ACCEPTED",
        latestActionNote: notes ?? null,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  // Emit training labels for accepted facts outside the transaction
  if (payload) {
    const selectedFacts = Array.isArray(payload.selectedFacts) ? payload.selectedFacts : [];
    const labelInputs = (selectedFacts as Array<Record<string, unknown>>).map((fact) => ({
      filingId: review.filingId,
      extractionRunId: review.extractionRunId ?? null,
      reviewId: review.id,
      reviewerUserId,
      labelType: "FACT_VALUE" as const,
      targetRef: {
        metricKey: fact.metricKey,
        fiscalYear: fact.fiscalYear ?? review.fiscalYear,
        sourcePage: fact.sourcePage ?? null,
      },
      proposedValue: { value: fact.value, unitScale: fact.unitScale },
      acceptedValue: { value: fact.value, unitScale: fact.unitScale },
      sourcePayload: fact,
    }));
    if (labelInputs.length > 0) {
      await createTrainingLabels(labelInputs);
    }
  }

  return { reviewId: review.id, status: "ACCEPTED" as const };
}

// ---------------------------------------------------------------------------
// Correct
// ---------------------------------------------------------------------------

export async function correctAnnualReportReview(
  reviewId: string,
  reviewerUserId: string,
  corrections: ReviewCorrections,
  notes?: string | null,
  overrideReason?: string | null,
) {
  const review = await loadReviewOrThrow(reviewId);

  const beforePayload = review.reviewPayload ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.annualReportReviewDecision.create({
      data: {
        reviewId: review.id,
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        companyId: review.companyId,
        fiscalYear: review.fiscalYear,
        reviewerUserId,
        decisionType: "CORRECTED",
        beforePayload: (beforePayload as never) ?? undefined,
        afterPayload: corrections as never,
        correctionNotes: notes ?? null,
        overrideReason: overrideReason ?? null,
      },
    });

    await tx.annualReportReview.update({
      where: { id: review.id },
      data: {
        status: "ACCEPTED",
        latestActionNote: notes ?? null,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  // Training labels for corrected facts
  const labelInputs = [];

  if (corrections.facts) {
    for (const fact of corrections.facts) {
      const before = _findFactBefore(beforePayload as Record<string, unknown> | null, fact.metricKey, fact.fiscalYear);
      labelInputs.push({
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        reviewId: review.id,
        reviewerUserId,
        labelType: "FACT_VALUE" as const,
        targetRef: { metricKey: fact.metricKey, fiscalYear: fact.fiscalYear, sourcePage: fact.sourcePage ?? null },
        proposedValue: before,
        acceptedValue: { value: fact.value, rawLabel: fact.rawLabel, unitScale: fact.unitScale, sourcePage: fact.sourcePage },
        sourcePayload: fact,
      });
    }
  }

  if (corrections.sections) {
    for (const section of corrections.sections) {
      labelInputs.push({
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        reviewId: review.id,
        reviewerUserId,
        labelType: "PAGE_SECTION" as const,
        targetRef: { sectionType: section.sectionType },
        proposedValue: null,
        acceptedValue: section,
        sourcePayload: section,
      });
    }
  }

  if (corrections.auditorOpinion) {
    labelInputs.push({
      filingId: review.filingId,
      extractionRunId: review.extractionRunId ?? null,
      reviewId: review.id,
      reviewerUserId,
      labelType: "AUDITOR_OPINION" as const,
      targetRef: { fiscalYear: review.fiscalYear },
      proposedValue: null,
      acceptedValue: corrections.auditorOpinion,
      sourcePayload: corrections.auditorOpinion,
    });
  }

  if (labelInputs.length > 0) {
    await createTrainingLabels(labelInputs);
  }

  return { reviewId: review.id, status: "ACCEPTED" as const };
}

function _findFactBefore(
  payload: Record<string, unknown> | null,
  metricKey: string,
  fiscalYear: number,
): unknown {
  if (!payload) return null;
  const facts = Array.isArray(payload.selectedFacts) ? payload.selectedFacts : [];
  return (
    (facts as Array<Record<string, unknown>>).find(
      (f) => f.metricKey === metricKey && (f.fiscalYear === fiscalYear || f.fiscalYear == null),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

export async function rejectAnnualReportReview(
  reviewId: string,
  reviewerUserId: string,
  reason: string,
) {
  const review = await loadReviewOrThrow(reviewId);

  await prisma.$transaction(async (tx) => {
    await tx.annualReportReviewDecision.create({
      data: {
        reviewId: review.id,
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        companyId: review.companyId,
        fiscalYear: review.fiscalYear,
        reviewerUserId,
        decisionType: "REJECTED",
        beforePayload: (review.reviewPayload as never) ?? undefined,
        correctionNotes: reason,
        validationPassed: false,
      },
    });

    await tx.annualReportReview.update({
      where: { id: review.id },
      data: {
        status: "REJECTED",
        latestActionNote: reason,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  await createTrainingLabels([
    {
      filingId: review.filingId,
      extractionRunId: review.extractionRunId ?? null,
      reviewId: review.id,
      reviewerUserId,
      labelType: "FAILURE_REASON",
      targetRef: { fiscalYear: review.fiscalYear },
      proposedValue: null,
      acceptedValue: null,
      sourcePayload: { reason, decisionType: "REJECTED" },
    },
  ]);

  return { reviewId: review.id, status: "REJECTED" as const };
}

// ---------------------------------------------------------------------------
// Request reprocess
// ---------------------------------------------------------------------------

export async function reprocessAnnualReportReview(
  reviewId: string,
  reviewerUserId: string,
  reason: string,
) {
  const review = await loadReviewOrThrow(reviewId);

  await prisma.$transaction(async (tx) => {
    await tx.annualReportReviewDecision.create({
      data: {
        reviewId: review.id,
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        companyId: review.companyId,
        fiscalYear: review.fiscalYear,
        reviewerUserId,
        decisionType: "REPROCESS_REQUESTED",
        correctionNotes: reason,
      },
    });

    await tx.annualReportReview.update({
      where: { id: review.id },
      data: {
        status: "REPROCESS_REQUESTED",
        latestActionNote: reason,
        updatedAt: new Date(),
      },
    });

    // Reset filing to PREFLIGHTED so pipeline can pick it up
    await tx.annualReportFiling.update({
      where: { id: review.filingId },
      data: { status: "PREFLIGHTED", updatedAt: new Date() },
    });
  });

  return { reviewId: review.id, status: "REPROCESS_REQUESTED" as const };
}

// ---------------------------------------------------------------------------
// Mark unreadable
// ---------------------------------------------------------------------------

export async function markAnnualReportReviewUnreadable(
  reviewId: string,
  reviewerUserId: string,
  reason: string,
) {
  const review = await loadReviewOrThrow(reviewId);

  await prisma.$transaction(async (tx) => {
    await tx.annualReportReviewDecision.create({
      data: {
        reviewId: review.id,
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        companyId: review.companyId,
        fiscalYear: review.fiscalYear,
        reviewerUserId,
        decisionType: "UNREADABLE",
        correctionNotes: reason,
        validationPassed: false,
      },
    });

    await tx.annualReportReview.update({
      where: { id: review.id },
      data: {
        status: "REJECTED",
        latestActionNote: reason,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await tx.annualReportFiling.update({
      where: { id: review.filingId },
      data: {
        status: "FAILED",
        lastError: `Merket som uleselig av reviewer: ${reason}`,
        updatedAt: new Date(),
      },
    });
  });

  await createTrainingLabels([
    {
      filingId: review.filingId,
      extractionRunId: review.extractionRunId ?? null,
      reviewId: review.id,
      reviewerUserId,
      labelType: "FAILURE_REASON",
      targetRef: { fiscalYear: review.fiscalYear },
      proposedValue: null,
      acceptedValue: null,
      sourcePayload: { reason, decisionType: "UNREADABLE" },
    },
  ]);

  return { reviewId: review.id, status: "REJECTED" as const, filingStatus: "FAILED" as const };
}
