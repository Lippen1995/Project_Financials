/**
 * Confidence Threshold Version Service
 *
 * Stores and serves versioned snapshots of the extraction confidence-gate
 * configuration — the rules that decide whether a filing is auto-published
 * or sent to manual review.
 *
 * Why this exists (business view):
 *  Previously, the thresholds were hard-coded constants — changing them
 *  meant a code deploy. With versioning, the calibration system can write
 *  PROPOSED thresholds based on what reviewers actually accepted, an admin
 *  can approve them in the UI, and the change takes effect immediately. The
 *  full history is kept for audit and rollback.
 *
 * Lifecycle rules:
 *  - At most one row may be ACTIVE at a time. Activating a new version
 *    automatically RETIREs the old active one (atomic transaction).
 *  - PROPOSED → ACTIVE or REJECTED only. ACTIVE → RETIRED only when replaced.
 *  - All transitions are recorded with timestamps and the user who made them.
 *  - If no ACTIVE row exists (fresh install), `getActiveGateConfig` falls back
 *    to the hard-coded defaults so the system never fails closed.
 */
import {
  type ConfidenceThresholdVersion,
  ConfidenceThresholdStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
  type UnifiedExtractionConfidenceGateConfig,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";

export type ConfidenceThresholdVersionSummary = {
  id: string;
  version: number;
  status: ConfidenceThresholdStatus;
  configBlob: UnifiedExtractionConfidenceGateConfig;
  derivedFromReport: unknown;
  impactEstimate: unknown;
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

function toSummary(record: ConfidenceThresholdVersion): ConfidenceThresholdVersionSummary {
  return {
    id: record.id,
    version: record.version,
    status: record.status,
    configBlob: record.configBlob as unknown as UnifiedExtractionConfidenceGateConfig,
    derivedFromReport: record.derivedFromReport,
    impactEstimate: record.impactEstimate,
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

/**
 * Returns the currently active gate config. Falls back to the hard-coded
 * defaults if no ACTIVE row exists yet (fresh install or post-reset).
 *
 * Callers must treat the returned config as immutable; mutations belong in
 * proposeThresholdVersion + applyThresholdVersion.
 */
export async function getActiveGateConfig(): Promise<UnifiedExtractionConfidenceGateConfig> {
  const active = await prisma.confidenceThresholdVersion.findFirst({
    where: { status: ConfidenceThresholdStatus.ACTIVE },
    orderBy: { version: "desc" },
  });
  if (!active) {
    return DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG;
  }
  return active.configBlob as unknown as UnifiedExtractionConfidenceGateConfig;
}

export async function getActiveThresholdVersion(): Promise<ConfidenceThresholdVersionSummary | null> {
  const active = await prisma.confidenceThresholdVersion.findFirst({
    where: { status: ConfidenceThresholdStatus.ACTIVE },
    orderBy: { version: "desc" },
  });
  return active ? toSummary(active) : null;
}

export async function listPendingThresholdProposals(): Promise<ConfidenceThresholdVersionSummary[]> {
  const records = await prisma.confidenceThresholdVersion.findMany({
    where: { status: ConfidenceThresholdStatus.PROPOSED },
    orderBy: { proposedAt: "desc" },
  });
  return records.map(toSummary);
}

export async function listRecentThresholdVersions(limit = 20): Promise<ConfidenceThresholdVersionSummary[]> {
  const records = await prisma.confidenceThresholdVersion.findMany({
    orderBy: { proposedAt: "desc" },
    take: limit,
  });
  return records.map(toSummary);
}

export async function getThresholdVersionById(
  versionId: string,
): Promise<ConfidenceThresholdVersionSummary | null> {
  const record = await prisma.confidenceThresholdVersion.findUnique({
    where: { id: versionId },
  });
  return record ? toSummary(record) : null;
}

export type ProposeThresholdVersionInput = {
  configBlob: UnifiedExtractionConfidenceGateConfig;
  derivedFromReport?: unknown;
  impactEstimate?: unknown;
  summary?: string | null;
  notes?: string | null;
};

/**
 * Stores a new threshold configuration as a PROPOSED version awaiting human review.
 * Does NOT activate it — apply must be called explicitly after approval.
 */
export async function proposeThresholdVersion(
  input: ProposeThresholdVersionInput,
): Promise<ConfidenceThresholdVersionSummary> {
  const record = await prisma.confidenceThresholdVersion.create({
    data: {
      status: ConfidenceThresholdStatus.PROPOSED,
      configBlob: input.configBlob as unknown as Prisma.InputJsonValue,
      derivedFromReport: (input.derivedFromReport ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      impactEstimate: (input.impactEstimate ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      summary: input.summary ?? null,
      notes: input.notes ?? null,
    },
  });
  return toSummary(record);
}

export class ThresholdVersionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThresholdVersionStateError";
  }
}

/**
 * Activates a PROPOSED version. Atomically:
 *  - retires the currently ACTIVE version (if any)
 *  - marks the target version ACTIVE
 *  - records who applied it and when
 *
 * Throws ThresholdVersionStateError if the target is not in PROPOSED status.
 */
export async function applyThresholdVersion(input: {
  versionId: string;
  appliedByUserId: string;
}): Promise<ConfidenceThresholdVersionSummary> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.confidenceThresholdVersion.findUnique({
      where: { id: input.versionId },
    });
    if (!target) {
      throw new ThresholdVersionStateError(`Threshold version ${input.versionId} not found.`);
    }
    if (target.status !== ConfidenceThresholdStatus.PROPOSED) {
      throw new ThresholdVersionStateError(
        `Threshold version ${target.version} is ${target.status}, cannot be applied.`,
      );
    }

    const now = new Date();

    await tx.confidenceThresholdVersion.updateMany({
      where: { status: ConfidenceThresholdStatus.ACTIVE },
      data: { status: ConfidenceThresholdStatus.RETIRED, retiredAt: now },
    });

    const activated = await tx.confidenceThresholdVersion.update({
      where: { id: target.id },
      data: {
        status: ConfidenceThresholdStatus.ACTIVE,
        appliedAt: now,
        appliedByUserId: input.appliedByUserId,
      },
    });

    return toSummary(activated);
  });
}

/**
 * Rejects a PROPOSED version. The version is moved to REJECTED with a reason
 * and a timestamp; it does not affect the currently active version.
 */
export async function rejectThresholdVersion(input: {
  versionId: string;
  rejectedByUserId: string;
  reason?: string | null;
}): Promise<ConfidenceThresholdVersionSummary> {
  const target = await prisma.confidenceThresholdVersion.findUnique({
    where: { id: input.versionId },
  });
  if (!target) {
    throw new ThresholdVersionStateError(`Threshold version ${input.versionId} not found.`);
  }
  if (target.status !== ConfidenceThresholdStatus.PROPOSED) {
    throw new ThresholdVersionStateError(
      `Threshold version ${target.version} is ${target.status}, cannot be rejected.`,
    );
  }

  const updated = await prisma.confidenceThresholdVersion.update({
    where: { id: target.id },
    data: {
      status: ConfidenceThresholdStatus.REJECTED,
      rejectedAt: new Date(),
      rejectedByUserId: input.rejectedByUserId,
      rejectionReason: input.reason ?? null,
    },
  });
  return toSummary(updated);
}

/**
 * Seeds the initial ACTIVE version (v1) with the hard-coded defaults if no
 * ACTIVE row exists. Safe to call repeatedly — it is a no-op once seeded.
 *
 * Intended to run on application startup or via a one-shot seed script.
 */
export async function ensureInitialThresholdVersionSeeded(): Promise<ConfidenceThresholdVersionSummary> {
  const active = await prisma.confidenceThresholdVersion.findFirst({
    where: { status: ConfidenceThresholdStatus.ACTIVE },
  });
  if (active) {
    return toSummary(active);
  }

  const seeded = await prisma.confidenceThresholdVersion.create({
    data: {
      status: ConfidenceThresholdStatus.ACTIVE,
      configBlob: DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG as unknown as Prisma.InputJsonValue,
      derivedFromReport: Prisma.JsonNull,
      impactEstimate: Prisma.JsonNull,
      summary: "Initial seed — default hard-coded thresholds.",
      appliedAt: new Date(),
    },
  });
  return toSummary(seeded);
}
