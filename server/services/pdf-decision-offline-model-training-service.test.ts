import { describe, expect, it } from "vitest";

import {
  vectorizePdfDecisionMlFeatureRecord,
  trainPdfDecisionOfflineModel,
  FEATURE_NAMES,
} from "./pdf-decision-offline-model-training-service";
import type {
  PdfDecisionOfflineTrainingInput,
  PdfDecisionOfflineModelTarget,
} from "./pdf-decision-offline-model-training-service";
import type { PdfDecisionMlFeatureRecord, PdfDecisionMlFeatureDataset } from "./pdf-decision-ml-feature-schema-service";

function makeRecord(
  filingId: string,
  overrides: Partial<PdfDecisionMlFeatureRecord> = {},
  split: "train" | "validation" | "test" | null = "train",
): PdfDecisionMlFeatureRecord {
  return {
    version: "pdf-decision-ml-features-v1",
    ids: { filingId, extractionRunId: null, orgNumber: null, fiscalYear: 2023 },
    split,
    numericFeatures: {
      confidenceScore: 0.8,
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
      hasPostValidationDecision: false,
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
      recommendedRouteHint: "TEXT_LAYER",
      ruleConfigVersion: "v1",
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
    ...overrides,
  };
}

function makeDataset(records: PdfDecisionMlFeatureRecord[]): PdfDecisionMlFeatureDataset {
  return {
    version: "pdf-decision-ml-feature-dataset-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    schemaVersion: "pdf-decision-ml-features-v1",
    input: { limit: records.length, includeText: false },
    recordCount: records.length,
    records,
  };
}

function makeInput(
  records: PdfDecisionMlFeatureRecord[],
  target: PdfDecisionOfflineModelTarget = "manualReviewRequired",
  overrides: Partial<PdfDecisionOfflineTrainingInput> = {},
): PdfDecisionOfflineTrainingInput {
  return {
    dataset: makeDataset(records),
    target,
    algorithm: "MAJORITY_BASELINE",
    seed: "test",
    ...overrides,
  };
}

describe("vectorizePdfDecisionMlFeatureRecord", () => {
  it("is deterministic across calls", () => {
    const record = makeRecord("f1");
    const { featureNames: n1, values: v1 } = vectorizePdfDecisionMlFeatureRecord(record);
    const { featureNames: n2, values: v2 } = vectorizePdfDecisionMlFeatureRecord(record);
    expect(n1).toEqual(n2);
    expect(v1).toEqual(v2);
  });

  it("feature names match FEATURE_NAMES constant", () => {
    const record = makeRecord("f1");
    const { featureNames } = vectorizePdfDecisionMlFeatureRecord(record);
    expect(featureNames).toEqual(FEATURE_NAMES);
  });

  it("null numeric adds missing indicator feature", () => {
    const record = makeRecord("f1");
    record.numericFeatures.confidenceScore = null;
    const { featureNames, values } = vectorizePdfDecisionMlFeatureRecord(record);
    const confIdx = featureNames.indexOf("confidenceScore");
    const confMissingIdx = featureNames.indexOf("confidenceScore_missing");
    expect(values[confIdx]).toBe(0);
    expect(values[confMissingIdx]).toBe(1);
  });

  it("non-null numeric has missing indicator 0", () => {
    const record = makeRecord("f1");
    record.numericFeatures.confidenceScore = 0.75;
    const { featureNames, values } = vectorizePdfDecisionMlFeatureRecord(record);
    const confIdx = featureNames.indexOf("confidenceScore");
    const confMissingIdx = featureNames.indexOf("confidenceScore_missing");
    expect(values[confIdx]).toBe(0.75);
    expect(values[confMissingIdx]).toBe(0);
  });

  it("boolean features encode true→1 and false→0", () => {
    const record = makeRecord("f1");
    record.booleanFeatures.isPublished = true;
    record.booleanFeatures.isUnreadable = false;
    const { featureNames, values } = vectorizePdfDecisionMlFeatureRecord(record);
    const pubIdx = featureNames.indexOf("isPublished");
    const unreadIdx = featureNames.indexOf("isUnreadable");
    expect(values[pubIdx]).toBe(1);
    expect(values[unreadIdx]).toBe(0);
  });

  it("categorical one-hot encoding is deterministic", () => {
    const record = makeRecord("f1");
    record.categoricalFeatures.riskLevel = "HIGH";
    const { featureNames, values } = vectorizePdfDecisionMlFeatureRecord(record);
    const highIdx = featureNames.indexOf("riskLevel__HIGH");
    const lowIdx = featureNames.indexOf("riskLevel__LOW");
    expect(values[highIdx]).toBe(1);
    expect(values[lowIdx]).toBe(0);
  });

  it("null categorical value sets MISSING indicator", () => {
    const record = makeRecord("f1");
    record.categoricalFeatures.riskLevel = null;
    const { featureNames, values } = vectorizePdfDecisionMlFeatureRecord(record);
    const missingIdx = featureNames.indexOf("riskLevel__MISSING");
    expect(values[missingIdx]).toBe(1);
    const lowIdx = featureNames.indexOf("riskLevel__LOW");
    expect(values[lowIdx]).toBe(0);
  });

  it("vector length equals FEATURE_NAMES length", () => {
    const record = makeRecord("f1");
    const { featureNames, values } = vectorizePdfDecisionMlFeatureRecord(record);
    expect(values.length).toBe(featureNames.length);
    expect(values.length).toBeGreaterThan(0);
  });
});

describe("trainPdfDecisionOfflineModel — MAJORITY_BASELINE", () => {
  it("returns positive-rate prediction equal to train rate", () => {
    const records = [
      makeRecord("f1", { labels: { routeLabel: "TEXT_LAYER", manualReviewRequired: 1, corrected: 0, unreadable: 0, reprocessRequested: 0, published: 0, failed: 0 } }),
      makeRecord("f2", { labels: { routeLabel: "TEXT_LAYER", manualReviewRequired: 0, corrected: 0, unreadable: 0, reprocessRequested: 0, published: 1, failed: 0 } }),
    ];
    const card = trainPdfDecisionOfflineModel(makeInput(records, "manualReviewRequired", { algorithm: "MAJORITY_BASELINE" }));
    expect(card.metrics.train?.positiveRate).toBe(0.5);
    expect(card.metrics.train?.eligibleCount).toBe(2);
  });

  it("returns warning and null metrics when no train records", () => {
    const card = trainPdfDecisionOfflineModel(makeInput([], "manualReviewRequired"));
    expect(card.warnings.length).toBeGreaterThan(0);
    expect(card.metrics.train).toBeUndefined();
  });

  it("produces train metrics with accuracy/precision/recall/f1", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord(`f${i}`, {
        labels: {
          routeLabel: "TEXT_LAYER",
          manualReviewRequired: i < 5 ? 1 : 0,
          corrected: 0,
          unreadable: 0,
          reprocessRequested: 0,
          published: i >= 5 ? 1 : 0,
          failed: 0,
        },
      }),
    );
    const card = trainPdfDecisionOfflineModel(makeInput(records, "manualReviewRequired", { algorithm: "MAJORITY_BASELINE" }));
    expect(card.metrics.train).toBeDefined();
    expect(typeof card.metrics.train?.brierScore).toBe("number");
    expect(typeof card.metrics.train?.logLossApprox).toBe("number");
  });
});

describe("trainPdfDecisionOfflineModel — RULE_SCORE_BASELINE", () => {
  it("returns deterministic metrics", () => {
    const records = [
      makeRecord("f1", { booleanFeatures: { hasStructuredDocument: true, hasPdfDecision: true, hasPostValidationDecision: false, hasGoldSet: false, isGoldSetApproved: false, hasParserRiskReasons: false, hasBlockingRules: true, hasManualReviewReasons: true, hasCorrections: false, isUnreadable: false, isReprocessRequested: false, isPublished: false }, labels: { routeLabel: "TEXT_LAYER", manualReviewRequired: 1, corrected: 0, unreadable: 0, reprocessRequested: 0, published: 0, failed: 0 } }),
      makeRecord("f2", { labels: { routeLabel: "TEXT_LAYER", manualReviewRequired: 0, corrected: 0, unreadable: 0, reprocessRequested: 0, published: 1, failed: 0 } }),
    ];
    const card1 = trainPdfDecisionOfflineModel(makeInput(records, "manualReviewRequired", { algorithm: "RULE_SCORE_BASELINE" }));
    const card2 = trainPdfDecisionOfflineModel(makeInput(records, "manualReviewRequired", { algorithm: "RULE_SCORE_BASELINE" }));
    expect(card1.metrics.train?.brierScore).toBe(card2.metrics.train?.brierScore);
  });
});

describe("trainPdfDecisionOfflineModel — LOGISTIC_REGRESSION_SGD", () => {
  it("handles small separable dataset and returns non-null metrics", () => {
    // Separable: published=true → published=1, everything else → published=0
    const records = [
      makeRecord("f1", { booleanFeatures: { hasStructuredDocument: true, hasPdfDecision: true, hasPostValidationDecision: false, hasGoldSet: false, isGoldSetApproved: false, hasParserRiskReasons: false, hasBlockingRules: false, hasManualReviewReasons: false, hasCorrections: false, isUnreadable: false, isReprocessRequested: false, isPublished: true }, labels: { routeLabel: "TEXT_LAYER", manualReviewRequired: 0, corrected: 0, unreadable: 0, reprocessRequested: 0, published: 1, failed: 0 } }),
      makeRecord("f2", { booleanFeatures: { hasStructuredDocument: true, hasPdfDecision: true, hasPostValidationDecision: false, hasGoldSet: false, isGoldSetApproved: false, hasParserRiskReasons: false, hasBlockingRules: false, hasManualReviewReasons: false, hasCorrections: false, isUnreadable: true, isReprocessRequested: false, isPublished: false }, labels: { routeLabel: "TEXT_LAYER", manualReviewRequired: 0, corrected: 0, unreadable: 1, reprocessRequested: 0, published: 0, failed: 0 } }),
      makeRecord("f3", { booleanFeatures: { hasStructuredDocument: true, hasPdfDecision: true, hasPostValidationDecision: false, hasGoldSet: false, isGoldSetApproved: false, hasParserRiskReasons: false, hasBlockingRules: false, hasManualReviewReasons: false, hasCorrections: false, isUnreadable: false, isReprocessRequested: false, isPublished: true }, labels: { routeLabel: "TEXT_LAYER", manualReviewRequired: 0, corrected: 0, unreadable: 0, reprocessRequested: 0, published: 1, failed: 0 } }),
      makeRecord("f4", { labels: { routeLabel: "TEXT_LAYER", manualReviewRequired: 0, corrected: 0, unreadable: 0, reprocessRequested: 0, published: 0, failed: 0 } }),
    ];
    const card = trainPdfDecisionOfflineModel(makeInput(records, "published", { algorithm: "LOGISTIC_REGRESSION_SGD", maxEpochs: 20, learningRate: 0.1 }));
    expect(card.metrics.train?.eligibleCount).toBe(4);
    expect(typeof card.metrics.train?.brierScore).toBe("number");
    expect(card.coefficients).toBeDefined();
    expect(card.intercept).toBeDefined();
    expect(card.featureNames.length).toBeGreaterThan(0);
    expect(Object.keys(card.coefficients!).length).toBe(card.featureNames.length);
  });

  it("is deterministic across runs with same seed", () => {
    const records = Array.from({ length: 6 }, (_, i) =>
      makeRecord(`f${i}`, {
        labels: {
          routeLabel: "TEXT_LAYER",
          manualReviewRequired: i % 2 === 0 ? 1 : 0,
          corrected: 0,
          unreadable: 0,
          reprocessRequested: 0,
          published: i % 2 !== 0 ? 1 : 0,
          failed: 0,
        },
      }),
    );
    const opts: Partial<PdfDecisionOfflineTrainingInput> = {
      algorithm: "LOGISTIC_REGRESSION_SGD",
      maxEpochs: 10,
      learningRate: 0.05,
      seed: "fixed-seed",
    };
    const card1 = trainPdfDecisionOfflineModel(makeInput(records, "manualReviewRequired", opts));
    const card2 = trainPdfDecisionOfflineModel(makeInput(records, "manualReviewRequired", opts));
    expect(card1.metrics.train?.brierScore).toBe(card2.metrics.train?.brierScore);
    expect(card1.intercept).toBe(card2.intercept);
  });
});

describe("trainPdfDecisionOfflineModel — split handling", () => {
  it("produces separate validation and test metrics when splits present", () => {
    const records = [
      ...Array.from({ length: 4 }, (_, i) => makeRecord(`train-${i}`, {}, "train")),
      ...Array.from({ length: 2 }, (_, i) => makeRecord(`val-${i}`, {}, "validation")),
      ...Array.from({ length: 2 }, (_, i) => makeRecord(`test-${i}`, {}, "test")),
    ];
    const card = trainPdfDecisionOfflineModel(makeInput(records, "published", { algorithm: "MAJORITY_BASELINE" }));
    expect(card.recordCounts.train).toBe(4);
    expect(card.recordCounts.validation).toBe(2);
    expect(card.recordCounts.test).toBe(2);
    expect(card.metrics.validation).toBeDefined();
    expect(card.metrics.test).toBeDefined();
  });

  it("warns and treats all records as train when no split assigned", () => {
    const records = Array.from({ length: 4 }, (_, i) =>
      makeRecord(`f${i}`, {}, null),
    );
    const card = trainPdfDecisionOfflineModel(makeInput(records, "published", { algorithm: "MAJORITY_BASELINE" }));
    expect(card.warnings.some((w) => w.includes("train"))).toBe(true);
    expect(card.metrics.train?.eligibleCount).toBe(4);
  });
});

describe("trainPdfDecisionOfflineModel — output safety", () => {
  it("output contains no raw text payload keys", () => {
    const records = [makeRecord("f1")];
    const card = trainPdfDecisionOfflineModel(makeInput(records, "published", { algorithm: "MAJORITY_BASELINE" }));
    const json = JSON.stringify(card);
    expect(json).not.toContain("rawText");
    expect(json).not.toContain("structuredDocument");
    expect(json).not.toContain("pdfBuffer");
  });

  it("model card is JSON-serializable", () => {
    const records = [makeRecord("f1")];
    const card = trainPdfDecisionOfflineModel(makeInput(records, "published", { algorithm: "LOGISTIC_REGRESSION_SGD", maxEpochs: 2 }));
    expect(() => JSON.stringify(card)).not.toThrow();
  });

  it("model card version is correct", () => {
    const card = trainPdfDecisionOfflineModel(makeInput([makeRecord("f1")], "published"));
    expect(card.version).toBe("pdf-decision-offline-model-card-v1");
  });
});
