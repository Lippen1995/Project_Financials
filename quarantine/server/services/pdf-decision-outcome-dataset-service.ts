import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { listAnnualReportDecisionShadowRows } from "@/server/persistence/annual-report-decision-shadow-repository";
import { listPdfDecisionGoldSetItemsByFilingIds } from "@/server/persistence/pdf-decision-gold-set-repository";
import {
  evaluatePdfDecisionShadow,
  type PdfDecisionShadowDocument,
  type PdfDecisionShadowEvaluationResult,
} from "@/server/services/annual-report-pdf-decision-shadow-evaluation";

export type PdfDecisionOutcomeDatasetRecord = {
  version: "pdf-decision-outcome-dataset-v1";
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  features: {
    decisionRoute?: string | null;
    riskLevel?: string | null;
    confidenceScore?: number | null;
    ruleConfigVersion?: string | null;
    qualityRisk?: string | null;
    recommendedRouteHint?: string | null;
    parserRiskReasonCount: number;
    extractionWarningCount: number;
    manualReviewReasonCount: number;
    blockingRuleCount: number;
    warningRuleCount: number;
    hasStructuredDocument: boolean;
    hasPdfDecision: boolean;
    hasPostValidationDecision: boolean;
    hasGoldSet: boolean;
    goldSetStatus?: string | null;
    trainingLabelCount: number;
    reviewedFactCount: number;
  };
  labels: {
    outcome: string;
    latestReviewDecisionType?: string | null;
    published: boolean;
    corrected: boolean;
    unreadable: boolean;
    reprocessRequested: boolean;
    failed: boolean;
  };
  diagnostics: {
    manualReviewReasons: string[];
    blockingRuleCodes: string[];
    parserRiskReasons: string[];
  };
};

export type PdfDecisionOutcomeDataset = {
  version: "pdf-decision-outcome-dataset-v1";
  generatedAt: string;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
    includeText: boolean;
  };
  recordCount: number;
  records: PdfDecisionOutcomeDatasetRecord[];
};

export class PdfDecisionOutcomeDatasetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfDecisionOutcomeDatasetValidationError";
  }
}

type DatasetInput = {
  limit?: number;
  fiscalYear?: number;
  orgNumber?: string;
  includeText?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reviewedFactCount(doc: PdfDecisionShadowDocument): number {
  const value = (doc as PdfDecisionShadowDocument & { reviewedFactCount?: number }).reviewedFactCount;
  return Number.isFinite(value) ? value ?? 0 : 0;
}

function mapDocumentToRecord(doc: PdfDecisionShadowDocument): PdfDecisionOutcomeDatasetRecord {
  const corrected =
    doc.outcome === "MANUAL_REVIEW_CORRECTED" || doc.latestReviewDecisionType === "CORRECTED";
  const unreadable =
    doc.outcome === "MANUAL_REVIEW_UNREADABLE" || doc.latestReviewDecisionType === "UNREADABLE";
  const reprocessRequested =
    doc.outcome === "REPROCESS_REQUESTED" ||
    doc.latestReviewDecisionType === "REPROCESS_REQUESTED";
  const published =
    doc.outcome === "PUBLISHED" || doc.latestReviewDecisionType === "PUBLISHED_FROM_REVIEW";

  return {
    version: "pdf-decision-outcome-dataset-v1",
    filingId: doc.filingId,
    extractionRunId: doc.extractionRunId ?? null,
    orgNumber: doc.orgNumber ?? null,
    fiscalYear: doc.fiscalYear ?? null,
    features: {
      decisionRoute: doc.decisionRoute ?? null,
      riskLevel: doc.riskLevel ?? null,
      confidenceScore: doc.confidenceScore ?? null,
      ruleConfigVersion: doc.ruleConfigVersion ?? null,
      qualityRisk: doc.qualityRisk ?? null,
      recommendedRouteHint: doc.recommendedRouteHint ?? null,
      parserRiskReasonCount: doc.parserRiskReasons.length,
      extractionWarningCount: doc.extractionWarnings.length,
      manualReviewReasonCount: doc.manualReviewReasons.length,
      blockingRuleCount: doc.blockingRuleCodes.length,
      warningRuleCount: doc.warningRuleCodes.length,
      hasStructuredDocument: doc.hasStructuredDocument,
      hasPdfDecision: doc.hasPdfDecision,
      hasPostValidationDecision: doc.hasPostValidationDecision,
      hasGoldSet: Boolean(doc.goldSet),
      goldSetStatus: doc.goldSet?.status ?? null,
      trainingLabelCount: doc.trainingLabelCount,
      reviewedFactCount: reviewedFactCount(doc),
    },
    labels: {
      outcome: doc.outcome,
      latestReviewDecisionType: doc.latestReviewDecisionType ?? null,
      published,
      corrected,
      unreadable,
      reprocessRequested,
      failed: doc.outcome === "FAILED",
    },
    diagnostics: {
      manualReviewReasons: doc.manualReviewReasons,
      blockingRuleCodes: doc.blockingRuleCodes,
      parserRiskReasons: doc.parserRiskReasons,
    },
  };
}

export function validatePdfDecisionOutcomeDatasetRecord(
  record: unknown,
): asserts record is PdfDecisionOutcomeDatasetRecord {
  if (!isRecord(record)) {
    throw new PdfDecisionOutcomeDatasetValidationError("Record must be an object.");
  }
  if (record.version !== "pdf-decision-outcome-dataset-v1") {
    throw new PdfDecisionOutcomeDatasetValidationError("Invalid dataset record version.");
  }
  if (typeof record.filingId !== "string" || record.filingId.trim().length === 0) {
    throw new PdfDecisionOutcomeDatasetValidationError("filingId is required.");
  }
  if (!isRecord(record.features)) {
    throw new PdfDecisionOutcomeDatasetValidationError("features must be an object.");
  }
  if (!isRecord(record.labels)) {
    throw new PdfDecisionOutcomeDatasetValidationError("labels must be an object.");
  }
  if (!isRecord(record.diagnostics)) {
    throw new PdfDecisionOutcomeDatasetValidationError("diagnostics must be an object.");
  }
  for (const field of [
    "parserRiskReasonCount",
    "extractionWarningCount",
    "manualReviewReasonCount",
    "blockingRuleCount",
    "warningRuleCount",
    "trainingLabelCount",
    "reviewedFactCount",
  ]) {
    if (typeof record.features[field] !== "number") {
      throw new PdfDecisionOutcomeDatasetValidationError(`${field} must be a number.`);
    }
  }
  const serialized = JSON.stringify(record);
  if (/rawText|normalizedText|pdfBuffer|pagesText|fullText/i.test(serialized)) {
    throw new PdfDecisionOutcomeDatasetValidationError("Record contains raw text/PDF fields.");
  }
}

export async function buildPdfDecisionOutcomeDataset(
  input?: DatasetInput,
  deps?: {
    evaluateShadow?: (params: {
      limit: number;
      fiscalYear?: number;
      orgNumber?: string;
    }) => Promise<PdfDecisionShadowEvaluationResult>;
  },
): Promise<PdfDecisionOutcomeDataset> {
  const limit = input?.limit ?? 100;
  const includeText = input?.includeText ?? false;
  const evaluateShadow =
    deps?.evaluateShadow ??
    (async (params: { limit: number; fiscalYear?: number; orgNumber?: string }) => {
      const storage = new LocalAnnualReportArtifactStorage();
      return evaluatePdfDecisionShadow(params, {
        listRows: listAnnualReportDecisionShadowRows,
        listGoldSetItems: listPdfDecisionGoldSetItemsByFilingIds,
        readArtifact: async (key) => {
          try {
            return await storage.getArtifactBuffer(key);
          } catch {
            return null;
          }
        },
      });
    });

  const shadow = await evaluateShadow({
    limit,
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.orgNumber,
  });
  const records = shadow.documents.map(mapDocumentToRecord);
  for (const record of records) validatePdfDecisionOutcomeDatasetRecord(record);

  return {
    version: "pdf-decision-outcome-dataset-v1",
    generatedAt: new Date().toISOString(),
    input: {
      limit,
      fiscalYear: input?.fiscalYear,
      orgNumber: input?.orgNumber,
      includeText,
    },
    recordCount: records.length,
    records,
  };
}

export function serializePdfDecisionOutcomeDatasetJsonl(
  dataset: PdfDecisionOutcomeDataset,
): string {
  return dataset.records.map((record) => JSON.stringify(record)).join("\n");
}

export function writePdfDecisionOutcomeDataset(
  dataset: PdfDecisionOutcomeDataset,
  outputPath: string,
  format: "json" | "jsonl",
) {
  const resolved = resolve(process.cwd(), outputPath);
  const content =
    format === "json"
      ? JSON.stringify(dataset.records, null, 2)
      : serializePdfDecisionOutcomeDatasetJsonl(dataset);
  writeFileSync(resolved, `${content}\n`, "utf8");
}
