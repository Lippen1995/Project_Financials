import {
  PdfDecisionGoldSetReason,
  PdfDecisionGoldSetStatus,
} from "@prisma/client";

import type {
  PdfDecisionShadowDocument,
  PdfDecisionShadowOutcome,
} from "@/server/services/annual-report-pdf-decision-shadow-evaluation";
import {
  deletePdfDecisionGoldSetItem,
  getPdfDecisionGoldSetItemByFilingId,
  listPdfDecisionGoldSetItems,
  upsertPdfDecisionGoldSetItem as upsertPdfDecisionGoldSetItemRecord,
} from "@/server/persistence/pdf-decision-gold-set-repository";

export type JsonSafePdfDecisionGoldSetItem = {
  id: string;
  filingId: string;
  extractionRunId: string | null;
  orgNumber: string | null;
  fiscalYear: number | null;
  status: PdfDecisionGoldSetStatus;
  reason: PdfDecisionGoldSetReason;
  note: string | null;
  decisionRoute: string | null;
  riskLevel: string | null;
  confidenceScore: number | null;
  outcome: string | null;
  source: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export class PdfDecisionGoldSetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfDecisionGoldSetValidationError";
  }
}

function toJsonSafe(item: {
  id: string;
  filingId: string;
  extractionRunId: string | null;
  orgNumber: string | null;
  fiscalYear: number | null;
  status: PdfDecisionGoldSetStatus;
  reason: PdfDecisionGoldSetReason;
  note: string | null;
  decisionRoute: string | null;
  riskLevel: string | null;
  confidenceScore: number | null;
  outcome: string | null;
  source: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): JsonSafePdfDecisionGoldSetItem {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function parseStatus(status: string): PdfDecisionGoldSetStatus {
  if (
    status === PdfDecisionGoldSetStatus.CANDIDATE ||
    status === PdfDecisionGoldSetStatus.APPROVED ||
    status === PdfDecisionGoldSetStatus.EXCLUDED
  ) {
    return status;
  }
  throw new PdfDecisionGoldSetValidationError(`Invalid gold-set status: ${status}`);
}

function parseReason(reason: string): PdfDecisionGoldSetReason {
  if (
    Object.values(PdfDecisionGoldSetReason).includes(
      reason as PdfDecisionGoldSetReason,
    )
  ) {
    return reason as PdfDecisionGoldSetReason;
  }
  throw new PdfDecisionGoldSetValidationError(`Invalid gold-set reason: ${reason}`);
}

function validateNote(note?: string | null) {
  if (note && note.length > 2000) {
    throw new PdfDecisionGoldSetValidationError("Gold-set note must be 2000 characters or less.");
  }
}

export async function listPdfDecisionGoldSet(input?: {
  status?: string;
  limit?: number;
  orgNumber?: string;
  fiscalYear?: number;
}): Promise<JsonSafePdfDecisionGoldSetItem[]> {
  const status = input?.status ? parseStatus(input.status) : undefined;
  const items = await listPdfDecisionGoldSetItems({
    status,
    limit: input?.limit,
    orgNumber: input?.orgNumber,
    fiscalYear: input?.fiscalYear,
  });
  return items.map(toJsonSafe);
}

export async function getPdfDecisionGoldSetByFilingId(
  filingId: string,
): Promise<JsonSafePdfDecisionGoldSetItem | null> {
  if (!filingId.trim()) {
    throw new PdfDecisionGoldSetValidationError("filingId is required.");
  }
  const item = await getPdfDecisionGoldSetItemByFilingId(filingId);
  return item ? toJsonSafe(item) : null;
}

export async function upsertPdfDecisionGoldSetItem(input: {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  status: string;
  reason: string;
  note?: string | null;
  decisionRoute?: string | null;
  riskLevel?: string | null;
  confidenceScore?: number | null;
  outcome?: string | null;
  userId?: string | null;
}): Promise<JsonSafePdfDecisionGoldSetItem> {
  if (!input.filingId?.trim()) {
    throw new PdfDecisionGoldSetValidationError("filingId is required.");
  }
  validateNote(input.note);
  if (
    input.confidenceScore !== null &&
    input.confidenceScore !== undefined &&
    (input.confidenceScore < 0 || input.confidenceScore > 1)
  ) {
    throw new PdfDecisionGoldSetValidationError("confidenceScore must be between 0 and 1.");
  }

  const item = await upsertPdfDecisionGoldSetItemRecord({
    ...input,
    status: parseStatus(input.status),
    reason: parseReason(input.reason),
  });
  return toJsonSafe(item);
}

export async function removePdfDecisionGoldSetItem(filingId: string): Promise<void> {
  if (!filingId.trim()) {
    throw new PdfDecisionGoldSetValidationError("filingId is required.");
  }
  await deletePdfDecisionGoldSetItem(filingId);
}

export function mapShadowDocumentToGoldSetReason(
  document: Pick<
    PdfDecisionShadowDocument,
    "riskLevel" | "decisionRoute" | "outcome" | "blockingRuleCodes" | "parserRiskReasons"
  >,
): PdfDecisionGoldSetReason {
  if (document.outcome === "MANUAL_REVIEW_UNREADABLE") {
    return PdfDecisionGoldSetReason.UNREADABLE;
  }
  if (document.outcome === "REPROCESS_REQUESTED") {
    return PdfDecisionGoldSetReason.REPROCESS_REQUESTED;
  }
  if (document.blockingRuleCodes.some((code) => code.includes("BALANCE"))) {
    return PdfDecisionGoldSetReason.BALANCE_MISMATCH;
  }
  if (document.riskLevel === "LOW" && document.outcome !== "PUBLISHED") {
    return PdfDecisionGoldSetReason.LOW_RISK_FAILED;
  }
  if (
    document.riskLevel === "HIGH" &&
    (document.outcome === "PUBLISHED" || document.outcome === "MANUAL_REVIEW_ACCEPTED")
  ) {
    return PdfDecisionGoldSetReason.HIGH_RISK_SUCCEEDED;
  }
  if (document.outcome === "MANUAL_REVIEW_CORRECTED") {
    return PdfDecisionGoldSetReason.MANUAL_CORRECTION;
  }
  if (
    document.decisionRoute === "FORCE_OCR" ||
    document.decisionRoute === "OPENDATALOADER_HYBRID" ||
    document.parserRiskReasons.length > 0
  ) {
    return PdfDecisionGoldSetReason.OCR_RISK;
  }
  return PdfDecisionGoldSetReason.REPRESENTATIVE_SAMPLE;
}

export function createGoldSetItemFromShadowDocument(
  document: PdfDecisionShadowDocument,
  input: {
    status: string;
    reason?: string;
    note?: string | null;
    userId?: string | null;
  },
) {
  const reason =
    input.reason ?? mapShadowDocumentToGoldSetReason(document);
  return {
    filingId: document.filingId,
    extractionRunId: document.extractionRunId ?? null,
    orgNumber: document.orgNumber ?? null,
    fiscalYear: document.fiscalYear ?? null,
    status: parseStatus(input.status),
    reason: parseReason(reason),
    note: input.note ?? null,
    decisionRoute: document.decisionRoute ?? null,
    riskLevel: document.riskLevel ?? null,
    confidenceScore: document.confidenceScore ?? null,
    outcome: document.outcome satisfies PdfDecisionShadowOutcome,
    userId: input.userId ?? null,
  };
}

