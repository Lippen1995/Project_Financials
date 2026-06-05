import { AnnualReportReviewStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildNormalizedFinancialPayload } from "@/integrations/brreg/annual-report-financials/normalized-payload";
import type { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import {
  getAdminReviewDetail,
  listAdminReviewQueue,
  saveReviewClientDraft,
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
  /** The reviewer's on-screen "Endelig" (manual ?? machine) for this line — the
   *  authoritative number that gets published. The client sends it for every
   *  visible row so the backend stores the grid verbatim (no machine-vs-manual
   *  re-derivation). Falls back to `value` when omitted (legacy callers). */
  finalInput?: string | null;
  /** Provenance only: whether the reviewer kept the machine value
   *  (ACCEPTED_MACHINE) or overrode it (MANUAL_CORRECTION). */
  correctionSource?: "MANUAL_CORRECTION" | "ACCEPTED_MACHINE";
  rawLabel?: string | null;
  sourcePage?: number | null;
  unitScale?: number | null;
  confidenceScore?: number | null;
  /** Per-fact konsern/selskap scope override. Falls back to the review's
   *  primary scope when omitted. */
  statementScope?: "COMPANY" | "CONSOLIDATED";
  /** Per-fact statement bucket from the client (which knows the section). Falls
   *  back to metric-key inference when omitted. */
  statementType?: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW" | "NOTE";
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
  /** Metric keys the reviewer deleted. Their machine-extracted facts are
   *  dropped (not carried over as ACCEPTED_MACHINE). */
  deletedMetricKeys?: string[];
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
    finalInput?: bigint | null;
    currency: string;
    unitScale: number;
    sourcePage: number | null;
    rawLabel: string | null;
  },
) {
  // Prefer the authoritative final value; fall back to value for legacy rows.
  const effectiveValue = fact.finalInput ?? fact.value;
  if (effectiveValue === null) {
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
    value: Number(effectiveValue),
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
export { saveReviewClientDraft };

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
            // Reviewed-fact values are already in whole NOK (canonical mapping
            // applied the page unit scale upstream). The scale here is pure
            // metadata, so normalise it to 1 — a mix of 1 and 1000 across pages
            // would otherwise trip UNIT_SCALE_INCONSISTENCY even though every
            // value is correctly in NOK.
            unitScale: 1,
            sourcePage: fact.sourcePage,
            rawLabel: fact.rawLabel,
            // The accepted/carried-over machine value is the final value.
            finalInput: fact.value,
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

    // Clear this review's existing reviewed facts before rewriting them. Save
    // is idempotent: re-saving a re-opened review must REPLACE the facts, not
    // append. Without this, createMany({skipDuplicates}) keeps the first row
    // ever written for a given (metricKey, scope, year, label) and silently
    // drops the corrected value — the "numbers revert / konsern shows selskap
    // value" bug, where a stale fact from an earlier save survived.
    await tx.annualReportReviewedFact.deleteMany({ where: { reviewId: review.id } });

    // ── Full-grid contract: the UI sends EVERY visible line with its resolved
    // "Endelig" (finalInput = manual ?? machine). We persist the grid verbatim
    // — value = finalInput, provenance from correctionSource — and skip the
    // machine-vs-manual re-derivation below. That re-derivation suppressed a
    // machine fact only when its metricKey|scope|year|label exactly matched a
    // correction; a label/scope mismatch left the buggy ACCEPTED_MACHINE value
    // in place and published it. That was the publish "krøll". Letting the UI
    // own the final value removes the whole failure class.
    const allFacts = corrections.facts ?? [];
    const isFullGridContract = allFacts.some(
      (f) => f.finalInput !== undefined && f.finalInput !== null,
    );

    if (isFullGridContract) {
      await tx.annualReportReviewedFact.createMany({
        data: allFacts.map((fact) => {
          const finalInput = safeStringToBigInt(fact.finalInput ?? fact.value);
          return {
            reviewId: review.id,
            filingId: review.filingId,
            extractionRunId: review.extractionRunId ?? null,
            companyId: review.companyId,
            fiscalYear: fact.fiscalYear,
            metricKey: fact.metricKey,
            statementType:
              (fact.statementType ??
                getStatementTypeForMetricKey(fact.metricKey) ??
                "INCOME_STATEMENT") as
                | "INCOME_STATEMENT"
                | "BALANCE_SHEET"
                | "CASH_FLOW"
                | "NOTE",
            statementScope: fact.statementScope ?? reviewScope,
            // value mirrors finalInput for back-compat; publishing reads finalInput.
            value: finalInput,
            finalInput,
            currency: "NOK",
            unitScale: 1,
            sourcePage: fact.sourcePage ?? null,
            rawLabel: fact.rawLabel ?? null,
            correctionSource: fact.correctionSource ?? "MANUAL_CORRECTION",
            reviewerUserId,
          };
        }),
        skipDuplicates: true,
      });

      if (labelInputs.length > 0) {
        await tx.pdfTrainingLabel.createMany({ data: labelInputs });
      }
      return;
    }

    // ── Legacy partial-correction contract (carry-over) ─────────────────────
    // Callers that send only CHANGED facts (no finalInput). The backend copies
    // uncorrected machine facts as ACCEPTED_MACHINE and layers the corrections
    // as MANUAL_CORRECTION. Kept for back-compat; the UI no longer uses it.

    // Build set of corrected metricKeys
    const correctedMetricKeys = new Set(
      (corrections.facts ?? []).flatMap((f) =>
        f.sourceMetricKey && f.sourceMetricKey !== f.metricKey
          ? [f.metricKey, f.sourceMetricKey]
          : [f.metricKey],
      ),
    );

    // Carry-over suppression needs two different identities:
    //
    //  1. REASSIGNED source keys — when a row's key is changed (revenue →
    //     other_operating_income), the original sourceMetricKey machine fact no
    //     longer represents anything and must be dropped by metricKey.
    //
    //  2. SAME-KEY corrections — metricKey is not a line identity (inngående vs
    //     utgående egenkapital both map to total_equity). Suppress only the
    //     SPECIFIC corrected line (metricKey+scope+year+label), so an untouched
    //     same-key machine line still carries over.
    const reassignedSourceKeys = new Set(
      (corrections.facts ?? [])
        .filter((f) => f.sourceMetricKey && f.sourceMetricKey !== f.metricKey)
        .map((f) => f.sourceMetricKey as string),
    );
    const lineIdentity = (input: {
      metricKey: string;
      statementScope?: string | null;
      fiscalYear: number;
      rawLabel?: string | null;
    }) =>
      `${input.metricKey}|${input.statementScope ?? ""}|${input.fiscalYear}|${(input.rawLabel ?? "").toLowerCase().trim()}`;
    const correctedLineIdentities = new Set(
      (corrections.facts ?? [])
        .filter((f) => (f.rawLabel ?? "").trim() !== "")
        .map((f) =>
          lineIdentity({
            metricKey: f.metricKey,
            statementScope: f.statementScope ?? reviewScope,
            fiscalYear: f.fiscalYear,
            rawLabel: f.rawLabel,
          }),
        ),
    );
    // A correction with NO label (the canonical/standardized edit path) can't
    // identify a specific line, so it suppresses by metricKey — the original
    // behaviour. Label-bearing corrections (the "Som rapportert" rowEdits path)
    // suppress only their exact line via correctedLineIdentities above.
    const correctedKeysWithoutLabel = new Set(
      (corrections.facts ?? [])
        .filter((f) => (f.rawLabel ?? "").trim() === "")
        .map((f) => f.metricKey),
    );

    // Keys the reviewer explicitly deleted: their machine facts must NOT be
    // carried over. A key that is both deleted and re-corrected is treated as
    // corrected (the correction wins).
    const deletedMetricKeys = new Set(
      (corrections.deletedMetricKeys ?? []).filter((k) => !correctedMetricKeys.has(k)),
    );

    // Fetch machine facts and copy the non-corrected ones as ACCEPTED_MACHINE
    if (review.extractionRunId) {
      const machineFacts = await tx.financialFact.findMany({
        where: { extractionRunId: review.extractionRunId },
      });
      const uncorrected = machineFacts.filter(
        (f) =>
          !reassignedSourceKeys.has(f.metricKey) &&
          !correctedKeysWithoutLabel.has(f.metricKey) &&
          !correctedLineIdentities.has(lineIdentity(f)) &&
          !deletedMetricKeys.has(f.metricKey),
      );
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
            // Reviewed-fact values are already in whole NOK (canonical mapping
            // applied the page unit scale upstream). The scale here is pure
            // metadata, so normalise it to 1 — a mix of 1 and 1000 across pages
            // would otherwise trip UNIT_SCALE_INCONSISTENCY even though every
            // value is correctly in NOK.
            unitScale: 1,
            sourcePage: fact.sourcePage,
            rawLabel: fact.rawLabel,
            // The accepted/carried-over machine value is the final value.
            finalInput: fact.value,
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
          // Each correction carries its own fiscal year (the reviewer enters
          // both the main year and the prior/comparative year). Using
          // review.fiscalYear here would collapse every prior-year value onto
          // the main year and silently drop it via the unique constraint.
          fiscalYear: fact.fiscalYear,
          metricKey: fact.metricKey,
          statementType:
            (fact.statementType ??
              getStatementTypeForMetricKey(fact.metricKey) ??
              "INCOME_STATEMENT") as
              | "INCOME_STATEMENT"
              | "BALANCE_SHEET"
              | "CASH_FLOW"
              | "NOTE",
          statementScope: fact.statementScope ?? reviewScope,
          value: safeStringToBigInt(fact.value),
          finalInput: safeStringToBigInt(fact.value),
          currency: "NOK",
          // The reviewer enters values in whole NOK, so the stored scale is
          // always 1 (consistent with the normalised ACCEPTED_MACHINE facts).
          unitScale: 1,
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
// Re-open a resolved review
// ---------------------------------------------------------------------------

/**
 * Re-opens an ACCEPTED review back to PENDING_REVIEW so the reviewer can fix
 * data without a DB reset. The durable clientDraft is preserved (it is the
 * source the form rehydrates from), so all prior edits reappear. Published
 * data is left untouched — re-opening does not unpublish; a subsequent save
 * republishes idempotently.
 */
export async function reopenAnnualReportReview(reviewId: string, reviewerUserId: string) {
  const review = await prisma.annualReportReview.findUnique({
    where: { id: reviewId },
    select: { id: true, status: true, filingId: true, companyId: true, fiscalYear: true, extractionRunId: true },
  });
  if (!review) throw new Error(`Review ${reviewId} ikke funnet.`);
  if (review.status !== "ACCEPTED") {
    throw new ReviewConflictError(review.id, review.status);
  }

  await prisma.$transaction(async (tx) => {
    await tx.annualReportReview.update({
      where: { id: review.id },
      data: { status: "PENDING_REVIEW", resolvedAt: null, updatedAt: new Date() },
    });
    await tx.annualReportReviewDecision.create({
      data: {
        reviewId: review.id,
        filingId: review.filingId,
        extractionRunId: review.extractionRunId ?? null,
        companyId: review.companyId,
        fiscalYear: review.fiscalYear,
        reviewerUserId,
        decisionType: "REOPENED",
        correctionNotes: "Gjenåpnet for redigering.",
      },
    });
  });

  return { reviewId: review.id, status: "PENDING_REVIEW" as const };
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
  overriddenRuleCodes?: string[],
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
    statementScope: f.statementScope,
    // Validate (and publish) against the authoritative final value.
    value: f.finalInput ?? f.value,
    unitScale: f.unitScale,
    sourcePage: f.sourcePage,
    rawLabel: f.rawLabel,
  }));

  const result = validateReviewedFacts(validationFacts, { overriddenRuleCodes });
  return serializeValidationPayload(result, facts.length);
}

// ---------------------------------------------------------------------------
// Publish reviewed facts
// ---------------------------------------------------------------------------

export async function publishReviewedAnnualReportFacts(
  reviewId: string,
  reviewerUserId: string,
  overriddenRuleCodes?: string[],
): Promise<
  | { published: true; fiscalYear: number; companyId: string; publishedYears: number[]; skippedYears: number[] }
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
    statementScope: f.statementScope,
    // Validate (and publish) against the authoritative final value.
    value: f.finalInput ?? f.value,
    unitScale: f.unitScale,
    sourcePage: f.sourcePage,
    rawLabel: f.rawLabel,
  }));
  const validationResult = validateReviewedFacts(validationFacts, { overriddenRuleCodes });
  if (validationResult.hasBlockingErrors) {
    const payload = serializeValidationPayload(validationResult, facts.length);
    return { published: false, issues: payload.blockingIssues };
  }

  // ── Two-year publish rule: newer report wins for any given year ──────────
  // A 2024 report carries 2024 (main) + 2023 (comparative). We publish a year
  // from this review ONLY when no NEWER report has already published that year.
  // Example: once the 2024 report is published, working the 2023 report must
  // publish only 2022 — the 2024 report's 2023 figures (which may restate
  // history) win. Years already covered by a newer filing are skipped.
  const factYears = Array.from(new Set(facts.map((f) => f.fiscalYear))).sort((a, b) => a - b);
  const newerStatements = await prisma.financialStatement.findMany({
    where: {
      companyId: review.companyId,
      fiscalYear: { in: factYears },
      sourceFiling: { is: { fiscalYear: { gt: review.fiscalYear } } },
    },
    select: { fiscalYear: true },
  });
  const yearsOwnedByNewerReport = new Set(newerStatements.map((s) => s.fiscalYear));
  const publishYears = factYears.filter((y) => !yearsOwnedByNewerReport.has(y));
  const skippedYears = factYears.filter((y) => yearsOwnedByNewerReport.has(y));

  const hasManualCorrection = facts.some((f) => f.correctionSource === "MANUAL_CORRECTION");
  const qualityStatus = hasManualCorrection ? "MANUAL_REVIEW" : "HIGH_CONFIDENCE";
  const unitScale = facts.find((f) => f.value !== null)?.unitScale ?? 1;
  const publishedAt = new Date();

  // Publish one FinancialStatement summary per (publishable year × scope). A
  // group report has both COMPANY (morselskap) and CONSOLIDATED (konsern)
  // figures; each is its own summary row keyed by [company, year, scope].
  const scopes: Array<"COMPANY" | "CONSOLIDATED"> = ["COMPANY", "CONSOLIDATED"];
  for (const year of publishYears) {
    for (const scope of scopes) {
      const yearScopeFacts = facts.filter(
        // A missing scope defaults to COMPANY (the DB column default), so legacy
        // facts without an explicit scope still publish under COMPANY.
        (f) => f.fiscalYear === year && (f.statementScope ?? "COMPANY") === scope,
      );
      if (yearScopeFacts.length === 0) continue;

      const factMap = new Map(yearScopeFacts.map((f) => [f.metricKey, f]));
      // Revenue for the summary: prefer the operating-income TOTAL, then the
      // sales line. Different filings map their income total to different keys
      // (total_revenue vs total_operating_income), and some only have the
      // sales-line `revenue`. Without total_revenue here the summary showed a
      // null revenue even though the line item was published correctly.
      // Summary figures source from the authoritative final value, same as the
      // published line items below.
      const fin = (key: string): bigint | null => {
        const f = factMap.get(key);
        return f ? (f.finalInput ?? f.value) : null;
      };
      const revenue =
        fin("total_revenue") ??
        fin("total_operating_income") ??
        fin("revenue") ??
        null;
      const operatingProfit = fin("operating_profit");
      const netIncome = fin("net_income");
      const equity = fin("total_equity");
      const assets = fin("total_assets");

      const selectedFacts = new Map(
        yearScopeFacts
          .map((fact) => reviewedFactToCandidate(fact))
          .filter((fact): fact is NonNullable<ReturnType<typeof reviewedFactToCandidate>> => fact !== null)
          .map((fact) => [fact.metricKey, fact]),
      );
      const normalizedPayload = buildNormalizedFinancialPayload(year, selectedFacts);

      await publishFinancialStatementSnapshot({
        companyId: review.companyId,
        fiscalYear: year,
        statementScope: scope,
        currency: "NOK",
        revenue: revenue === null ? null : Number(revenue),
        operatingProfit: operatingProfit === null ? null : Number(operatingProfit),
        netIncome: netIncome === null ? null : Number(netIncome),
        equity: equity === null ? null : Number(equity),
        assets: assets === null ? null : Number(assets),
        sourceSystem: "PROJECT_FINANCIALS_REVIEW",
        sourceEntityType: "annualReportReviewedFact",
        sourceId: `review:${review.id}:${year}:${scope}`,
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
    }
  }

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

      // Publish the full "as reported" line items to the dedicated store the
      // company page reads. Only years this review is allowed to own are
      // written (a newer report already owns the skipped years). Delete-then-
      // insert per filing keeps republish idempotent; the extraction pipeline
      // never writes here, so a later reprocess can never overwrite published
      // manual-review data.
      const publishableFacts = facts.filter((f) => publishYears.includes(f.fiscalYear));
      await tx.publishedFinancialLineItem.deleteMany({
        where: { filingId: review.filingId },
      });
      await tx.publishedFinancialLineItem.createMany({
        data: publishableFacts.map((fact, index) => {
          // Publish ONLY the final value. value mirrors finalInput for the many
          // existing readers of PublishedFinancialLineItem.value.
          const finalInput = fact.finalInput ?? fact.value;
          return {
          companyId: review.companyId,
          filingId: review.filingId,
          fiscalYear: fact.fiscalYear,
          statementType: fact.statementType,
          statementScope: fact.statementScope,
          metricKey: fact.metricKey,
          rawLabel: fact.rawLabel,
          value: finalInput,
          finalInput,
          currency: fact.currency ?? "NOK",
          unitScale: fact.unitScale ?? 1,
          sourcePage: fact.sourcePage,
          sortOrder: index,
          reviewId: review.id,
          reviewerUserId,
          publishedAt,
          };
        }),
      });

      const skipNote =
        skippedYears.length > 0
          ? ` Hoppet over ${skippedYears.join(", ")} (eies av nyere rapport).`
          : "";
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
          correctionNotes: `Publisert ${publishableFacts.length} reviewed facts for år ${publishYears.join(", ")} (${hasManualCorrection ? "med manuelle korreksjoner" : "maskinuttak godkjent"}).${skipNote}`,
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

  return {
    published: true,
    fiscalYear: review.fiscalYear,
    companyId: review.companyId,
    publishedYears: publishYears,
    skippedYears,
  };
}

export async function finalizeAnnualReportReviewAndPublish(input: {
  reviewId: string;
  reviewerUserId: string;
  overriddenRuleCodes?: string[];
}) {
  const result = await publishReviewedAnnualReportFacts(
    input.reviewId,
    input.reviewerUserId,
    input.overriddenRuleCodes,
  );
  // A validation block is NOT an error: the corrections are already saved.
  // Return a structured "not published" result so the caller (and UI) can show
  // the blocking issues and let the reviewer fix or override them, instead of
  // surfacing a 500 that hides why nothing published.
  if (!result.published) {
    return {
      reviewId: input.reviewId,
      status: "ACCEPTED" as const,
      published: false as const,
      blockingIssues: result.issues,
      message:
        "Lagret, men publisering er blokkert av validering. Løs eller overstyr feilene og publiser på nytt.",
    };
  }

  const skipNote =
    result.skippedYears.length > 0
      ? ` Skipped ${result.skippedYears.join(", ")} (owned by a newer report).`
      : "";
  return {
    reviewId: input.reviewId,
    status: "ACCEPTED" as const,
    published: true as const,
    fiscalYear: result.fiscalYear,
    companyId: result.companyId,
    publishedYears: result.publishedYears,
    skippedYears: result.skippedYears,
    message: `Reviewed values saved and published for ${result.publishedYears.join(", ")}.${skipNote}`,
  };
}
