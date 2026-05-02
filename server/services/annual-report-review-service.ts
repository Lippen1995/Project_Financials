import { AnnualReportReviewStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getAdminReviewDetail,
  listAdminReviewQueue,
} from "@/server/persistence/annual-report-review-repository";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ReviewConflictError extends Error {
  constructor(reviewId: string, status: string) {
    super(`Review ${reviewId} er allerede avsluttet med status ${status}.`);
    this.name = "ReviewConflictError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FactCorrection = {
  metricKey: string;
  fiscalYear: number;
  value: string | null;
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
      blockingRuleCodes: true,
      qualityScore: true,
      reviewPayload: true,
      extractionRun: {
        select: {
          documentEngine: true,
          parserVersion: true,
          validationScore: true,
          confidenceScore: true,
        },
      },
    },
  });
  if (!review) throw new Error(`Review ${reviewId} ikke funnet.`);
  return review;
}

function assertPendingReview(review: { id: string; status: string }) {
  if (review.status !== "PENDING_REVIEW") {
    throw new ReviewConflictError(review.id, review.status);
  }
}

function buildRunMeta(review: Awaited<ReturnType<typeof loadReviewOrThrow>>) {
  return {
    extractionRunId: review.extractionRunId ?? null,
    documentEngine: review.extractionRun?.documentEngine ?? null,
    parserVersion: review.extractionRun?.parserVersion ?? null,
    validationScore: review.extractionRun?.validationScore ?? null,
    confidenceScore: review.extractionRun?.confidenceScore ?? null,
    blockingRuleCodes: review.blockingRuleCodes,
    qualityScore: review.qualityScore ?? null,
  };
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

  const runMeta = buildRunMeta(review);
  const selectedFacts = payload && Array.isArray(payload.selectedFacts)
    ? (payload.selectedFacts as Array<Record<string, unknown>>)
    : [];

  const labelInputs = selectedFacts.map((fact) => ({
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
    sourcePayload: { ...fact, ...runMeta, decisionType: "ACCEPTED" },
  }));

  await prisma.$transaction(async (tx) => {
    // Re-check status inside transaction to guard against concurrent updates
    const fresh = await tx.annualReportReview.findUnique({
      where: { id: reviewId },
      select: { id: true, status: true },
    });
    if (!fresh) throw new Error(`Review ${reviewId} ikke funnet.`);
    assertPendingReview(fresh);

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

    if (labelInputs.length > 0) {
      await tx.pdfTrainingLabel.createMany({
        data: labelInputs.map((l) => ({
          filingId: l.filingId,
          extractionRunId: l.extractionRunId,
          reviewId: l.reviewId,
          reviewerUserId: l.reviewerUserId,
          labelType: l.labelType,
          targetRef: l.targetRef as Prisma.InputJsonValue,
          proposedValue: l.proposedValue as Prisma.InputJsonValue,
          acceptedValue: l.acceptedValue as Prisma.InputJsonValue,
          sourcePayload: l.sourcePayload as Prisma.InputJsonValue,
        })),
      });
    }
  });

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
  const runMeta = buildRunMeta(review);

  // Build label inputs before entering transaction
  const labelInputs: Prisma.PdfTrainingLabelCreateManyInput[] = [];

  if (corrections.facts) {
    for (const fact of corrections.facts) {
      const before = _findFactBefore(
        beforePayload as Record<string, unknown> | null,
        fact.metricKey,
        fact.fiscalYear,
      );
      labelInputs.push({
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        reviewId: review.id,
        reviewerUserId,
        labelType: "FACT_VALUE",
        targetRef: { metricKey: fact.metricKey, fiscalYear: fact.fiscalYear, sourcePage: fact.sourcePage ?? null } as Prisma.InputJsonValue,
        proposedValue: before as Prisma.InputJsonValue ?? Prisma.JsonNull,
        acceptedValue: { value: fact.value, rawLabel: fact.rawLabel, unitScale: fact.unitScale, sourcePage: fact.sourcePage } as Prisma.InputJsonValue,
        sourcePayload: { ...fact, ...runMeta, decisionType: "CORRECTED" } as Prisma.InputJsonValue,
      });
    }
  }

  if (corrections.sections) {
    for (const section of corrections.sections) {
      const labelType =
        section.sectionType === "BOARD_REPORT"
          ? "BOARD_REPORT_TEXT"
          : section.sectionType === "AUDITOR_REPORT"
            ? "AUDITOR_REPORT_TEXT"
            : "PAGE_SECTION";
      labelInputs.push({
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        reviewId: review.id,
        reviewerUserId,
        labelType,
        targetRef: { sectionType: section.sectionType } as Prisma.InputJsonValue,
        proposedValue: Prisma.JsonNull,
        acceptedValue: section as Prisma.InputJsonValue,
        sourcePayload: { ...section, ...runMeta, decisionType: "CORRECTED" } as Prisma.InputJsonValue,
      });
    }
  }

  if (corrections.auditorOpinion) {
    labelInputs.push({
      filingId: review.filingId,
      extractionRunId: review.extractionRunId ?? null,
      reviewId: review.id,
      reviewerUserId,
      labelType: "AUDITOR_OPINION",
      targetRef: { fiscalYear: review.fiscalYear } as Prisma.InputJsonValue,
      proposedValue: Prisma.JsonNull,
      acceptedValue: corrections.auditorOpinion as Prisma.InputJsonValue,
      sourcePayload: { ...corrections.auditorOpinion, ...runMeta, decisionType: "CORRECTED" } as Prisma.InputJsonValue,
    });
  }

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.annualReportReview.findUnique({
      where: { id: reviewId },
      select: { id: true, status: true },
    });
    if (!fresh) throw new Error(`Review ${reviewId} ikke funnet.`);
    assertPendingReview(fresh);

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

    if (labelInputs.length > 0) {
      await tx.pdfTrainingLabel.createMany({ data: labelInputs });
    }
  });

  return { reviewId: review.id, status: "ACCEPTED" as const };
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
  const runMeta = buildRunMeta(review);

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.annualReportReview.findUnique({
      where: { id: reviewId },
      select: { id: true, status: true },
    });
    if (!fresh) throw new Error(`Review ${reviewId} ikke funnet.`);
    assertPendingReview(fresh);

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

    await tx.pdfTrainingLabel.createMany({
      data: [{
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        reviewId: review.id,
        reviewerUserId,
        labelType: "FAILURE_REASON",
        targetRef: { fiscalYear: review.fiscalYear } as Prisma.InputJsonValue,
        proposedValue: Prisma.JsonNull,
        acceptedValue: Prisma.JsonNull,
        sourcePayload: { reason, decisionType: "REJECTED", ...runMeta } as Prisma.InputJsonValue,
      }],
    });
  });

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
    const fresh = await tx.annualReportReview.findUnique({
      where: { id: reviewId },
      select: { id: true, status: true },
    });
    if (!fresh) throw new Error(`Review ${reviewId} ikke funnet.`);
    assertPendingReview(fresh);

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
  const runMeta = buildRunMeta(review);

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.annualReportReview.findUnique({
      where: { id: reviewId },
      select: { id: true, status: true },
    });
    if (!fresh) throw new Error(`Review ${reviewId} ikke funnet.`);
    assertPendingReview(fresh);

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

    await tx.pdfTrainingLabel.createMany({
      data: [{
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        reviewId: review.id,
        reviewerUserId,
        labelType: "FAILURE_REASON",
        targetRef: { fiscalYear: review.fiscalYear } as Prisma.InputJsonValue,
        proposedValue: Prisma.JsonNull,
        acceptedValue: Prisma.JsonNull,
        sourcePayload: { reason, decisionType: "UNREADABLE", ...runMeta } as Prisma.InputJsonValue,
      }],
    });
  });

  return { reviewId: review.id, status: "REJECTED" as const, filingStatus: "FAILED" as const };
}
