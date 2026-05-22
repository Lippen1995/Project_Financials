import { AnnualReportReviewStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildNormalizedFinancialPayload } from "@/integrations/brreg/annual-report-financials/normalized-payload";
import type { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import {
  getAdminReviewDetail,
  listAdminReviewQueue,
} from "@/server/persistence/annual-report-review-repository";
import {
  publishFinancialStatementSnapshot,
  upsertCompanyFinancialCoverage,
} from "@/server/persistence/annual-report-ingestion-repository";
import { getStatementTypeForMetricKey } from "@/integrations/brreg/annual-report-financials/taxonomy";
import {
  validateReviewedFacts,
  serializeValidationPayload,
  type ReviewedFactForValidation,
  type ReviewedFactsValidationPayload,
} from "@/server/services/annual-report-reviewed-facts-validation";

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
  sourceMetricKey?: string | null;
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

// Re-export for consumers that import from this module
export type { ReviewedFactsValidationPayload as ReviewedFactsValidationResult } from "@/server/services/annual-report-reviewed-facts-validation";

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

function safeStringToBigInt(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  try {
    return BigInt(value.trim());
  } catch {
    return null;
  }
}

function reviewedFactToCandidate(
  fact: {
    metricKey: string;
    fiscalYear: number;
    statementType: string;
    statementScope?: "COMPANY" | "CONSOLIDATED";
    value: bigint | null;
    currency: string;
    unitScale: number;
    sourcePage: number | null;
    rawLabel: string | null;
  },
) {
  if (fact.value === null) {
    return null;
  }

  return {
    fiscalYear: fact.fiscalYear,
    statementType:
      fact.statementType === "BALANCE_SHEET"
        ? "BALANCE_SHEET"
        : fact.statementType === "NOTE"
            ? "NOTE"
            : "INCOME_STATEMENT",
    statementScope: fact.statementScope ?? "COMPANY",
    metricKey: fact.metricKey as CanonicalFactCandidate["metricKey"],
    rawLabel: fact.rawLabel ?? fact.metricKey,
    normalizedLabel: fact.metricKey,
    value: Number(fact.value),
    currency: fact.currency,
    unitScale: (fact.unitScale === 1000 ? 1000 : 1) as CanonicalFactCandidate["unitScale"],
    sourcePage: fact.sourcePage ?? 0,
    sourceSection:
      fact.statementType === "BALANCE_SHEET" ? "STATUTORY_BALANCE" : "STATUTORY_INCOME",
    sourceRowText: fact.rawLabel ?? fact.metricKey,
    noteReference: null,
    confidenceScore: 1,
    precedence: "STATUTORY_NOK",
    isDerived: false,
    rawPayload: {
      reviewed: true,
    },
  } satisfies CanonicalFactCandidate;
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

/**
 * Maps filing IDs to their most recent AnnualReportReview id. Used so that
 * the gold-set test queue can link "Åpne kontroll" straight to the real
 * review workspace instead of the gold-set candidate detail page.
 *
 * A filing without any review is simply absent from the returned map.
 */
export async function getLatestReviewIdsByFilingIds(
  filingIds: string[],
): Promise<Map<string, string>> {
  if (filingIds.length === 0) {
    return new Map();
  }
  const reviews = await prisma.annualReportReview.findMany({
    where: { filingId: { in: filingIds } },
    select: { id: true, filingId: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  const map = new Map<string, string>();
  for (const review of reviews) {
    if (!map.has(review.filingId)) {
      map.set(review.filingId, review.id);
    }
  }
  return map;
}

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
    // Re-check status inside transaction
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

    // Copy machine facts to reviewed facts as ACCEPTED_MACHINE
    if (review.extractionRunId) {
      const machineFacts = await tx.financialFact.findMany({
        where: { extractionRunId: review.extractionRunId },
      });
      if (machineFacts.length > 0) {
        await tx.annualReportReviewedFact.createMany({
          data: machineFacts.map((fact) => ({
            reviewId: review.id,
            filingId: fact.filingId,
            extractionRunId: fact.extractionRunId,
            companyId: fact.companyId,
            fiscalYear: fact.fiscalYear,
            metricKey: fact.metricKey,
            statementType: fact.statementType,
            statementScope: fact.statementScope,
            value: fact.value,
            currency: fact.currency,
            unitScale: fact.unitScale,
            sourcePage: fact.sourcePage,
            rawLabel: fact.rawLabel,
            correctionSource: "ACCEPTED_MACHINE" as const,
            reviewerUserId,
          })),
          skipDuplicates: true,
        });
      }
    }

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

  return finalizeAnnualReportReviewAndPublish({
    reviewId: review.id,
    reviewerUserId,
  });
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

  // Derive the financial statement scope (konsern vs. selskap) this review covers.
  // Manual corrections must be tagged with the same scope as the report under review,
  // otherwise konsern corrections would be mis-stored as selskap (parent) figures.
  const reviewScope: "COMPANY" | "CONSOLIDATED" =
    (beforePayload as Record<string, unknown> | null)?.statementScope === "CONSOLIDATED"
      ? "CONSOLIDATED"
      : "COMPANY";

  // Build label inputs before entering transaction
  const labelInputs: Prisma.PdfTrainingLabelCreateManyInput[] = [];

  if (corrections.facts) {
    for (const fact of corrections.facts) {
      const before = _findFactBefore(
        beforePayload as Record<string, unknown> | null,
        fact.sourceMetricKey ?? fact.metricKey,
        fact.fiscalYear,
      );
      labelInputs.push({
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        reviewId: review.id,
        reviewerUserId,
        labelType: "FACT_VALUE",
        targetRef: {
          metricKey: fact.metricKey,
          sourceMetricKey: fact.sourceMetricKey ?? null,
          fiscalYear: fact.fiscalYear,
          sourcePage: fact.sourcePage ?? null,
        } as Prisma.InputJsonValue,
        proposedValue: before as Prisma.InputJsonValue ?? Prisma.JsonNull,
        acceptedValue: {
          value: fact.value,
          rawLabel: fact.rawLabel,
          unitScale: fact.unitScale,
          sourcePage: fact.sourcePage,
          sourceMetricKey: fact.sourceMetricKey ?? null,
        } as Prisma.InputJsonValue,
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

    // Build set of corrected metricKeys
    const correctedMetricKeys = new Set(
      (corrections.facts ?? []).flatMap((f) =>
        f.sourceMetricKey && f.sourceMetricKey !== f.metricKey
          ? [f.metricKey, f.sourceMetricKey]
          : [f.metricKey],
      ),
    );

    // Fetch machine facts and copy the non-corrected ones as ACCEPTED_MACHINE
    if (review.extractionRunId) {
      const machineFacts = await tx.financialFact.findMany({
        where: { extractionRunId: review.extractionRunId },
      });
      const uncorrected = machineFacts.filter((f) => !correctedMetricKeys.has(f.metricKey));
      if (uncorrected.length > 0) {
        await tx.annualReportReviewedFact.createMany({
          data: uncorrected.map((fact) => ({
            reviewId: review.id,
            filingId: fact.filingId,
            extractionRunId: fact.extractionRunId,
            companyId: fact.companyId,
            fiscalYear: fact.fiscalYear,
            metricKey: fact.metricKey,
            statementType: fact.statementType,
            statementScope: fact.statementScope,
            value: fact.value,
            currency: fact.currency,
            unitScale: fact.unitScale,
            sourcePage: fact.sourcePage,
            rawLabel: fact.rawLabel,
            correctionSource: "ACCEPTED_MACHINE" as const,
            reviewerUserId,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Store corrected facts as MANUAL_CORRECTION
    if ((corrections.facts ?? []).length > 0) {
      await tx.annualReportReviewedFact.createMany({
        data: (corrections.facts ?? []).map((fact) => ({
          reviewId: review.id,
          filingId: review.filingId,
          extractionRunId: review.extractionRunId ?? null,
          companyId: review.companyId,
          fiscalYear: review.fiscalYear,
          metricKey: fact.metricKey,
          statementType:
            (getStatementTypeForMetricKey(fact.metricKey) ?? "INCOME_STATEMENT") as
              | "INCOME_STATEMENT"
              | "BALANCE_SHEET"
              | "CASH_FLOW"
              | "NOTE",
          statementScope: reviewScope,
          value: safeStringToBigInt(fact.value),
          currency: "NOK",
          unitScale: fact.unitScale ?? 1,
          sourcePage: fact.sourcePage ?? null,
          rawLabel: fact.rawLabel ?? null,
          correctionSource: "MANUAL_CORRECTION" as const,
          reviewerUserId,
        })),
        skipDuplicates: true,
      });
    }

    if (labelInputs.length > 0) {
      await tx.pdfTrainingLabel.createMany({ data: labelInputs });
    }
  });

  return finalizeAnnualReportReviewAndPublish({
    reviewId: review.id,
    reviewerUserId,
  });
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

// ---------------------------------------------------------------------------
// Validate reviewed facts
// ---------------------------------------------------------------------------

export async function validateReviewedAnnualReportFacts(
  reviewId: string,
): Promise<ReviewedFactsValidationPayload> {
  const facts = await prisma.annualReportReviewedFact.findMany({
    where: { reviewId },
  });

  if (facts.length === 0) {
    return {
      passed: false,
      validationScore: 0,
      hasBlockingErrors: true,
      blockingIssues: [
        {
          severity: "ERROR",
          ruleCode: "NO_REVIEWED_FACTS",
          message: "Ingen reviewed facts funnet for dette review.",
        },
      ],
      warnings: [],
      issues: [
        {
          severity: "ERROR",
          ruleCode: "NO_REVIEWED_FACTS",
          message: "Ingen reviewed facts funnet for dette review.",
        },
      ],
      reviewedFactCount: 0,
    };
  }

  const validationFacts: ReviewedFactForValidation[] = facts.map((f) => ({
    metricKey: f.metricKey,
    fiscalYear: f.fiscalYear,
    statementType: f.statementType,
    value: f.value,
    unitScale: f.unitScale,
    sourcePage: f.sourcePage,
    rawLabel: f.rawLabel,
  }));

  const result = validateReviewedFacts(validationFacts);
  return serializeValidationPayload(result, facts.length);
}

// ---------------------------------------------------------------------------
// Publish reviewed facts
// ---------------------------------------------------------------------------

export async function publishReviewedAnnualReportFacts(
  reviewId: string,
  reviewerUserId: string,
): Promise<
  | { published: true; fiscalYear: number; companyId: string }
  | { published: false; issues: ReviewedFactsValidationPayload["blockingIssues"] }
> {
  const review = await prisma.annualReportReview.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      filingId: true,
      extractionRunId: true,
      companyId: true,
      fiscalYear: true,
      status: true,
    },
  });
  if (!review) throw new Error(`Review ${reviewId} ikke funnet.`);

  if (review.status !== "ACCEPTED") {
    throw new Error(
      `Review ${reviewId} kan ikke publiseres: status er ${review.status}, krever ACCEPTED.`,
    );
  }

  const facts = await prisma.annualReportReviewedFact.findMany({
    where: { reviewId },
  });

  if (facts.length === 0) {
    return {
      published: false,
      issues: [
        {
          severity: "ERROR",
          ruleCode: "NO_REVIEWED_FACTS",
          message: "Ingen reviewed facts å publisere.",
        },
      ],
    };
  }

  // Use BigInt-safe internal validation (no Number() conversion)
  const validationFacts: ReviewedFactForValidation[] = facts.map((f) => ({
    metricKey: f.metricKey,
    fiscalYear: f.fiscalYear,
    statementType: f.statementType,
    value: f.value,
    unitScale: f.unitScale,
    sourcePage: f.sourcePage,
    rawLabel: f.rawLabel,
  }));
  const validationResult = validateReviewedFacts(validationFacts);
  if (validationResult.hasBlockingErrors) {
    const payload = serializeValidationPayload(validationResult, facts.length);
    return { published: false, issues: payload.blockingIssues };
  }

  const factMap = new Map(facts.map((f) => [f.metricKey, f]));
  const revenue = factMap.get("revenue")?.value ?? factMap.get("total_operating_income")?.value ?? null;
  const operatingProfit = factMap.get("operating_profit")?.value ?? null;
  const netIncome = factMap.get("net_income")?.value ?? null;
  const equity = factMap.get("total_equity")?.value ?? null;
  const assets = factMap.get("total_assets")?.value ?? null;
  const unitScale = facts.find((f) => f.value !== null)?.unitScale ?? 1;
  const hasManualCorrection = facts.some((f) => f.correctionSource === "MANUAL_CORRECTION");
  const qualityStatus = hasManualCorrection ? "MANUAL_REVIEW" : "HIGH_CONFIDENCE";
  const selectedFacts = new Map(
    facts
      .map((fact) => reviewedFactToCandidate(fact))
      .filter((fact): fact is NonNullable<ReturnType<typeof reviewedFactToCandidate>> => fact !== null)
      .map((fact) => [fact.metricKey, fact]),
  );

  const publishedAt = new Date();
  const sourceId = `review:${review.id}`;
  const normalizedPayload = buildNormalizedFinancialPayload(review.fiscalYear, selectedFacts);

  // Reviewed facts carry their own scope; publish under the dominant one.
  const publishScope: "COMPANY" | "CONSOLIDATED" = facts.some(
    (f) => (f as { statementScope?: string }).statementScope === "CONSOLIDATED",
  )
    ? "CONSOLIDATED"
    : "COMPANY";

  await publishFinancialStatementSnapshot({
    companyId: review.companyId,
    fiscalYear: review.fiscalYear,
    statementScope: publishScope,
    currency: "NOK",
    revenue: revenue === null ? null : Number(revenue),
    operatingProfit: operatingProfit === null ? null : Number(operatingProfit),
    netIncome: netIncome === null ? null : Number(netIncome),
    equity: equity === null ? null : Number(equity),
    assets: assets === null ? null : Number(assets),
    sourceSystem: "PROJECT_FINANCIALS_REVIEW",
    sourceEntityType: "annualReportReviewedFact",
    sourceId,
    fetchedAt: publishedAt,
    normalizedAt: publishedAt,
    rawPayload: normalizedPayload as unknown as Prisma.InputJsonValue,
    sourceFilingId: review.filingId,
    sourceExtractionRunId: review.extractionRunId ?? null,
    qualityStatus,
    qualityScore: 1.0,
    unitScale,
    sourcePrecedence: "STATUTORY_NOK",
    publishedAt,
  });

  await prisma.$transaction(
    async (tx) => {
      await tx.annualReportFiling.update({
        where: { id: review.filingId },
        data: {
          status: "PUBLISHED",
          publishedSnapshotAt: publishedAt,
          updatedAt: publishedAt,
        },
      });

      await tx.annualReportReviewDecision.create({
        data: {
          reviewId: review.id,
          filingId: review.filingId,
          extractionRunId: review.extractionRunId ?? null,
          companyId: review.companyId,
          fiscalYear: review.fiscalYear,
          reviewerUserId,
          decisionType: "PUBLISHED_FROM_REVIEW",
          validationPassed: true,
          correctionNotes: `Publisert ${facts.length} reviewed facts (${hasManualCorrection ? "med manuelle korreksjoner" : "maskinuttak godkjent"}).`,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await upsertCompanyFinancialCoverage({
    companyId: review.companyId,
    latestPublishedFiscalYear: review.fiscalYear,
    lastCheckedAt: publishedAt,
    nextCheckAt: new Date(publishedAt.getTime() + 24 * 60 * 60 * 1000),
    coverageStatus: "PUBLISHED",
    latestSuccessfulFilingId: review.filingId,
  });

  return { published: true, fiscalYear: review.fiscalYear, companyId: review.companyId };
}

export async function finalizeAnnualReportReviewAndPublish(input: {
  reviewId: string;
  reviewerUserId: string;
}) {
  const result = await publishReviewedAnnualReportFacts(input.reviewId, input.reviewerUserId);
  if (!result.published) {
    throw new Error(
      result.issues.map((issue) => `${issue.ruleCode}: ${issue.message}`).join(" | "),
    );
  }

  return {
    reviewId: input.reviewId,
    status: "ACCEPTED" as const,
    published: true as const,
    fiscalYear: result.fiscalYear,
    companyId: result.companyId,
    message: "Reviewed values saved and published to the active financial statement.",
  };
}
