import {
  PdfDecisionGoldSetReason,
  PdfDecisionGoldSetStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type PdfDecisionGoldSetItemRecord = {
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
};

export async function listPdfDecisionGoldSetItems(input: {
  status?: PdfDecisionGoldSetStatus;
  limit?: number;
  orgNumber?: string;
  fiscalYear?: number;
}): Promise<PdfDecisionGoldSetItemRecord[]> {
  return prisma.pdfDecisionGoldSetItem.findMany({
    where: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.orgNumber ? { orgNumber: input.orgNumber } : {}),
      ...(input.fiscalYear !== undefined ? { fiscalYear: input.fiscalYear } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: input.limit ?? 100,
  });
}

export async function listPdfDecisionGoldSetItemsForBenchmark(input: {
  status?: PdfDecisionGoldSetStatus | "ALL";
  limit?: number;
  orgNumber?: string;
  fiscalYear?: number;
}): Promise<PdfDecisionGoldSetItemRecord[]> {
  return prisma.pdfDecisionGoldSetItem.findMany({
    where: {
      ...(input.status && input.status !== "ALL" ? { status: input.status } : {}),
      ...(input.orgNumber ? { orgNumber: input.orgNumber } : {}),
      ...(input.fiscalYear !== undefined ? { fiscalYear: input.fiscalYear } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: input.limit ?? 100,
  });
}

export async function listPdfDecisionGoldSetItemsByFilingIds(
  filingIds: string[],
): Promise<PdfDecisionGoldSetItemRecord[]> {
  if (filingIds.length === 0) return [];
  return prisma.pdfDecisionGoldSetItem.findMany({
    where: { filingId: { in: filingIds } },
  });
}

export async function getPdfDecisionGoldSetItemByFilingId(
  filingId: string,
): Promise<PdfDecisionGoldSetItemRecord | null> {
  return prisma.pdfDecisionGoldSetItem.findUnique({
    where: { filingId },
  });
}

export async function upsertPdfDecisionGoldSetItem(input: {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  status: PdfDecisionGoldSetStatus;
  reason: PdfDecisionGoldSetReason;
  note?: string | null;
  decisionRoute?: string | null;
  riskLevel?: string | null;
  confidenceScore?: number | null;
  outcome?: string | null;
  userId?: string | null;
}): Promise<PdfDecisionGoldSetItemRecord> {
  const data = {
    extractionRunId: input.extractionRunId ?? null,
    orgNumber: input.orgNumber ?? null,
    fiscalYear: input.fiscalYear ?? null,
    status: input.status,
    reason: input.reason,
    note: input.note ?? null,
    decisionRoute: input.decisionRoute ?? null,
    riskLevel: input.riskLevel ?? null,
    confidenceScore: input.confidenceScore ?? null,
    outcome: input.outcome ?? null,
    updatedByUserId: input.userId ?? null,
  };

  return prisma.pdfDecisionGoldSetItem.upsert({
    where: { filingId: input.filingId },
    create: {
      filingId: input.filingId,
      ...data,
      createdByUserId: input.userId ?? null,
    },
    update: data,
  });
}

export async function deletePdfDecisionGoldSetItem(filingId: string): Promise<void> {
  await prisma.pdfDecisionGoldSetItem.deleteMany({
    where: { filingId },
  });
}

