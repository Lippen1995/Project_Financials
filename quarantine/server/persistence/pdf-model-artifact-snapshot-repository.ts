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
  kinds?: PdfModelArtifactKind[];
  modelId?: string;
  modelVersion?: string;
  fiscalYear?: number;
  fiscalYears?: number[];
  orgNumber?: string;
  orgNumbers?: string[];
  status?: PdfModelArtifactStatus;
  statuses?: PdfModelArtifactStatus[];
  limit?: number;
  offset?: number;
}): Promise<PdfModelArtifactSnapshot[]> {
  const take = Math.min(Math.max(input?.limit ?? 50, 1), 500);
  const skip = Math.max(input?.offset ?? 0, 0);
  return prisma.pdfModelArtifactSnapshot.findMany({
    where: {
      ...(input?.kind ? { kind: input.kind } : {}),
      ...(input?.kinds?.length ? { kind: { in: input.kinds } } : {}),
      ...(input?.modelId ? { modelId: input.modelId } : {}),
      ...(input?.modelVersion ? { modelVersion: input.modelVersion } : {}),
      ...(input?.fiscalYear !== undefined ? { fiscalYear: input.fiscalYear } : {}),
      ...(input?.fiscalYears?.length ? { fiscalYear: { in: input.fiscalYears } } : {}),
      ...(input?.orgNumber ? { orgNumber: input.orgNumber } : {}),
      ...(input?.orgNumbers?.length ? { orgNumber: { in: input.orgNumbers } } : {}),
      ...(input?.status ? { status: input.status } : {}),
      ...(input?.statuses?.length ? { status: { in: input.statuses } } : {}),
    },
    orderBy: { createdAt: "desc" },
    skip,
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
