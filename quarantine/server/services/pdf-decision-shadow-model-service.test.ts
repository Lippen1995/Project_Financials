import { describe, expect, it } from "vitest";

import type {
  PdfDecisionMlFeatureDataset,
  PdfDecisionMlFeatureRecord,
} from "./pdf-decision-ml-feature-schema-service";
import {
  evaluatePdfDecisionShadowModel,
  predictPdfDecisionShadowModel,
  validatePdfDecisionShadowModelEvaluation,
  validatePdfDecisionShadowModelPrediction,
} from "./pdf-decision-shadow-model-service";

function makeRecord(overrides: Partial<PdfDecisionMlFeatureRecord> = {}): PdfDecisionMlFeatureRecord {
  const base: PdfDecisionMlFeatureRecord = {
    version: "pdf-decision-ml-features-v1",
    ids: {
      filingId: "filing-1",
      extractionRunId: "run-1",
      orgNumber: "999999999",
      fiscalYear: 2024,
    },
    split: "validation",
    numericFeatures: {
      confidenceScore: 0.86,
      parserRiskReasonCount: 0,
      extractionWarningCount: 0,
      manualReviewReasonCount: 0,
      blockingRuleCount: 0,
      warningRuleCount: 0,
      trainingLabelCount: 0,
      reviewedFactCount: 0,
      samplePriority: null,
      remediationItemCount: null,
    },
    booleanFeatures: {
      hasStructuredDocument: true,
      hasPdfDecision: true,
      hasPostValidationDecision: true,
      hasGoldSet: false,
      isGoldSetApproved: false,
      hasParserRiskReasons: false,
      hasBlockingRules: false,
      hasManualReviewReasons: false,
      hasCorrections: false,
      isUnreadable: false,
      isReprocessRequested: false,
      isPublished: true,
    },
    categoricalFeatures: {
      decisionRoute: "TEXT_LAYER",
      riskLevel: "LOW",
      qualityRisk: "LOW",
      recommendedRouteHint: null,
      ruleConfigVersion: "pdf-decision-rules-v1",
      goldSetStatus: null,
      latestReviewDecisionType: null,
      currentOutcome: "PUBLISHED",
    },
    multiCategoricalFeatures: {
      manualReviewReasons: [],
      blockingRuleCodes: [],
      parserRiskReasons: [],
    },
    labels: {
      routeLabel: "TEXT_LAYER",
      manualReviewRequired: 0,
      corrected: 0,
      unreadable: 0,
      reprocessRequested: 0,
      published: 1,
      failed: 0,
    },
    labelProvenance: {
      sourceOutcome: "PUBLISHED",
      latestReviewDecisionType: null,
      goldSetStatus: null,
      derivedFrom: ["OUTCOME_DATASET"],
    },
  };
  return {
    ...base,
    ...overrides,
    ids: { ...base.ids, ...(overrides.ids ?? {}) },
    numericFeatures: { ...base.numericFeatures, ...(overrides.numericFeatures ?? {}) },
    booleanFeatures: { ...base.booleanFeatures, ...(overrides.booleanFeatures ?? {}) },
    categoricalFeatures: { ...base.categoricalFeatures, ...(overrides.categoricalFeatures ?? {}) },
    multiCategoricalFeatures: {
      ...base.multiCategoricalFeatures,
      ...(overrides.multiCategoricalFeatures ?? {}),
    },
    labels: { ...base.labels, ...(overrides.labels ?? {}) },
    labelProvenance: { ...base.labelProvenance, ...(overrides.labelProvenance ?? {}) },
  };
}

function makeDataset(records: PdfDecisionMlFeatureRecord[]): PdfDecisionMlFeatureDataset {
  return {
    version: "pdf-decision-ml-feature-dataset-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    schemaVersion: "pdf-decision-ml-features-v1",
    input: { limit: records.length || 100, includeText: false },
    recordCount: records.length,
    records,
  };
}

describe("pdf decision shadow model service", () => {
  it("predicts deterministic probabilities", () => {
    const record = makeRecord();

    expect(predictPdfDecisionShadowModel(record)).toEqual(predictPdfDecisionShadowModel(record));
  });

  it("clamps probabilities to 0-1", () => {
    const prediction = predictPdfDecisionShadowModel(
      makeRecord({
        numericFeatures: {
          ...makeRecord().numericFeatures,
          confidenceScore: 0,
          parserRiskReasonCount: 10,
          blockingRuleCount: 10,
          manualReviewReasonCount: 10,
          trainingLabelCount: 10,
          reviewedFactCount: 10,
        },
        booleanFeatures: {
          ...makeRecord().booleanFeatures,
          hasParserRiskReasons: true,
          hasBlockingRules: true,
          hasManualReviewReasons: true,
          hasCorrections: true,
          isUnreadable: true,
          isReprocessRequested: true,
        },
      }),
    );

    for (const value of Object.values(prediction.predictions).filter((v) => typeof v === "number")) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("raises manual review probability for high-risk blocking records", () => {
    const prediction = predictPdfDecisionShadowModel(
      makeRecord({
        booleanFeatures: {
          ...makeRecord().booleanFeatures,
          hasBlockingRules: true,
          hasManualReviewReasons: true,
        },
        categoricalFeatures: { ...makeRecord().categoricalFeatures, riskLevel: "HIGH" },
      }),
    );

    expect(prediction.predictions.manualReviewProbability).toBeGreaterThan(0.5);
  });

  it("raises unreadable probability for unreadable records", () => {
    const prediction = predictPdfDecisionShadowModel(
      makeRecord({
        booleanFeatures: { ...makeRecord().booleanFeatures, isUnreadable: true },
        categoricalFeatures: { ...makeRecord().categoricalFeatures, qualityRisk: "HIGH" },
      }),
    );

    expect(prediction.predictions.unreadableProbability).toBeGreaterThan(0.5);
  });

  it("published stable records favor publish probability and TEXT_LAYER route", () => {
    const prediction = predictPdfDecisionShadowModel(makeRecord());

    expect(prediction.predictions.publishProbability).toBeGreaterThan(0.6);
    expect(prediction.predictions.routeRecommendation).toBe("TEXT_LAYER");
  });

  it("route recommendation is deterministic", () => {
    const record = makeRecord({
      booleanFeatures: { ...makeRecord().booleanFeatures, hasParserRiskReasons: true },
      multiCategoricalFeatures: {
        ...makeRecord().multiCategoricalFeatures,
        parserRiskReasons: ["reading order issue"],
      },
    });

    expect(predictPdfDecisionShadowModel(record).predictions.routeRecommendation).toBe(
      predictPdfDecisionShadowModel(record).predictions.routeRecommendation,
    );
  });

  it("evaluation computes route accuracy", async () => {
    const evaluation = await evaluatePdfDecisionShadowModel(
      { split: "all" },
      { buildFeatureDataset: async () => makeDataset([makeRecord()]) },
    );

    expect(evaluation.metrics.routeAccuracy).toBe(1);
    expect(evaluation.metrics.manualReviewAccuracy).toBe(1);
  });

  it("handles no eligible route labels with null route accuracy", async () => {
    const evaluation = await evaluatePdfDecisionShadowModel(
      { split: "all" },
      {
        buildFeatureDataset: async () =>
          makeDataset([makeRecord({ labels: { ...makeRecord().labels, routeLabel: "UNKNOWN" } })]),
      },
    );

    expect(evaluation.metrics.routeAccuracy).toBeNull();
  });

  it("filters by split", async () => {
    const evaluation = await evaluatePdfDecisionShadowModel(
      { split: "test" },
      {
        buildFeatureDataset: async () =>
          makeDataset([
            makeRecord({ ids: { filingId: "train" }, split: "train" }),
            makeRecord({ ids: { filingId: "test" }, split: "test" }),
          ]),
      },
    );

    expect(evaluation.recordCount).toBe(1);
    expect(evaluation.predictions[0].filingId).toBe("test");
  });

  it("validation catches invalid probability and NaN", async () => {
    const prediction = predictPdfDecisionShadowModel(makeRecord());
    const malformed = {
      ...prediction,
      predictions: { ...prediction.predictions, manualReviewProbability: Number.NaN },
    };

    expect(validatePdfDecisionShadowModelPrediction(malformed).valid).toBe(false);
  });

  it("output is JSON-safe and contains no raw text fields", async () => {
    const evaluation = await evaluatePdfDecisionShadowModel(
      { split: "all" },
      { buildFeatureDataset: async () => makeDataset([makeRecord()]) },
    );

    expect(validatePdfDecisionShadowModelEvaluation(evaluation).valid).toBe(true);
    expect(JSON.stringify(evaluation)).not.toMatch(/rawText|fullText|pdfBuffer/);
  });
});
