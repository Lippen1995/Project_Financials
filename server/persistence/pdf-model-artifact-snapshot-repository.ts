import {
  PdfModelArtifactKind,
  PdfModelArtifactStatus,
  Prisma,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function createPdfModelArtifactSnapshot(input: {
  kind: PdfModelArtifactKind;
  modelId?: string | null;
  modelVersion?: string | null;
  modelTarget?: string | null;
  featureSchemaVersion?: string | null;
  fiscalYear?: number | null;
  orgNumber?: string | null;
  split?: string | null;
  summary: unknown;
  payload: unknown;
  sourceCommand?: string | null;
  sourceCommitSha?: string | null;
  createdByUserId?: string | null;
}): Promise<PdfModelArtifactSnapshot> {
  return prisma.pdfModelArtifactSnapshot.create({
    data: {
      kind: input.kind,
      modelId: input.modelId ?? null,
      modelVersion: input.modelVersion ?? null,
      modelTarget: input.modelTarget ?? null,
      featureSchemaVersion: input.featureSchemaVersion ?? null,
      fiscalYear: input.fiscalYear ?? null,
      orgNumber: input.orgNumber ?? null,
      split: input.split ?? null,
      summary: input.summary as Prisma.InputJsonValue,
      payload: input.payload as Prisma.InputJsonValue,
      sourceCommand: input.sourceCommand ?? null,
      sourceCommitSha: input.sourceCommitSha ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function listPdfModelArtifactSnapshots(input?: {
  kind?: PdfModelArtifactKind;
  modelId?: string;
  modelVersion?: string;
  fiscalYear?: number;
  orgNumber?: string;
  status?: PdfModelArtifactStatus;
  limit?: number;
}): Promise<PdfModelArtifactSnapshot[]> {
  const take = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  return prisma.pdfModelArtifactSnapshot.findMany({
    where: {
      ...(input?.kind ? { kind: input.kind } : {}),
      ...(input?.modelId ? { modelId: input.modelId } : {}),
      ...(input?.modelVersion ? { modelVersion: input.modelVersion } : {}),
      ...(input?.fiscalYear !== undefined ? { fiscalYear: input.fiscalYear } : {}),
      ...(input?.orgNumber ? { orgNumber: input.orgNumber } : {}),
      ...(input?.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getPdfModelArtifactSnapshotById(
  id: string,
): Promise<PdfModelArtifactSnapshot | null> {
  return prisma.pdfModelArtifactSnapshot.findUnique({ where: { id } });
}

export async function archivePdfModelArtifactSnapshot(
  id: string,
): Promise<PdfModelArtifactSnapshot> {
  return prisma.pdfModelArtifactSnapshot.update({
    where: { id },
    data: { status: PdfModelArtifactStatus.ARCHIVED },
  });
}
