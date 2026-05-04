export type PdfDecisionGoldSetSnapshotItem = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  expectedRoute?: string | null;
  expectedRiskLevel?: string | null;
  expectedOutcome?: string | null;
  expectedConfidenceScore?: number | null;
  expectedManualReviewReasons?: string[];
  goldSetReason: string;
  goldSetNote?: string | null;
  sourceDecisionVersion?: string | null;
  sourceRuleConfigVersion?: string | null;
};

export type PdfDecisionGoldSetSnapshot = {
  version: "pdf-decision-gold-set-snapshot-v1";
  generatedAt: string;
  itemCount: number;
  items: PdfDecisionGoldSetSnapshotItem[];
};

export class PdfDecisionGoldSetSnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfDecisionGoldSetSnapshotValidationError";
  }
}

export type PdfDecisionGoldSetSnapshotSourceItem = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  decisionRoute?: string | null;
  riskLevel?: string | null;
  confidenceScore?: number | null;
  outcome?: string | null;
  reason?: string | null;
  goldSetReason?: string | null;
  note?: string | null;
  goldSetNote?: string | null;
  expectedManualReviewReasons?: string[];
  sourceDecisionVersion?: string | null;
  sourceRuleConfigVersion?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, field: string) {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new PdfDecisionGoldSetSnapshotValidationError(`${field} must be a string or null.`);
  }
}

function optionalNumber(value: unknown, field: string) {
  if (value !== undefined && value !== null && typeof value !== "number") {
    throw new PdfDecisionGoldSetSnapshotValidationError(`${field} must be a number or null.`);
  }
}

function validateSnapshotItem(
  item: unknown,
  index: number,
): asserts item is PdfDecisionGoldSetSnapshotItem {
  if (!isRecord(item)) {
    throw new PdfDecisionGoldSetSnapshotValidationError(`items[${index}] must be an object.`);
  }
  if (typeof item.filingId !== "string" || item.filingId.trim().length === 0) {
    throw new PdfDecisionGoldSetSnapshotValidationError(`items[${index}].filingId is required.`);
  }
  if (typeof item.goldSetReason !== "string" || item.goldSetReason.trim().length === 0) {
    throw new PdfDecisionGoldSetSnapshotValidationError(`items[${index}].goldSetReason is required.`);
  }
  optionalString(item.extractionRunId, `items[${index}].extractionRunId`);
  optionalString(item.orgNumber, `items[${index}].orgNumber`);
  optionalNumber(item.fiscalYear, `items[${index}].fiscalYear`);
  optionalString(item.expectedRoute, `items[${index}].expectedRoute`);
  optionalString(item.expectedRiskLevel, `items[${index}].expectedRiskLevel`);
  optionalString(item.expectedOutcome, `items[${index}].expectedOutcome`);
  optionalNumber(item.expectedConfidenceScore, `items[${index}].expectedConfidenceScore`);
  if (
    typeof item.expectedConfidenceScore === "number" &&
    (item.expectedConfidenceScore < 0 || item.expectedConfidenceScore > 1)
  ) {
    throw new PdfDecisionGoldSetSnapshotValidationError(
      `items[${index}].expectedConfidenceScore must be between 0 and 1.`,
    );
  }
  if (
    item.expectedManualReviewReasons !== undefined &&
    (!Array.isArray(item.expectedManualReviewReasons) ||
      !item.expectedManualReviewReasons.every((reason) => typeof reason === "string"))
  ) {
    throw new PdfDecisionGoldSetSnapshotValidationError(
      `items[${index}].expectedManualReviewReasons must be an array of strings.`,
    );
  }
  optionalString(item.goldSetNote, `items[${index}].goldSetNote`);
  optionalString(item.sourceDecisionVersion, `items[${index}].sourceDecisionVersion`);
  optionalString(item.sourceRuleConfigVersion, `items[${index}].sourceRuleConfigVersion`);
}

function normalizeSnapshotItem(
  item: PdfDecisionGoldSetSnapshotSourceItem,
): PdfDecisionGoldSetSnapshotItem {
  return {
    filingId: item.filingId,
    extractionRunId: item.extractionRunId ?? null,
    orgNumber: item.orgNumber ?? null,
    fiscalYear: item.fiscalYear ?? null,
    expectedRoute: item.decisionRoute ?? null,
    expectedRiskLevel: item.riskLevel ?? null,
    expectedOutcome: item.outcome ?? null,
    expectedConfidenceScore: item.confidenceScore ?? null,
    expectedManualReviewReasons: item.expectedManualReviewReasons ?? [],
    goldSetReason: item.goldSetReason ?? item.reason ?? "OTHER",
    goldSetNote: item.goldSetNote ?? item.note ?? null,
    sourceDecisionVersion: item.sourceDecisionVersion ?? null,
    sourceRuleConfigVersion: item.sourceRuleConfigVersion ?? null,
  };
}

export function buildPdfDecisionGoldSetSnapshot(
  items: PdfDecisionGoldSetSnapshotSourceItem[],
): PdfDecisionGoldSetSnapshot {
  const snapshotItems = items.map(normalizeSnapshotItem);
  const snapshot: PdfDecisionGoldSetSnapshot = {
    version: "pdf-decision-gold-set-snapshot-v1",
    generatedAt: new Date().toISOString(),
    itemCount: snapshotItems.length,
    items: snapshotItems,
  };
  validatePdfDecisionGoldSetSnapshot(snapshot);
  return snapshot;
}

export function validatePdfDecisionGoldSetSnapshot(
  snapshot: unknown,
): asserts snapshot is PdfDecisionGoldSetSnapshot {
  if (!isRecord(snapshot)) {
    throw new PdfDecisionGoldSetSnapshotValidationError("Snapshot must be an object.");
  }
  if (snapshot.version !== "pdf-decision-gold-set-snapshot-v1") {
    throw new PdfDecisionGoldSetSnapshotValidationError("Invalid gold-set snapshot version.");
  }
  if (typeof snapshot.generatedAt !== "string" || Number.isNaN(Date.parse(snapshot.generatedAt))) {
    throw new PdfDecisionGoldSetSnapshotValidationError("generatedAt must be an ISO timestamp.");
  }
  if (typeof snapshot.itemCount !== "number" || snapshot.itemCount < 0) {
    throw new PdfDecisionGoldSetSnapshotValidationError("itemCount must be a non-negative number.");
  }
  if (!Array.isArray(snapshot.items)) {
    throw new PdfDecisionGoldSetSnapshotValidationError("items must be an array.");
  }
  if (snapshot.itemCount !== snapshot.items.length) {
    throw new PdfDecisionGoldSetSnapshotValidationError("itemCount must match items.length.");
  }
  snapshot.items.forEach(validateSnapshotItem);
  JSON.stringify(snapshot);
}

export function parsePdfDecisionGoldSetSnapshotJson(json: string): PdfDecisionGoldSetSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PdfDecisionGoldSetSnapshotValidationError("Snapshot JSON is invalid.");
  }
  validatePdfDecisionGoldSetSnapshot(parsed);
  return parsed;
}
