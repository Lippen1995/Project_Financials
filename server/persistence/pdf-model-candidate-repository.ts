import {
  PdfModelCandidateDecisionType,
  PdfModelCandidateStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

const candidateInclude = {
  manifestArtifact: true,
  gateArtifact: true,
  analysisArtifact: true,
  decisions: {
    orderBy: { createdAt: "desc" as const },
    take: 10,
  },
} satisfies Prisma.PdfModelCandidateInclude;

export type PdfModelCandidateRecord = Prisma.PdfModelCandidateGetPayload<{
  include: typeof candidateInclude;
}>;

export class PdfModelCandidateTransitionNotFoundError extends Error {
  constructor(message = "Model candidate was not found.") {
    super(message);
    this.name = "PdfModelCandidateTransitionNotFoundError";
  }
}

export class PdfModelCandidateTransitionConflictError extends Error {
  constructor(message = "Model candidate status changed before the transition could be applied.") {
    super(message);
    this.name = "PdfModelCandidateTransitionConflictError";
  }
}

export async function createPdfModelCandidate(input: {
  modelId: string;
  modelVersion: string;
  modelTarget: string;
  algorithm?: string | null;
  featureSchemaVersion?: string | null;
  manifestArtifactId?: string | null;
  gateArtifactId?: string | null;
  analysisArtifactId?: string | null;
  createdByUserId?: string | null;
}): Promise<PdfModelCandidateRecord> {
  return prisma.pdfModelCandidate.create({
    data: {
      modelId: input.modelId,
      modelVersion: input.modelVersion,
      modelTarget: input.modelTarget,
      algorithm: input.algorithm ?? null,
      featureSchemaVersion: input.featureSchemaVersion ?? null,
      manifestArtifactId: input.manifestArtifactId ?? null,
      gateArtifactId: input.gateArtifactId ?? null,
      analysisArtifactId: input.analysisArtifactId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
    include: candidateInclude,
  });
}

export async function listPdfModelCandidates(input?: {
  status?: PdfModelCandidateStatus;
  modelTarget?: string;
  modelId?: string;
  limit?: number;
}): Promise<PdfModelCandidateRecord[]> {
  const take = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  return prisma.pdfModelCandidate.findMany({
    where: {
      ...(input?.status ? { status: input.status } : {}),
      ...(input?.modelTarget ? { modelTarget: input.modelTarget } : {}),
      ...(input?.modelId ? { modelId: input.modelId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: candidateInclude,
  });
}

export async function getPdfModelCandidateById(
  id: string,
): Promise<PdfModelCandidateRecord | null> {
  return prisma.pdfModelCandidate.findUnique({
    where: { id },
    include: candidateInclude,
  });
}

export async function getPdfModelCandidateByModelIdVersion(
  modelId: string,
  modelVersion: string,
): Promise<PdfModelCandidateRecord | null> {
  return prisma.pdfModelCandidate.findUnique({
    where: { modelId_modelVersion: { modelId, modelVersion } },
    include: candidateInclude,
  });
}

export async function transitionPdfModelCandidateStatus(input: {
  candidateId: string;
  expectedStatuses: PdfModelCandidateStatus[];
  nextStatus: PdfModelCandidateStatus;
  decisionType: PdfModelCandidateDecisionType;
  note?: string | null;
  payload?: unknown;
  decidedByUserId?: string | null;
  validateCandidate?: (candidate: PdfModelCandidateRecord) => void;
}): Promise<PdfModelCandidateRecord> {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.pdfModelCandidate.findUnique({
      where: { id: input.candidateId },
      include: candidateInclude,
    });

    if (!candidate) throw new PdfModelCandidateTransitionNotFoundError();
    if (!input.expectedStatuses.includes(candidate.status)) {
      throw new PdfModelCandidateTransitionConflictError(
        `Invalid model candidate transition ${candidate.status} -> ${input.nextStatus}.`,
      );
    }

    input.validateCandidate?.(candidate);

    const updated = await tx.pdfModelCandidate.updateMany({
      where: {
        id: input.candidateId,
        status: { in: input.expectedStatuses },
      },
      data: { status: input.nextStatus },
    });

    if (updated.count !== 1) {
      throw new PdfModelCandidateTransitionConflictError();
    }

    const payload =
      input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
        ? { fromStatus: candidate.status, ...(input.payload as Record<string, unknown>) }
        : input.payload;

    await tx.pdfModelCandidateDecision.create({
      data: {
        candidateId: input.candidateId,
        decisionType: input.decisionType,
        note: input.note ?? null,
        payload:
          payload === undefined
            ? undefined
            : (payload as Prisma.InputJsonValue),
        decidedByUserId: input.decidedByUserId ?? null,
      },
    });

    const refreshed = await tx.pdfModelCandidate.findUnique({
      where: { id: input.candidateId },
      include: candidateInclude,
    });
    if (!refreshed) throw new PdfModelCandidateTransitionNotFoundError();
    return refreshed;
  });
}

export async function createPdfModelCandidateDecision(input: {
  candidateId: string;
  decisionType: PdfModelCandidateDecisionType;
  note?: string | null;
  payload?: unknown;
  decidedByUserId?: string | null;
}) {
  return prisma.pdfModelCandidateDecision.create({
    data: {
      candidateId: input.candidateId,
      decisionType: input.decisionType,
      note: input.note ?? null,
      payload:
        input.payload === undefined
          ? undefined
          : (input.payload as Prisma.InputJsonValue),
      decidedByUserId: input.decidedByUserId ?? null,
    },
  });
}
