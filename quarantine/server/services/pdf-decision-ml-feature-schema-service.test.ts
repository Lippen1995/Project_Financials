import { describe, expect, it } from "vitest";

import type {
  PdfDecisionOutcomeDataset,
  PdfDecisionOutcomeDatasetRecord,
} from "./pdf-decision-outcome-dataset-service";
import {
  buildPdfDecisionMlFeatureDataset,
  buildPdfDecisionMlFeatureRecordFromOutcomeRecord,
  PDF_DECISION_ML_FEATURE_SCHEMA,
  serializePdfDecisionMlFeatureDatasetAsJsonl,
  validatePdfDecisionMlFeatureDataset,
  validatePdfDecisionMlFeatureRecord,
  type PdfDecisionMlFeatureRecord,
} from "./pdf-decision-ml-feature-schema-service";

function makeOutcomeRecord(
  overrides: Partial<PdfDecisionOutcomeDatasetRecord> = {},
): PdfDecisionOutcomeDatasetRecord {
  return {
    version: "pdf-decision-outcome-dataset-v1",
    filingId: "filing-1",
    extractionRunId: "run-1",
    orgNumber: "999999999",
    fiscalYear: 2024,
    features: {
      decisionRoute: "TEXT_LAYER",
      riskLevel: "LOW",
      confidenceScore: 0.86,
      ruleConfigVersion: "pdf-decision-rules-v1",
      qualityRisk: "LOW",
      recommendedRouteHint: null,
      parserRiskReasonCount: 0,
      extractionWarningCount: 0,
      manualReviewReasonCount: 0,
      blockingRuleCount: 0,
      warningRuleCount: 0,
      hasStructuredDocument: true,
      hasPdfDecision: true,
      hasPostValidationDecision: true,
      hasGoldSet: false,
      goldSetStatus: null,
      trainingLabelCount: 0,
      reviewedFactCount: 0,
    },
    labels: {
      outcome: "PUBLISHED",
      latestReviewDecisionType: null,
      published: true,
      corrected: false,
      unreadable: false,
      reprocessRequested: false,
      failed: false,
    },
    diagnostics: {
      manualReviewReasons: [],
      blockingRuleCodes: [],
      parserRiskReasons: [],
    },
    ...overrides,
  };
}

function makeDataset(records: PdfDecisionOutcomeDatasetRecord[]): PdfDecisionOutcomeDataset {
  return {
    version: "pdf-decision-outcome-dataset-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    input: { limit: records.length || 100, includeText: false },
    recordCount: records.length,
    records,
  };
}

describe("pdf decision ML feature schema service", () => {
  it("converts an outcome record to an ML feature record", () => {
    const record = buildPdfDecisionMlFeatureRecordFromOutcomeRecord({
      record: makeOutcomeRecord(),
      split: "train",
    });

    expect(record.version).toBe("pdf-decision-ml-features-v1");
    expect(record.ids.filingId).toBe("filing-1");
    expect(record.split).toBe("train");
    expect(record.numericFeatures.confidenceScore).toBe(0.86);
    expect(record.labels.routeLabel).toBe("TEXT_LAYER");
  });

  it("derives binary labels correctly", () => {
    const record = buildPdfDecisionMlFeatureRecordFromOutcomeRecord({
      record: makeOutcomeRecord({
        labels: {
          outcome: "MANUAL_REVIEW_CORRECTED",
          latestReviewDecisionType: "CORRECTED",
          published: false,
          corrected: true,
          unreadable: false,
          reprocessRequested: false,
          failed: false,
        },
      }),
    });

    expect(record.labels.manualReviewRequired).toBe(1);
    expect(record.labels.corrected).toBe(1);
    expect(record.labels.published).toBe(0);
  });

  it("derives routeLabel with fallback to manual review", () => {
    const record = buildPdfDecisionMlFeatureRecordFromOutcomeRecord({
      record: makeOutcomeRecord({
        features: { ...makeOutcomeRecord().features, decisionRoute: null },
        labels: {
          outcome: "MANUAL_REVIEW_UNREADABLE",
          latestReviewDecisionType: "UNREADABLE",
          published: false,
          corrected: false,
          unreadable: true,
          reprocessRequested: false,
          failed: false,
        },
      }),
    });

    expect(record.labels.routeLabel).toBe("MANUAL_REVIEW");
  });

  it("keeps missing values as null or empty arrays according to policy", () => {
    const record = buildPdfDecisionMlFeatureRecordFromOutcomeRecord({
      record: makeOutcomeRecord({
        features: { ...makeOutcomeRecord().features, confidenceScore: null, qualityRisk: null },
        diagnostics: { manualReviewReasons: [], blockingRuleCodes: [], parserRiskReasons: [] },
      }),
    });

    expect(record.numericFeatures.confidenceScore).toBeNull();
    expect(record.categoricalFeatures.qualityRisk).toBeNull();
    expect(record.multiCategoricalFeatures.parserRiskReasons).toEqual([]);
  });

  it("does not include raw text fields", () => {
    const record = buildPdfDecisionMlFeatureRecordFromOutcomeRecord({ record: makeOutcomeRecord() });

    expect(JSON.stringify(record)).not.toMatch(/rawText|fullText|pdfBuffer|structuredDocument/);
  });

  it("validates a good record", () => {
    const record = buildPdfDecisionMlFeatureRecordFromOutcomeRecord({ record: makeOutcomeRecord() });

    expect(validatePdfDecisionMlFeatureRecord(record).valid).toBe(true);
  });

  it("catches NaN", () => {
    const record = buildPdfDecisionMlFeatureRecordFromOutcomeRecord({ record: makeOutcomeRecord() });
    const malformed: PdfDecisionMlFeatureRecord = {
      ...record,
      numericFeatures: { ...record.numericFeatures, confidenceScore: Number.NaN },
    };

    expect(validatePdfDecisionMlFeatureRecord(malformed).valid).toBe(false);
  });

  it("catches invalid binary labels", () => {
    const record = buildPdfDecisionMlFeatureRecordFromOutcomeRecord({ record: makeOutcomeRecord() });
    const malformed = {
      ...record,
      labels: { ...record.labels, failed: 2 },
    } as unknown as PdfDecisionMlFeatureRecord;

    expect(validatePdfDecisionMlFeatureRecord(malformed).valid).toBe(false);
  });

  it("builds dataset with deterministic splits using mocked outcome dataset", async () => {
    const outcomeDataset = makeDataset([
      makeOutcomeRecord({ filingId: "filing-a" }),
      makeOutcomeRecord({ filingId: "filing-b" }),
      makeOutcomeRecord({ filingId: "filing-c" }),
    ]);
    const first = await buildPdfDecisionMlFeatureDataset(
      { limit: 3, splitSeed: "seed-a" },
      { buildOutcomeDataset: async () => outcomeDataset },
    );
    const second = await buildPdfDecisionMlFeatureDataset(
      { limit: 3, splitSeed: "seed-a" },
      { buildOutcomeDataset: async () => outcomeDataset },
    );

    expect(first.records.map((record) => record.split)).toEqual(
      second.records.map((record) => record.split),
    );
    expect(validatePdfDecisionMlFeatureDataset(first).valid).toBe(true);
  });

  it("serializes JSONL as one object per line", async () => {
    const dataset = await buildPdfDecisionMlFeatureDataset(
      { limit: 2, includeSplits: false },
      {
        buildOutcomeDataset: async () =>
          makeDataset([
            makeOutcomeRecord({ filingId: "filing-a" }),
            makeOutcomeRecord({ filingId: "filing-b" }),
          ]),
      },
    );
    const lines = serializePdfDecisionMlFeatureDatasetAsJsonl(dataset).split("\n");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).ids.filingId).toBe("filing-a");
  });

  it("schema metadata includes all feature groups", () => {
    expect(PDF_DECISION_ML_FEATURE_SCHEMA.numericFeatures).toContain("confidenceScore");
    expect(PDF_DECISION_ML_FEATURE_SCHEMA.booleanFeatures).toContain("hasPdfDecision");
    expect(PDF_DECISION_ML_FEATURE_SCHEMA.categoricalFeatures).toContain("decisionRoute");
    expect(PDF_DECISION_ML_FEATURE_SCHEMA.multiCategoricalFeatures).toContain("blockingRuleCodes");
    expect(PDF_DECISION_ML_FEATURE_SCHEMA.labels).toContain("routeLabel");
  });
});
