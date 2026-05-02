import { AnnualReportReviewStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getAdminReviewDetail,
  listAdminReviewQueue,
} from "@/server/persistence/annual-report-review-repository";
import { upsertCompanyFinancialCoverage } from "@/server/persistence/annual-report-ingestion-repository";
import { validateCanonicalFacts } from "@/integrations/brreg/annual-report-financials/validation";
import { getStatementTypeForMetricKey } from "@/integrations/brreg/annual-report-financials/taxonomy";
import { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";

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

export type ReviewedFactsValidationResult = {
  passed: boolean;
  blockingIssues: Array<{
    ruleCode: string;
    message: string;
    expectedValue?: number | null;
    actualValue?: number | null;
  }>;
  warnings: Array<{
    ruleCode: string;
    message: string;
    expectedValue?: number | null;
    actualValue?: number | null;
  }>;
  reviewedFactCount: number;
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

function safeStringToBigInt(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  try {
    return BigInt(value.trim());
  } catch {
    return null;
  }
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

    // Build set of corrected metricKeys
    const correctedMetricKeys = new Set((corrections.facts ?? []).map((f) => f.metricKey));

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

// ---------------------------------------------------------------------------
// Validate reviewed facts
// ---------------------------------------------------------------------------

export async function validateReviewedAnnualReportFacts(
  reviewId: string,
): Promise<ReviewedFactsValidationResult> {
  const facts = await prisma.annualReportReviewedFact.findMany({
    where: { reviewId },
  });

  if (facts.length === 0) {
    return {
      passed: false,
      blockingIssues: [{ ruleCode: "NO_REVIEWED_FACTS", message: "Ingen reviewed facts funnet for dette review." }],
      warnings: [],
      reviewedFactCount: 0,
    };
  }

  const preIssues: ReviewedFactsValidationResult["blockingIssues"] = [];
  const preWarnings: ReviewedFactsValidationResult["warnings"] = [];

  // Fiscal year consistency
  const fiscalYears = new Set(facts.map((f) => f.fiscalYear));
  if (fiscalYears.size > 1) {
    preIssues.push({
      ruleCode: "MIXED_FISCAL_YEARS",
      message: `Reviewed facts har blandede regnskapsår: ${Array.from(fiscalYears).join(", ")}.`,
    });
  }

  // Unit scale consistency across non-null facts
  const nonNullFacts = facts.filter((f) => f.value !== null);
  const unitScales = new Set(nonNullFacts.map((f) => f.unitScale));
  if (unitScales.size > 1) {
    preIssues.push({
      ruleCode: "UNIT_SCALE_INCONSISTENCY",
      message: `Motstridende enhetsskalaer funnet: ${Array.from(unitScales).join(", ")}.`,
    });
  }

  // Convert to CanonicalFactCandidate (skip null-value facts)
  const candidates: CanonicalFactCandidate[] = nonNullFacts.map((f) => ({
    fiscalYear: f.fiscalYear,
    statementType: f.statementType as "INCOME_STATEMENT" | "BALANCE_SHEET" | "NOTE",
    metricKey: f.metricKey,
    rawLabel: f.rawLabel ?? f.metricKey,
    normalizedLabel: f.metricKey,
    value: Number(f.value!),
    currency: f.currency,
    unitScale: f.unitScale,
    sourcePage: f.sourcePage ?? 0,
    sourceSection: f.statementType,
    sourceRowText: f.rawLabel ?? f.metricKey,
    noteReference: null,
    confidenceScore: 1.0,
    precedence: "STATUTORY_NOK",
    isDerived: false,
    rawPayload: {},
  }));

  const validation = validateCanonicalFacts(candidates);

  const blockingIssues = [
    ...preIssues,
    ...validation.issues
      .filter((i) => i.severity === "ERROR")
      .map((i) => ({
        ruleCode: i.ruleCode,
        message: i.message,
        expectedValue: i.expectedValue ?? null,
        actualValue: i.actualValue ?? null,
      })),
  ];

  const warnings = [
    ...preWarnings,
    ...validation.issues
      .filter((i) => i.severity === "WARNING")
      .map((i) => ({
        ruleCode: i.ruleCode,
        message: i.message,
        expectedValue: i.expectedValue ?? null,
        actualValue: i.actualValue ?? null,
      })),
  ];

  return {
    passed: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    reviewedFactCount: facts.length,
  };
}

// ---------------------------------------------------------------------------
// Publish reviewed facts
// ---------------------------------------------------------------------------

export async function publishReviewedAnnualReportFacts(
  reviewId: string,
  reviewerUserId: string,
): Promise<
  | { published: true; fiscalYear: number; companyId: string }
  | { published: false; issues: ReviewedFactsValidationResult["blockingIssues"] }
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
      issues: [{ ruleCode: "NO_REVIEWED_FACTS", message: "Ingen reviewed facts å publisere." }],
    };
  }

  const validation = await validateReviewedAnnualReportFacts(reviewId);
  if (!validation.passed) {
    return { published: false, issues: validation.blockingIssues };
  }

  const factMap = new Map(facts.map((f) => [f.metricKey, f]));
  const revenue = factMap.get("revenue")?.value ?? factMap.get("total_operating_income")?.value ?? null;
  const operatingProfit = factMap.get("operating_profit")?.value ?? null;
  const netIncome = factMap.get("net_income")?.value ?? null;
  const equity = factMap.get("total_equity")?.value ?? null;
  const assets = factMap.get("total_assets")?.value ?? null;
  const unitScale = facts.find((f) => f.value !== null)?.unitScale ?? 1;
  const hasManuaCorrection = facts.some((f) => f.correctionSource === "MANUAL_CORRECTION");
  const qualityStatus = hasManuaCorrection ? "MANUAL_REVIEW" : "HIGH_CONFIDENCE";

  const publishedAt = new Date();
  const sourceId = `review:${review.id}`;

  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.financialStatement.findUnique({
        where: {
          companyId_fiscalYear: {
            companyId: review.companyId,
            fiscalYear: review.fiscalYear,
          },
        },
      });

      // Only replace if we don't have a higher-confidence existing entry from a different review
      const canReplace =
        !existing ||
        existing.sourceId === sourceId ||
        existing.qualityStatus !== "HIGH_CONFIDENCE" ||
        qualityStatus === "HIGH_CONFIDENCE";

      if (canReplace) {
        await tx.financialStatement.upsert({
          where: {
            companyId_fiscalYear: {
              companyId: review.companyId,
              fiscalYear: review.fiscalYear,
            },
          },
          create: {
            companyId: review.companyId,
            fiscalYear: review.fiscalYear,
            currency: "NOK",
            revenue,
            operatingProfit,
            netIncome,
            equity,
            assets,
            sourceSystem: "BRREG_REVIEWED",
            sourceEntityType: "annualReportReview",
            sourceId,
            fetchedAt: publishedAt,
            normalizedAt: publishedAt,
            rawPayload: { reviewId, reviewedFactCount: facts.length, publishedFromReview: true } as Prisma.InputJsonValue,
            sourceFilingId: review.filingId,
            sourceExtractionRunId: review.extractionRunId ?? null,
            qualityStatus,
            qualityScore: 1.0,
            unitScale,
            sourcePrecedence: "STATUTORY_NOK",
            publishedAt,
          },
          update: {
            currency: "NOK",
            revenue,
            operatingProfit,
            netIncome,
            equity,
            assets,
            sourceSystem: "BRREG_REVIEWED",
            sourceEntityType: "annualReportReview",
            sourceId,
            fetchedAt: publishedAt,
            normalizedAt: publishedAt,
            rawPayload: { reviewId, reviewedFactCount: facts.length, publishedFromReview: true } as Prisma.InputJsonValue,
            sourceFilingId: review.filingId,
            sourceExtractionRunId: review.extractionRunId ?? null,
            qualityStatus,
            qualityScore: 1.0,
            unitScale,
            sourcePrecedence: "STATUTORY_NOK",
            publishedAt,
          },
        });
      }

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
          correctionNotes: `Publisert ${facts.length} reviewed facts (${hasManuaCorrection ? "med manuelle korreksjoner" : "maskinuttak godkjent"}).`,
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
