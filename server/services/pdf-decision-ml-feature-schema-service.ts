import {
  buildPdfDecisionOutcomeDataset,
  type PdfDecisionOutcomeDataset,
  type PdfDecisionOutcomeDatasetRecord,
} from "@/server/services/pdf-decision-outcome-dataset-service";
import {
  splitPdfDecisionOutcomeDataset,
  type PdfDecisionDatasetSplitName,
} from "@/server/services/pdf-decision-dataset-split-service";

export type PdfDecisionMlFeatureSchemaVersion = "pdf-decision-ml-features-v1";

export type PdfDecisionMlRouteLabel =
  | "TEXT_LAYER"
  | "OPENDATALOADER_LOCAL"
  | "OCR"
  | "HYBRID"
  | "MANUAL_REVIEW"
  | "UNKNOWN";

export type PdfDecisionMlBinaryLabel = 0 | 1;

export type PdfDecisionMlFeatureRecord = {
  version: PdfDecisionMlFeatureSchemaVersion;
  ids: {
    filingId: string;
    extractionRunId?: string | null;
    orgNumber?: string | null;
    fiscalYear?: number | null;
  };
  split?: PdfDecisionDatasetSplitName | null;
  numericFeatures: {
    confidenceScore: number | null;
    parserRiskReasonCount: number;
    extractionWarningCount: number;
    manualReviewReasonCount: number;
    blockingRuleCount: number;
    warningRuleCount: number;
    trainingLabelCount: number;
    reviewedFactCount: number;
    samplePriority?: number | null;
    remediationItemCount?: number | null;
  };
  booleanFeatures: {
    hasStructuredDocument: boolean;
    hasPdfDecision: boolean;
    hasPostValidationDecision: boolean;
    hasGoldSet: boolean;
    isGoldSetApproved: boolean;
    hasParserRiskReasons: boolean;
    hasBlockingRules: boolean;
    hasManualReviewReasons: boolean;
    hasCorrections: boolean;
    isUnreadable: boolean;
    isReprocessRequested: boolean;
    isPublished: boolean;
  };
  categoricalFeatures: {
    decisionRoute: string | null;
    riskLevel: string | null;
    qualityRisk: string | null;
    recommendedRouteHint: string | null;
    ruleConfigVersion: string | null;
    goldSetStatus: string | null;
    latestReviewDecisionType: string | null;
    currentOutcome: string | null;
  };
  multiCategoricalFeatures: {
    manualReviewReasons: string[];
    blockingRuleCodes: string[];
    parserRiskReasons: string[];
  };
  labels: {
    routeLabel: PdfDecisionMlRouteLabel;
    manualReviewRequired: PdfDecisionMlBinaryLabel;
    corrected: PdfDecisionMlBinaryLabel;
    unreadable: PdfDecisionMlBinaryLabel;
    reprocessRequested: PdfDecisionMlBinaryLabel;
    published: PdfDecisionMlBinaryLabel;
    failed: PdfDecisionMlBinaryLabel;
  };
  labelProvenance: {
    sourceOutcome?: string | null;
    latestReviewDecisionType?: string | null;
    goldSetStatus?: string | null;
    derivedFrom: Array<"OUTCOME_DATASET" | "REVIEW_DECISION" | "GOLD_SET" | "ROUTE_EXPERIMENT">;
  };
};

export type PdfDecisionMlFeatureDataset = {
  version: "pdf-decision-ml-feature-dataset-v1";
  generatedAt: string;
  schemaVersion: PdfDecisionMlFeatureSchemaVersion;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
    includeText: false;
    splitSeed?: string;
  };
  recordCount: number;
  records: PdfDecisionMlFeatureRecord[];
};

export const PDF_DECISION_ML_FEATURE_SCHEMA_VERSION =
  "pdf-decision-ml-features-v1" satisfies PdfDecisionMlFeatureSchemaVersion;

const KNOWN_ROUTE_LABELS: PdfDecisionMlRouteLabel[] = [
  "TEXT_LAYER",
  "OPENDATALOADER_LOCAL",
  "OCR",
  "HYBRID",
  "MANUAL_REVIEW",
  "UNKNOWN",
];

export const PDF_DECISION_ML_FEATURE_SCHEMA = {
  version: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
  numericFeatures: [
    "confidenceScore",
    "parserRiskReasonCount",
    "extractionWarningCount",
    "manualReviewReasonCount",
    "blockingRuleCount",
    "warningRuleCount",
    "trainingLabelCount",
    "reviewedFactCount",
    "samplePriority",
    "remediationItemCount",
  ],
  booleanFeatures: [
    "hasStructuredDocument",
    "hasPdfDecision",
    "hasPostValidationDecision",
    "hasGoldSet",
    "isGoldSetApproved",
    "hasParserRiskReasons",
    "hasBlockingRules",
    "hasManualReviewReasons",
    "hasCorrections",
    "isUnreadable",
    "isReprocessRequested",
    "isPublished",
  ],
  categoricalFeatures: [
    "decisionRoute",
    "riskLevel",
    "qualityRisk",
    "recommendedRouteHint",
    "ruleConfigVersion",
    "goldSetStatus",
    "latestReviewDecisionType",
    "currentOutcome",
  ],
  multiCategoricalFeatures: [
    "manualReviewReasons",
    "blockingRuleCodes",
    "parserRiskReasons",
  ],
  labels: [
    "routeLabel",
    "manualReviewRequired",
    "corrected",
    "unreadable",
    "reprocessRequested",
    "published",
    "failed",
  ],
  missingValuePolicy: {
    numeric: "null means unavailable; downstream encoders may impute",
    boolean:
      "false only when evidence says false; unavailable booleans should be encoded explicitly by feature construction",
    categorical: "null means unknown/unavailable",
    multiCategorical: "empty array means no observed values or unavailable",
  },
  allowedCategoricalValues: {
    decisionRoute: [
      "TEXT_LAYER",
      "CONSERVATIVE_FALLBACK",
      "FORCE_OCR",
      "OPENDATALOADER_HYBRID",
      "MANUAL_REVIEW",
    ],
    riskLevel: ["LOW", "MEDIUM", "HIGH"],
    qualityRisk: ["LOW", "MEDIUM", "HIGH"],
    recommendedRouteHint: [
      "TEXT_LAYER",
      "CONSERVATIVE_FALLBACK",
      "FORCE_OCR",
      "OPENDATALOADER_HYBRID",
      "MANUAL_REVIEW",
    ],
    goldSetStatus: ["CANDIDATE", "APPROVED", "EXCLUDED"],
    latestReviewDecisionType: [
      "ACCEPTED",
      "CORRECTED",
      "REJECTED",
      "UNREADABLE",
      "REPROCESS_REQUESTED",
      "PUBLISHED_FROM_REVIEW",
    ],
    currentOutcome: [
      "PUBLISHED",
      "MANUAL_REVIEW_PENDING",
      "MANUAL_REVIEW_ACCEPTED",
      "MANUAL_REVIEW_CORRECTED",
      "MANUAL_REVIEW_REJECTED",
      "MANUAL_REVIEW_UNREADABLE",
      "REPROCESS_REQUESTED",
      "FAILED",
      "UNKNOWN",
    ],
    routeLabel: KNOWN_ROUTE_LABELS,
  },
} as const;

function binary(value: boolean): PdfDecisionMlBinaryLabel {
  return value ? 1 : 0;
}

function isManualOutcome(outcome?: string | null) {
  return Boolean(outcome?.startsWith("MANUAL_REVIEW")) || outcome === "REPROCESS_REQUESTED";
}

function mapDecisionRouteToRouteLabel(route?: string | null): PdfDecisionMlRouteLabel {
  if (!route) return "UNKNOWN";
  if (route === "TEXT_LAYER" || route === "CONSERVATIVE_FALLBACK") return "TEXT_LAYER";
  if (route === "FORCE_OCR") return "OCR";
  if (route === "OPENDATALOADER_HYBRID") return "HYBRID";
  if (route === "MANUAL_REVIEW") return "MANUAL_REVIEW";
  if (route === "OPENDATALOADER_LOCAL") return "OPENDATALOADER_LOCAL";
  if (route === "HYBRID") return "HYBRID";
  if (route === "OCR") return "OCR";
  return "UNKNOWN";
}

function deriveRouteLabel(record: PdfDecisionOutcomeDatasetRecord): PdfDecisionMlRouteLabel {
  const route = mapDecisionRouteToRouteLabel(record.features.decisionRoute);
  if (route !== "UNKNOWN") return route;
  if (
    isManualOutcome(record.labels.outcome) ||
    record.labels.unreadable ||
    record.labels.reprocessRequested
  ) {
    return "MANUAL_REVIEW";
  }
  return "UNKNOWN";
}

function derivedFrom(record: PdfDecisionOutcomeDatasetRecord): PdfDecisionMlFeatureRecord["labelProvenance"]["derivedFrom"] {
  const sources: PdfDecisionMlFeatureRecord["labelProvenance"]["derivedFrom"] = ["OUTCOME_DATASET"];
  if (record.labels.latestReviewDecisionType) sources.push("REVIEW_DECISION");
  if (record.features.hasGoldSet) sources.push("GOLD_SET");
  return sources;
}

export function buildPdfDecisionMlFeatureRecordFromOutcomeRecord(input: {
  record: PdfDecisionOutcomeDatasetRecord;
  split?: PdfDecisionDatasetSplitName | null;
}): PdfDecisionMlFeatureRecord {
  const record = input.record;
  const hasManualReview =
    Boolean(record.labels.latestReviewDecisionType) ||
    isManualOutcome(record.labels.outcome) ||
    (record.features.riskLevel === "HIGH" &&
      (record.features.blockingRuleCount > 0 || record.features.manualReviewReasonCount > 0));

  return {
    version: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    ids: {
      filingId: record.filingId,
      extractionRunId: record.extractionRunId ?? null,
      orgNumber: record.orgNumber ?? null,
      fiscalYear: record.fiscalYear ?? null,
    },
    split: input.split ?? null,
    numericFeatures: {
      confidenceScore: record.features.confidenceScore ?? null,
      parserRiskReasonCount: record.features.parserRiskReasonCount,
      extractionWarningCount: record.features.extractionWarningCount,
      manualReviewReasonCount: record.features.manualReviewReasonCount,
      blockingRuleCount: record.features.blockingRuleCount,
      warningRuleCount: record.features.warningRuleCount,
      trainingLabelCount: record.features.trainingLabelCount,
      reviewedFactCount: record.features.reviewedFactCount,
      samplePriority: null,
      remediationItemCount: null,
    },
    booleanFeatures: {
      hasStructuredDocument: record.features.hasStructuredDocument,
      hasPdfDecision: record.features.hasPdfDecision,
      hasPostValidationDecision: record.features.hasPostValidationDecision,
      hasGoldSet: record.features.hasGoldSet,
      isGoldSetApproved: record.features.goldSetStatus === "APPROVED",
      hasParserRiskReasons: record.features.parserRiskReasonCount > 0,
      hasBlockingRules: record.features.blockingRuleCount > 0,
      hasManualReviewReasons: record.features.manualReviewReasonCount > 0,
      hasCorrections: record.labels.corrected,
      isUnreadable: record.labels.unreadable,
      isReprocessRequested: record.labels.reprocessRequested,
      isPublished: record.labels.published,
    },
    categoricalFeatures: {
      decisionRoute: record.features.decisionRoute ?? null,
      riskLevel: record.features.riskLevel ?? null,
      qualityRisk: record.features.qualityRisk ?? null,
      recommendedRouteHint: record.features.recommendedRouteHint ?? null,
      ruleConfigVersion: record.features.ruleConfigVersion ?? null,
      goldSetStatus: record.features.goldSetStatus ?? null,
      latestReviewDecisionType: record.labels.latestReviewDecisionType ?? null,
      currentOutcome: record.labels.outcome ?? null,
    },
    multiCategoricalFeatures: {
      manualReviewReasons: record.diagnostics.manualReviewReasons,
      blockingRuleCodes: record.diagnostics.blockingRuleCodes,
      parserRiskReasons: record.diagnostics.parserRiskReasons,
    },
    labels: {
      routeLabel: deriveRouteLabel(record),
      manualReviewRequired: binary(hasManualReview),
      corrected: binary(record.labels.corrected),
      unreadable: binary(record.labels.unreadable),
      reprocessRequested: binary(record.labels.reprocessRequested),
      published: binary(record.labels.published),
      failed: binary(record.labels.failed),
    },
    labelProvenance: {
      sourceOutcome: record.labels.outcome ?? null,
      latestReviewDecisionType: record.labels.latestReviewDecisionType ?? null,
      goldSetStatus: record.features.goldSetStatus ?? null,
      derivedFrom: derivedFrom(record),
    },
  };
}

export async function buildPdfDecisionMlFeatureDataset(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
    splitSeed?: string;
    includeSplits?: boolean;
  },
  deps?: {
    buildOutcomeDataset?: (params: {
      limit?: number;
      fiscalYear?: number;
      orgNumber?: string;
      includeText?: boolean;
    }) => Promise<PdfDecisionOutcomeDataset>;
  },
): Promise<PdfDecisionMlFeatureDataset> {
  const limit = input?.limit ?? 100;
  const includeSplits = input?.includeSplits ?? true;
  const buildOutcome = deps?.buildOutcomeDataset ?? buildPdfDecisionOutcomeDataset;
  const outcomeDataset = await buildOutcome({
    limit,
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.orgNumber,
    includeText: false,
  });
  const splitRecords = includeSplits
    ? splitPdfDecisionOutcomeDataset({
        dataset: outcomeDataset,
        seed: input?.splitSeed,
      }).records
    : outcomeDataset.records.map((record) => ({ ...record, split: null }));
  const records = splitRecords.map((record) =>
    buildPdfDecisionMlFeatureRecordFromOutcomeRecord({
      record,
      split: record.split ?? null,
    }),
  );

  return {
    version: "pdf-decision-ml-feature-dataset-v1",
    generatedAt: new Date().toISOString(),
    schemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    input: {
      limit,
      fiscalYear: input?.fiscalYear,
      orgNumber: input?.orgNumber,
      includeText: false,
      splitSeed: includeSplits ? input?.splitSeed : undefined,
    },
    recordCount: records.length,
    records,
  };
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasInvalidNumber);
  }
  return false;
}

function hasRawPayloadKey(value: unknown): boolean {
  const rawKeys = new Set(["rawPdf", "pdfBuffer", "rawText", "fullText", "structuredDocument", "pagesText"]);
  if (Array.isArray(value)) return value.some(hasRawPayloadKey);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => rawKeys.has(key) || hasRawPayloadKey(nested),
    );
  }
  return false;
}

function isBinary(value: unknown): value is PdfDecisionMlBinaryLabel {
  return value === 0 || value === 1;
}

export function validatePdfDecisionMlFeatureRecord(
  record: PdfDecisionMlFeatureRecord,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (record.version !== PDF_DECISION_ML_FEATURE_SCHEMA_VERSION) issues.push("Invalid feature record version.");
  if (!record.ids?.filingId) issues.push("filingId is required.");
  if (record.split != null && !["train", "validation", "test"].includes(record.split)) {
    issues.push("Invalid split value.");
  }
  if (hasInvalidNumber(record)) issues.push("Record contains NaN or Infinity.");
  if (hasRawPayloadKey(record)) issues.push("Record contains raw PDF/text payload keys.");
  for (const [key, value] of Object.entries(record.labels ?? {})) {
    if (key === "routeLabel") {
      if (!KNOWN_ROUTE_LABELS.includes(value as PdfDecisionMlRouteLabel)) {
        issues.push("Invalid routeLabel.");
      }
    } else if (!isBinary(value)) {
      issues.push(`${key} must be binary 0/1.`);
    }
  }
  for (const [key, value] of Object.entries(record.multiCategoricalFeatures ?? {})) {
    if (!Array.isArray(value)) issues.push(`${key} must be an array.`);
  }
  try {
    JSON.stringify(record);
  } catch {
    issues.push("Record is not JSON-safe.");
  }
  return { valid: issues.length === 0, issues };
}

export function validatePdfDecisionMlFeatureDataset(
  dataset: PdfDecisionMlFeatureDataset,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (dataset.version !== "pdf-decision-ml-feature-dataset-v1") issues.push("Invalid dataset version.");
  if (dataset.schemaVersion !== PDF_DECISION_ML_FEATURE_SCHEMA_VERSION) issues.push("Invalid schema version.");
  if (dataset.recordCount !== dataset.records.length) issues.push("recordCount does not match records length.");
  if (hasInvalidNumber(dataset)) issues.push("Dataset contains NaN or Infinity.");
  if (hasRawPayloadKey(dataset)) issues.push("Dataset contains raw PDF/text payload keys.");
  for (const record of dataset.records) {
    const validation = validatePdfDecisionMlFeatureRecord(record);
    for (const issue of validation.issues) issues.push(`${record.ids?.filingId ?? "unknown"}: ${issue}`);
  }
  return { valid: issues.length === 0, issues };
}

export function serializePdfDecisionMlFeatureDatasetAsJsonl(
  dataset: PdfDecisionMlFeatureDataset,
): string {
  return dataset.records.map((record) => JSON.stringify(record)).join("\n");
}

export function serializePdfDecisionMlFeatureDatasetAsJson(
  dataset: PdfDecisionMlFeatureDataset,
): string {
  return JSON.stringify(dataset, null, 2);
}
