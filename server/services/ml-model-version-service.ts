/**
 * ML Model Version Service
 *
 * Tracks versioned in-house machine-learning models that replace specific
 * extraction rules. Each task type (unit-scale classifier, page-type
 * classifier, ...) has its own version chain. The DB row carries metadata
 * and a pointer to the binary file in the inference container's volume —
 * the binary itself is never stored in Postgres.
 *
 * Lifecycle (mirrors ConfidenceThresholdVersion):
 *   PROPOSED → ACTIVE | REJECTED
 *   ACTIVE   → RETIRED (when a newer version is activated)
 *
 * Invariant: at most one ACTIVE row per taskType.
 */
import {
  type MlModelVersion,
  MlModelStatus,
  type MlTaskType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type MlModelVersionSummary = {
  id: string;
  taskType: MlTaskType;
  taskVersion: number;
  status: MlModelStatus;
  algorithm: string;
  binaryPath: string;
  evaluationMetrics: unknown;
  trainingDataSnapshot: unknown;
  summary: string | null;
  notes: string | null;
  proposedAt: Date;
  appliedAt: Date | null;
  appliedByUserId: string | null;
  retiredAt: Date | null;
  rejectedAt: Date | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
};

function toSummary(record: MlModelVersion): MlModelVersionSummary {
  return {
    id: record.id,
    taskType: record.taskType,
    taskVersion: record.taskVersion,
    status: record.status,
    algorithm: record.algorithm,
    binaryPath: record.binaryPath,
    evaluationMetrics: record.evaluationMetrics,
    trainingDataSnapshot: record.trainingDataSnapshot,
    summary: record.summary,
    notes: record.notes,
    proposedAt: record.proposedAt,
    appliedAt: record.appliedAt,
    appliedByUserId: record.appliedByUserId,
    retiredAt: record.retiredAt,
    rejectedAt: record.rejectedAt,
    rejectedByUserId: record.rejectedByUserId,
    rejectionReason: record.rejectionReason,
  };
}

export async function getActiveModelForTask(
  taskType: MlTaskType,
): Promise<MlModelVersionSummary | null> {
  const record = await prisma.mlModelVersion.findFirst({
    where: { taskType, status: MlModelStatus.ACTIVE },
    orderBy: { taskVersion: "desc" },
  });
  return record ? toSummary(record) : null;
}

export async function listAllActiveModels(): Promise<MlModelVersionSummary[]> {
  const records = await prisma.mlModelVersion.findMany({
    where: { status: MlModelStatus.ACTIVE },
    orderBy: { taskType: "asc" },
  });
  return records.map(toSummary);
}

export async function listPendingModelProposals(): Promise<MlModelVersionSummary[]> {
  const records = await prisma.mlModelVersion.findMany({
    where: { status: MlModelStatus.PROPOSED },
    orderBy: { proposedAt: "desc" },
  });
  return records.map(toSummary);
}

export async function listRecentModelsForTask(
  taskType: MlTaskType,
  limit = 15,
): Promise<MlModelVersionSummary[]> {
  const records = await prisma.mlModelVersion.findMany({
    where: { taskType },
    orderBy: { proposedAt: "desc" },
    take: limit,
  });
  return records.map(toSummary);
}

export type ProposeModelInput = {
  taskType: MlTaskType;
  algorithm: string;
  binaryPath: string;
  evaluationMetrics?: unknown;
  trainingDataSnapshot?: unknown;
  summary?: string | null;
  notes?: string | null;
};

/**
 * Records a freshly-trained model as PROPOSED. Computes the next per-task
 * version number atomically (taskType, taskVersion is unique).
 */
export async function proposeModelVersion(
  input: ProposeModelInput,
): Promise<MlModelVersionSummary> {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.mlModelVersion.findFirst({
      where: { taskType: input.taskType },
      orderBy: { taskVersion: "desc" },
    });
    const nextVersion = (latest?.taskVersion ?? 0) + 1;

    const created = await tx.mlModelVersion.create({
      data: {
        taskType: input.taskType,
        taskVersion: nextVersion,
        status: MlModelStatus.PROPOSED,
        algorithm: input.algorithm,
        binaryPath: input.binaryPath,
        evaluationMetrics: (input.evaluationMetrics ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        trainingDataSnapshot: (input.trainingDataSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        summary: input.summary ?? null,
        notes: input.notes ?? null,
      },
    });

    return toSummary(created);
  });
}

export class ModelVersionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelVersionStateError";
  }
}

/**
 * Activates a PROPOSED model. The currently-ACTIVE model for the same task
 * type is RETIRED in the same transaction. Throws if the target is not in
 * PROPOSED status.
 */
export async function applyModelVersion(input: {
  versionId: string;
  appliedByUserId: string;
}): Promise<MlModelVersionSummary> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.mlModelVersion.findUnique({
      where: { id: input.versionId },
    });
    if (!target) {
      throw new ModelVersionStateError(`Model version ${input.versionId} not found.`);
    }
    if (target.status !== MlModelStatus.PROPOSED) {
      throw new ModelVersionStateError(
        `Model version v${target.taskVersion} (${target.taskType}) is ${target.status}, cannot be applied.`,
      );
    }

    const now = new Date();

    await tx.mlModelVersion.updateMany({
      where: { taskType: target.taskType, status: MlModelStatus.ACTIVE },
      data: { status: MlModelStatus.RETIRED, retiredAt: now },
    });

    const activated = await tx.mlModelVersion.update({
      where: { id: target.id },
      data: {
        status: MlModelStatus.ACTIVE,
        appliedAt: now,
        appliedByUserId: input.appliedByUserId,
      },
    });

    return toSummary(activated);
  });
}

export async function rejectModelVersion(input: {
  versionId: string;
  rejectedByUserId: string;
  reason?: string | null;
}): Promise<MlModelVersionSummary> {
  const target = await prisma.mlModelVersion.findUnique({
    where: { id: input.versionId },
  });
  if (!target) {
    throw new ModelVersionStateError(`Model version ${input.versionId} not found.`);
  }
  if (target.status !== MlModelStatus.PROPOSED) {
    throw new ModelVersionStateError(
      `Model version v${target.taskVersion} (${target.taskType}) is ${target.status}, cannot be rejected.`,
    );
  }

  const updated = await prisma.mlModelVersion.update({
    where: { id: target.id },
    data: {
      status: MlModelStatus.REJECTED,
      rejectedAt: new Date(),
      rejectedByUserId: input.rejectedByUserId,
      rejectionReason: input.reason ?? null,
    },
  });
  return toSummary(updated);
}
