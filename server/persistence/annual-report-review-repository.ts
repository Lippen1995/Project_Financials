import {
  AnnualReportReviewDecisionType,
  AnnualReportReviewStatus,
  AnnualReportFilingStatus,
  PdfTrainingLabelType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Queue listing
// ---------------------------------------------------------------------------

export async function listAdminReviewQueue(options?: {
  statuses?: AnnualReportReviewStatus[];
  orgNumbers?: string[];
  fiscalYear?: number;
  ruleCodes?: string[];
  minQualityScore?: number;
  maxQualityScore?: number;
  limit?: number;
}) {
  return prisma.annualReportReview.findMany({
    where: {
      ...(options?.statuses?.length ? { status: { in: options.statuses } } : {}),
      ...(options?.ruleCodes?.length
        ? { blockingRuleCodes: { hasSome: options.ruleCodes } }
        : {}),
      ...(options?.orgNumbers?.length
        ? { company: { orgNumber: { in: options.orgNumbers } } }
        : {}),
      ...(options?.fiscalYear !== undefined ? { fiscalYear: options.fiscalYear } : {}),
      ...(options?.minQualityScore !== undefined || options?.maxQualityScore !== undefined
        ? {
            qualityScore: {
              ...(options.minQualityScore !== undefined ? { gte: options.minQualityScore } : {}),
              ...(options.maxQualityScore !== undefined ? { lte: options.maxQualityScore } : {}),
            },
          }
        : {}),
    },
    include: {
      company: {
        select: { orgNumber: true, name: true, slug: true },
      },
      filing: {
        select: {
          id: true,
          status: true,
          fiscalYear: true,
          sourceUrl: true,
          sourceDocumentType: true,
          parserVersionLastTried: true,
          lastError: true,
          manualReviewAt: true,
          updatedAt: true,
        },
      },
      extractionRun: {
        select: {
          id: true,
          status: true,
          confidenceScore: true,
          validationScore: true,
          documentEngine: true,
          documentEngineMode: true,
          parserVersion: true,
          errorMessage: true,
          finishedAt: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: options?.limit ?? 100,
  });
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getAdminReviewDetail(reviewId: string) {
  return prisma.annualReportReview.findUnique({
    where: { id: reviewId },
    include: {
      company: {
        select: { orgNumber: true, name: true, slug: true, legalForm: true },
      },
      filing: {
        include: {
          artifacts: true,
          validationIssues: {
            orderBy: [{ severity: "asc" }, { ruleCode: "asc" }],
          },
        },
      },
      extractionRun: {
        include: {
          facts: {
            orderBy: [{ statementType: "asc" }, { metricKey: "asc" }],
          },
          validationIssues: {
            orderBy: [{ severity: "asc" }, { ruleCode: "asc" }],
          },
        },
      },
      decisions: {
        orderBy: { createdAt: "desc" },
        include: {
          reviewer: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Create decision
// ---------------------------------------------------------------------------

export type CreateReviewDecisionInput = {
  reviewId: string;
  filingId: string;
  extractionRunId?: string | null;
  companyId: string;
  fiscalYear: number;
  reviewerUserId: string;
  decisionType: AnnualReportReviewDecisionType;
  beforePayload?: Prisma.InputJsonValue;
  afterPayload?: Prisma.InputJsonValue;
  correctionNotes?: string | null;
  validationPassed?: boolean | null;
  overrideReason?: string | null;
};

export async function createReviewDecision(input: CreateReviewDecisionInput) {
  return prisma.annualReportReviewDecision.create({
    data: {
      reviewId: input.reviewId,
      filingId: input.filingId,
      extractionRunId: input.extractionRunId ?? null,
      companyId: input.companyId,
      fiscalYear: input.fiscalYear,
      reviewerUserId: input.reviewerUserId,
      decisionType: input.decisionType,
      beforePayload: input.beforePayload ?? Prisma.JsonNull,
      afterPayload: input.afterPayload ?? Prisma.JsonNull,
      correctionNotes: input.correctionNotes ?? null,
      validationPassed: input.validationPassed ?? null,
      overrideReason: input.overrideReason ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Create training label
// ---------------------------------------------------------------------------

export type CreateTrainingLabelInput = {
  filingId: string;
  extractionRunId?: string | null;
  reviewId?: string | null;
  reviewerUserId: string;
  labelType: PdfTrainingLabelType;
  targetRef?: Prisma.InputJsonValue;
  proposedValue?: Prisma.InputJsonValue;
  acceptedValue?: Prisma.InputJsonValue;
  sourcePayload?: Prisma.InputJsonValue;
};

export async function createTrainingLabel(input: CreateTrainingLabelInput) {
  return prisma.pdfTrainingLabel.create({
    data: {
      filingId: input.filingId,
      extractionRunId: input.extractionRunId ?? null,
      reviewId: input.reviewId ?? null,
      reviewerUserId: input.reviewerUserId,
      labelType: input.labelType,
      targetRef: input.targetRef ?? Prisma.JsonNull,
      proposedValue: input.proposedValue ?? Prisma.JsonNull,
      acceptedValue: input.acceptedValue ?? Prisma.JsonNull,
      sourcePayload: input.sourcePayload ?? Prisma.JsonNull,
    },
  });
}

export async function createTrainingLabels(inputs: CreateTrainingLabelInput[]) {
  if (inputs.length === 0) return { count: 0 };
  return prisma.pdfTrainingLabel.createMany({
    data: inputs.map((input) => ({
      filingId: input.filingId,
      extractionRunId: input.extractionRunId ?? null,
      reviewId: input.reviewId ?? null,
      reviewerUserId: input.reviewerUserId,
      labelType: input.labelType,
      targetRef: input.targetRef ?? Prisma.JsonNull,
      proposedValue: input.proposedValue ?? Prisma.JsonNull,
      acceptedValue: input.acceptedValue ?? Prisma.JsonNull,
      sourcePayload: input.sourcePayload ?? Prisma.JsonNull,
    })),
  });
}

// ---------------------------------------------------------------------------
// Status updates
// ---------------------------------------------------------------------------

export async function setReviewStatus(
  reviewId: string,
  status: AnnualReportReviewStatus,
  latestActionNote?: string | null,
) {
  return prisma.annualReportReview.update({
    where: { id: reviewId },
    data: {
      status,
      latestActionNote: latestActionNote ?? undefined,
      resolvedAt: status === "PENDING_REVIEW" ? null : new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function setFilingStatus(filingId: string, status: AnnualReportFilingStatus) {
  return prisma.annualReportFiling.update({
    where: { id: filingId },
    data: { status, updatedAt: new Date() },
  });
}
