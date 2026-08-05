import {
  PdfTrainingLabelType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  UnifiedConfidenceFinancialLineItem,
  UnifiedConfidenceNarrativeSection,
  UnifiedConfidenceFilingDrilldown,
} from "@/server/services/annual-report-unified-confidence-drilldown-service";
import { getUnifiedConfidenceFilingDrilldownForAdmin } from "@/server/services/annual-report-unified-confidence-drilldown-service";

export const UnifiedConfidenceReviewFeedbackActionValues = {
  ACCEPT_MACHINE_EXTRACTION: "ACCEPT_MACHINE_EXTRACTION",
  REJECT_MACHINE_EXTRACTION: "REJECT_MACHINE_EXTRACTION",
  MARK_NEEDS_REVIEW: "MARK_NEEDS_REVIEW",
  CORRECT_LINE_ITEM: "CORRECT_LINE_ITEM",
  CORRECT_SECTION_CLASSIFICATION: "CORRECT_SECTION_CLASSIFICATION",
  CORRECT_UNIT_SCALE: "CORRECT_UNIT_SCALE",
  CORRECT_CANONICAL_KEY: "CORRECT_CANONICAL_KEY",
  CORRECT_PROVENANCE: "CORRECT_PROVENANCE",
} as const;

export type UnifiedExtractionReviewFeedbackAction =
  (typeof UnifiedConfidenceReviewFeedbackActionValues)[keyof typeof UnifiedConfidenceReviewFeedbackActionValues];

export const UnifiedConfidenceReviewTargetTypeValues = {
  FULL_EXTRACTION: "FULL_EXTRACTION",
  FINANCIAL_LINE_ITEM: "FINANCIAL_LINE_ITEM",
  NARRATIVE_SECTION: "NARRATIVE_SECTION",
  UNIT_SCALE: "UNIT_SCALE",
  CANONICAL_KEY: "CANONICAL_KEY",
  PROVENANCE: "PROVENANCE",
  CHECK: "CHECK",
} as const;

export type UnifiedExtractionReviewTargetType =
  (typeof UnifiedConfidenceReviewTargetTypeValues)[keyof typeof UnifiedConfidenceReviewTargetTypeValues];

type UnifiedExtractionReviewFeedbackRow = {
  id: string;
  filingId: string;
  orgNumber: string | null;
  fiscalYear: number | null;
  reviewerUserId: string;
  confidenceGateArtifactId: string | null;
  sourceArtifactIds: Prisma.JsonValue | null;
  action: UnifiedExtractionReviewFeedbackAction;
  targetType: UnifiedExtractionReviewTargetType;
  targetRef: Prisma.JsonValue | null;
  proposedValue: Prisma.JsonValue | null;
  acceptedValue: Prisma.JsonValue | null;
  reason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type UnifiedExtractionReviewFeedbackDelegate = {
  findMany: (args: {
    where: { filingId: string };
    orderBy: Array<{ createdAt: "desc" | "asc" }>;
  }) => Promise<UnifiedExtractionReviewFeedbackRow[]>;
  findFirst: (args: {
    where: {
      filingId: string;
      targetType: UnifiedExtractionReviewTargetType;
      action: { in: UnifiedExtractionReviewFeedbackAction[] };
    };
    orderBy: Array<{ createdAt: "desc" | "asc" }>;
  }) => Promise<UnifiedExtractionReviewFeedbackRow | null>;
  create: (args: {
    data: Record<string, unknown>;
  }) => Promise<UnifiedExtractionReviewFeedbackRow>;
};

type UnifiedConfidenceReviewPrismaLike = {
  unifiedExtractionReviewFeedback: UnifiedExtractionReviewFeedbackDelegate;
  pdfTrainingLabel: {
    create: typeof prisma.pdfTrainingLabel.create;
  };
  $transaction: typeof prisma.$transaction;
};

const reviewFeedbackPrisma = prisma as unknown as UnifiedConfidenceReviewPrismaLike;

export type UnifiedConfidenceReviewFeedbackRecord = {
  id: string;
  filingId: string;
  orgNumber: string | null;
  fiscalYear: number | null;
  reviewerUserId: string;
  confidenceGateArtifactId: string | null;
  sourceArtifactIds: Record<string, unknown> | null;
  action: UnifiedExtractionReviewFeedbackAction;
  targetType: UnifiedExtractionReviewTargetType;
  targetRef: Record<string, unknown> | null;
  proposedValue: Record<string, unknown> | null;
  acceptedValue: Record<string, unknown> | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UnifiedConfidenceReviewSummary = {
  filingId: string;
  totalFeedback: number;
  latestDecision: UnifiedConfidenceReviewFeedbackRecord | null;
  acceptedCount: number;
  rejectedCount: number;
  needsReviewCount: number;
  correctionCount: number;
  byAction: Partial<Record<UnifiedExtractionReviewFeedbackAction, number>>;
};

export type CreateUnifiedConfidenceReviewFeedbackInput = {
  filingId: string;
  action: UnifiedExtractionReviewFeedbackAction;
  targetType: UnifiedExtractionReviewTargetType;
  targetRef?: Record<string, unknown> | null;
  acceptedValue?: Record<string, unknown> | null;
  reason?: string | null;
  notes?: string | null;
};

export type UnifiedConfidenceReviewFeedbackServiceDeps = {
  getDrilldown?: typeof getUnifiedConfidenceFilingDrilldownForAdmin;
  findMany?: UnifiedExtractionReviewFeedbackDelegate["findMany"];
  findFirst?: UnifiedExtractionReviewFeedbackDelegate["findFirst"];
  create?: UnifiedExtractionReviewFeedbackDelegate["create"];
  transaction?: typeof prisma.$transaction;
  createTrainingLabel?: typeof prisma.pdfTrainingLabel.create;
};

const DECISION_ACTIONS = new Set<UnifiedExtractionReviewFeedbackAction>([
  UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION,
  UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION,
  UnifiedConfidenceReviewFeedbackActionValues.MARK_NEEDS_REVIEW,
]);

const CORRECTION_ACTIONS = new Set<UnifiedExtractionReviewFeedbackAction>([
  UnifiedConfidenceReviewFeedbackActionValues.CORRECT_LINE_ITEM,
  UnifiedConfidenceReviewFeedbackActionValues.CORRECT_SECTION_CLASSIFICATION,
  UnifiedConfidenceReviewFeedbackActionValues.CORRECT_UNIT_SCALE,
  UnifiedConfidenceReviewFeedbackActionValues.CORRECT_CANONICAL_KEY,
  UnifiedConfidenceReviewFeedbackActionValues.CORRECT_PROVENANCE,
]);

const FINANCIAL_CORRECTION_TARGETS = new Set<UnifiedExtractionReviewTargetType>([
  UnifiedConfidenceReviewTargetTypeValues.FINANCIAL_LINE_ITEM,
  UnifiedConfidenceReviewTargetTypeValues.UNIT_SCALE,
  UnifiedConfidenceReviewTargetTypeValues.CANONICAL_KEY,
  UnifiedConfidenceReviewTargetTypeValues.PROVENANCE,
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeJsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return asRecord(value);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value ? (JSON.parse(JSON.stringify(value)) as Record<string, unknown>) : null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function mapFeedbackRecord(record: UnifiedExtractionReviewFeedbackRow): UnifiedConfidenceReviewFeedbackRecord {
  return {
    id: record.id,
    filingId: record.filingId,
    orgNumber: record.orgNumber,
    fiscalYear: record.fiscalYear,
    reviewerUserId: record.reviewerUserId,
    confidenceGateArtifactId: record.confidenceGateArtifactId,
    sourceArtifactIds: normalizeJsonRecord(record.sourceArtifactIds),
    action: record.action,
    targetType: record.targetType,
    targetRef: normalizeJsonRecord(record.targetRef),
    proposedValue: normalizeJsonRecord(record.proposedValue),
    acceptedValue: normalizeJsonRecord(record.acceptedValue),
    reason: record.reason,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function buildSourceArtifactIds(drilldown: UnifiedConfidenceFilingDrilldown): Record<string, unknown> {
  return {
    confidenceGateArtifactId: drilldown.artifacts.confidenceGate.artifactId,
    parserDocumentArtifactId: drilldown.artifacts.parserDocument.artifactId,
    financialExtractionArtifactId: drilldown.artifacts.financialExtraction.artifactId,
    narrativeExtractionArtifactId: drilldown.artifacts.narrativeExtraction.artifactId,
    comparisonArtifactId: drilldown.artifacts.comparison.artifactId,
  };
}

function matchesLineItem(
  item: UnifiedConfidenceFinancialLineItem,
  targetRef: Record<string, unknown>,
) {
  const canonicalKey = asString(targetRef.canonicalKey);
  const originalLabel = asString(targetRef.originalLabel);
  const fiscalYear = asNumber(targetRef.fiscalYear) ?? asNumber(targetRef.year);
  const pageNumber = asNumber(targetRef.pageNumber);
  const rowIndex = asNumber(targetRef.rowIndex);

  if (canonicalKey && item.canonicalKey !== canonicalKey) return false;
  if (originalLabel && item.originalLabel !== originalLabel) return false;
  if (fiscalYear !== null && item.fiscalYear !== fiscalYear) return false;
  if (pageNumber !== null && item.pageNumber !== pageNumber) return false;
  if (rowIndex !== null && item.rowIndex !== rowIndex) return false;
  return true;
}

function matchesNarrativeSection(
  section: UnifiedConfidenceNarrativeSection,
  targetRef: Record<string, unknown>,
) {
  const sectionId = asString(targetRef.sectionId);
  const kind = asString(targetRef.kind);
  const pageStart = asNumber(targetRef.pageStart);
  const pageEnd = asNumber(targetRef.pageEnd);

  if (sectionId && section.sectionId !== sectionId) return false;
  if (kind && section.kind !== kind) return false;
  if (pageStart !== null && section.pageStart !== pageStart) return false;
  if (pageEnd !== null && section.pageEnd !== pageEnd) return false;
  return true;
}

function deriveProposedValue(
  drilldown: UnifiedConfidenceFilingDrilldown,
  input: CreateUnifiedConfidenceReviewFeedbackInput,
): Record<string, unknown> | null {
  if (input.targetType === UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION) {
    return {
      status: drilldown.detail.status,
      gateVerdict: drilldown.detail.gateVerdict,
      passCount: drilldown.detail.passCount,
      warnCount: drilldown.detail.warnCount,
      failCount: drilldown.detail.failCount,
      insufficientDataCount: drilldown.detail.insufficientDataCount,
      blockingCheckCodes: drilldown.detail.blockingCheckCodes,
      warningCheckCodes: drilldown.detail.warningCheckCodes,
      safety: drilldown.safety,
      shadowSummary: drilldown.detail.shadowSummary,
    };
  }

  const targetRef = input.targetRef ?? null;
  if (!targetRef) {
    return null;
  }

  if (
    input.targetType === UnifiedConfidenceReviewTargetTypeValues.FINANCIAL_LINE_ITEM ||
    input.targetType === UnifiedConfidenceReviewTargetTypeValues.UNIT_SCALE ||
    input.targetType === UnifiedConfidenceReviewTargetTypeValues.CANONICAL_KEY ||
    input.targetType === UnifiedConfidenceReviewTargetTypeValues.PROVENANCE
  ) {
    const items = drilldown.artifacts.financialExtraction.data?.lineItems ?? [];
    const found = items.find((item) => matchesLineItem(item, targetRef));
    return found ? toRecord(found) : null;
  }

  if (input.targetType === UnifiedConfidenceReviewTargetTypeValues.NARRATIVE_SECTION) {
    const sections = drilldown.artifacts.narrativeExtraction.data?.sections ?? [];
    const found = sections.find((section) => matchesNarrativeSection(section, targetRef));
    return found ? toRecord(found) : null;
  }

  if (input.targetType === UnifiedConfidenceReviewTargetTypeValues.CHECK) {
    const checkCode = asString(targetRef.checkCode);
    const found = drilldown.detail.fullChecks.find((check) => check.checkCode === checkCode);
    return found ? toRecord(found) : null;
  }

  return null;
}

function validateCreateInput(input: CreateUnifiedConfidenceReviewFeedbackInput) {
  if (!input.filingId.trim()) {
    throw new Error("filingId is required.");
  }

  if (DECISION_ACTIONS.has(input.action) && input.targetType !== UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION) {
    throw new Error("Decision actions must target FULL_EXTRACTION.");
  }

  if (input.action === UnifiedConfidenceReviewFeedbackActionValues.CORRECT_SECTION_CLASSIFICATION &&
    input.targetType !== UnifiedConfidenceReviewTargetTypeValues.NARRATIVE_SECTION) {
    throw new Error("CORRECT_SECTION_CLASSIFICATION must target NARRATIVE_SECTION.");
  }

  if (
    (input.action === UnifiedConfidenceReviewFeedbackActionValues.CORRECT_LINE_ITEM ||
      input.action === UnifiedConfidenceReviewFeedbackActionValues.CORRECT_UNIT_SCALE ||
      input.action === UnifiedConfidenceReviewFeedbackActionValues.CORRECT_CANONICAL_KEY ||
      input.action === UnifiedConfidenceReviewFeedbackActionValues.CORRECT_PROVENANCE) &&
    !FINANCIAL_CORRECTION_TARGETS.has(input.targetType)
  ) {
    throw new Error("Financial correction actions must use the matching target type.");
  }

  if (input.action === UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION && !asString(input.reason)) {
    throw new Error("Rejecting machine extraction requires a reason.");
  }

  if (CORRECTION_ACTIONS.has(input.action)) {
    if (!input.targetRef || Object.keys(input.targetRef).length === 0) {
      throw new Error("Correction actions require targetRef.");
    }
    if (!input.acceptedValue || Object.keys(input.acceptedValue).length === 0) {
      throw new Error("Correction actions require acceptedValue.");
    }
  }
}

function mapTrainingLabelType(
  action: UnifiedExtractionReviewFeedbackAction,
  targetType: UnifiedExtractionReviewTargetType,
): PdfTrainingLabelType {
  if (action === UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION) {
    return PdfTrainingLabelType.DOCUMENT_CLASS;
  }
  if (
    action === UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION ||
    action === UnifiedConfidenceReviewFeedbackActionValues.MARK_NEEDS_REVIEW
  ) {
    return PdfTrainingLabelType.FAILURE_REASON;
  }
  switch (targetType) {
    case UnifiedConfidenceReviewTargetTypeValues.UNIT_SCALE:
      return PdfTrainingLabelType.UNIT_SCALE;
    case UnifiedConfidenceReviewTargetTypeValues.NARRATIVE_SECTION:
      return PdfTrainingLabelType.PAGE_SECTION;
    case UnifiedConfidenceReviewTargetTypeValues.PROVENANCE:
      return PdfTrainingLabelType.STATEMENT_ROW;
    case UnifiedConfidenceReviewTargetTypeValues.CANONICAL_KEY:
    case UnifiedConfidenceReviewTargetTypeValues.FINANCIAL_LINE_ITEM:
      return PdfTrainingLabelType.FACT_VALUE;
    case UnifiedConfidenceReviewTargetTypeValues.CHECK:
    case UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION:
      return PdfTrainingLabelType.DOCUMENT_CLASS;
  }

  return PdfTrainingLabelType.DOCUMENT_CLASS;
}

function isSameIdempotentDecision(
  record: UnifiedExtractionReviewFeedbackRow | null,
  input: CreateUnifiedConfidenceReviewFeedbackInput,
): boolean {
  if (!record) return false;
  if (record.action !== input.action || record.targetType !== input.targetType) return false;
  if (stableStringify(normalizeJsonRecord(record.targetRef)) !== stableStringify(input.targetRef ?? null)) {
    return false;
  }
  if (
    !DECISION_ACTIONS.has(input.action) &&
    stableStringify(normalizeJsonRecord(record.acceptedValue)) !== stableStringify(input.acceptedValue ?? null)
  ) {
    return false;
  }
  if ((record.reason ?? null) !== (asString(input.reason) ?? null)) return false;
  return (record.notes ?? null) === (asString(input.notes) ?? null);
}

export async function listUnifiedConfidenceReviewFeedbackForFiling(
  filingId: string,
  deps: UnifiedConfidenceReviewFeedbackServiceDeps = {},
): Promise<UnifiedConfidenceReviewFeedbackRecord[]> {
  const findMany = deps.findMany ?? reviewFeedbackPrisma.unifiedExtractionReviewFeedback.findMany.bind(reviewFeedbackPrisma.unifiedExtractionReviewFeedback);
  const records = await findMany({
    where: { filingId },
    orderBy: [{ createdAt: "desc" }],
  });
  return records.map(mapFeedbackRecord);
}

export async function getLatestUnifiedConfidenceReviewDecision(
  filingId: string,
  deps: UnifiedConfidenceReviewFeedbackServiceDeps = {},
): Promise<UnifiedConfidenceReviewFeedbackRecord | null> {
  const findFirst = deps.findFirst ?? reviewFeedbackPrisma.unifiedExtractionReviewFeedback.findFirst.bind(reviewFeedbackPrisma.unifiedExtractionReviewFeedback);
  const record = await findFirst({
    where: {
      filingId,
      targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
      action: { in: Array.from(DECISION_ACTIONS) },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return record ? mapFeedbackRecord(record) : null;
}

export async function summarizeUnifiedConfidenceReviewFeedback(
  filingId: string,
  deps: UnifiedConfidenceReviewFeedbackServiceDeps = {},
): Promise<UnifiedConfidenceReviewSummary> {
  const records = await listUnifiedConfidenceReviewFeedbackForFiling(filingId, deps);
  const byAction: Partial<Record<UnifiedExtractionReviewFeedbackAction, number>> = {};

  for (const record of records) {
    byAction[record.action] = (byAction[record.action] ?? 0) + 1;
  }

  return {
    filingId,
    totalFeedback: records.length,
    latestDecision: records.find((record) => DECISION_ACTIONS.has(record.action)) ?? null,
    acceptedCount: records.filter((record) => record.action === UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION).length,
    rejectedCount: records.filter((record) => record.action === UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION).length,
    needsReviewCount: records.filter((record) => record.action === UnifiedConfidenceReviewFeedbackActionValues.MARK_NEEDS_REVIEW).length,
    correctionCount: records.filter((record) => CORRECTION_ACTIONS.has(record.action)).length,
    byAction,
  };
}

export async function createUnifiedConfidenceReviewFeedback(
  input: CreateUnifiedConfidenceReviewFeedbackInput,
  reviewerUserId: string,
  deps: UnifiedConfidenceReviewFeedbackServiceDeps = {},
): Promise<UnifiedConfidenceReviewFeedbackRecord> {
  if (!reviewerUserId.trim()) {
    throw new Error("reviewerUserId is required.");
  }
  validateCreateInput(input);

  const getDrilldown = deps.getDrilldown ?? getUnifiedConfidenceFilingDrilldownForAdmin;
  const findFirst = deps.findFirst ?? reviewFeedbackPrisma.unifiedExtractionReviewFeedback.findFirst.bind(reviewFeedbackPrisma.unifiedExtractionReviewFeedback);
  const transaction = deps.transaction ?? prisma.$transaction.bind(prisma);
  const drilldown = await getDrilldown(input.filingId);
  if (!drilldown) {
    throw new Error(`Unified confidence filing ${input.filingId} not found.`);
  }

  const proposedValue = deriveProposedValue(drilldown, input);
  const sourceArtifactIds = buildSourceArtifactIds(drilldown);

  const latestDecision = DECISION_ACTIONS.has(input.action)
    ? await findFirst({
        where: {
          filingId: input.filingId,
          targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
          action: { in: Array.from(DECISION_ACTIONS) },
        },
        orderBy: [{ createdAt: "desc" }],
      })
    : null;

  if (DECISION_ACTIONS.has(input.action) && latestDecision && isSameIdempotentDecision(latestDecision, input)) {
    return mapFeedbackRecord(latestDecision);
  }

  const data: Record<string, unknown> = {
    filingId: input.filingId,
    orgNumber: drilldown.detail.orgNumber,
    fiscalYear: drilldown.detail.fiscalYear,
    reviewer: {
      connect: { id: reviewerUserId },
    },
    confidenceGateArtifactId: drilldown.artifacts.confidenceGate.artifactId,
    sourceArtifactIds: sourceArtifactIds as Prisma.InputJsonValue,
    action: input.action,
    targetType: input.targetType,
    targetRef: input.targetRef ?? null,
    proposedValue: proposedValue ?? null,
    acceptedValue:
      (input.action === UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION
        ? proposedValue
        : input.acceptedValue ?? null),
    reason: asString(input.reason),
    notes: asString(input.notes),
  };

  const created = await transaction(async (tx) => {
    const typedTx = tx as unknown as UnifiedConfidenceReviewPrismaLike;
    const record = await typedTx.unifiedExtractionReviewFeedback.create({ data });

    await typedTx.pdfTrainingLabel.create({
      data: {
        filingId: input.filingId,
        extractionRunId: null,
        reviewId: null,
        reviewerUserId,
        labelType: mapTrainingLabelType(input.action, input.targetType),
        targetRef: (input.targetRef ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        proposedValue: (proposedValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        acceptedValue:
          (input.action === UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION
            ? proposedValue
            : input.acceptedValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        sourcePayload: {
          action: input.action,
          targetType: input.targetType,
          filingId: input.filingId,
          orgNumber: drilldown.detail.orgNumber,
          fiscalYear: drilldown.detail.fiscalYear,
          confidenceGateArtifactId: drilldown.artifacts.confidenceGate.artifactId,
          sourceArtifactIds,
          reason: asString(input.reason),
          notes: asString(input.notes),
        } as Prisma.InputJsonValue,
      },
    });

    return record;
  });

  return mapFeedbackRecord(created);
}
