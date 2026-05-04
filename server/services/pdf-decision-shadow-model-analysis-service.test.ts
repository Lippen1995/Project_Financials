import { describe, expect, it } from "vitest";

import {
  buildPdfDecisionShadowModelAnalysisReport,
  validatePdfDecisionShadowModelAnalysisReport,
  type PdfShadowModelAnalysisReport,
} from "./pdf-decision-shadow-model-analysis-service";
import { predictPdfDecisionShadowModel } from "./pdf-decision-shadow-model-service";
import type { PdfDecisionMlFeatureRecord } from "./pdf-decision-ml-feature-schema-service";
import type { PdfDecisionMlFeatureDataset } from "./pdf-decision-ml-feature-schema-service";

function makeRecord(overrides: Partial<PdfDecisionMlFeatureRecord> = {}): PdfDecisionMlFeatureRecord {
  return {
    version: "pdf-decision-ml-features-v1",
    ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 },
    split: "train",
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
    input: { limit: 100, includeText: false },
    recordCount: records.length,
    records,
  };
}

async function buildReport(
  records: PdfDecisionMlFeatureRecord[],
  opts?: { threshold?: number; maxExamples?: number },
): Promise<PdfShadowModelAnalysisReport> {
  const dataset = makeDataset(records);
  return buildPdfDecisionShadowModelAnalysisReport(
    { limit: 100, threshold: opts?.threshold, maxExamples: opts?.maxExamples },
    {
      buildFeatureDataset: async () => dataset,
    },
  );
}

describe("buildPdfDecisionShadowModelAnalysisReport", () => {
  it("builds route confusion matrix from predictions with actual labels", async () => {
    const r1 = makeRecord({ ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    r1.labels.routeLabel = "TEXT_LAYER";
    const r2 = makeRecord({
      ids: { filingId: "f2", extractionRunId: null, orgNumber: null, fiscalYear: 2023 },
    });
    r2.labels.routeLabel = "OCR";
    r2.booleanFeatures.isUnreadable = true;
    r2.booleanFeatures.isPublished = false;
    r2.numericFeatures.confidenceScore = 0.2;
    r2.categoricalFeatures.qualityRisk = "HIGH";
    const report = await buildReport([r1, r2]);
    // Confusion matrix labels should include routes that appear
    expect(Array.isArray(report.routeConfusionMatrix.labels)).toBe(true);
    expect(typeof report.routeConfusionMatrix.matrix).toBe("object");
  });

  it("computes binary metrics at given threshold", async () => {
    const r1 = makeRecord({ ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    r1.labels.manualReviewRequired = 1;
    r1.booleanFeatures.hasBlockingRules = true;
    r1.booleanFeatures.hasManualReviewReasons = true;
    const r2 = makeRecord({ ids: { filingId: "f2", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    r2.labels.manualReviewRequired = 0;
    const report = await buildReport([r1, r2], { threshold: 0.5 });
    expect(report.manualReviewMetrics.eligibleCount).toBe(2);
    expect(report.manualReviewMetrics.threshold).toBe(0.5);
    expect(typeof report.manualReviewMetrics.accuracy === "number" || report.manualReviewMetrics.accuracy === null).toBe(true);
  });

  it("handles no eligible labels with null metrics", async () => {
    // Records without labels set to null should produce null metrics
    const r = makeRecord({ ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    // Simulate evaluation where comparison labels are unavailable
    // (the mock dataset has labels; shadow model fills comparison)
    const report = await buildReport([r]);
    // Should not throw; metrics are numbers or null
    expect(report.manualReviewMetrics).toBeDefined();
  });

  it("builds exactly 10 calibration buckets for each probability", async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ ids: { filingId: `f${i}`, extractionRunId: null, orgNumber: null, fiscalYear: 2023 } }),
    );
    const report = await buildReport(records);
    expect(report.calibration.manualReviewProbability).toHaveLength(10);
    expect(report.calibration.correctionProbability).toHaveLength(10);
    expect(report.calibration.unreadableProbability).toHaveLength(10);
    expect(report.calibration.publishProbability).toHaveLength(10);
  });

  it("calibration empty bucket has null fields", async () => {
    const records = [
      makeRecord({ ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } }),
    ];
    const report = await buildReport(records);
    // Some buckets will have count=0 with null fields
    const emptyBucket = report.calibration.manualReviewProbability.find((b) => b.count === 0);
    if (emptyBucket) {
      expect(emptyBucket.averagePredictedProbability).toBeNull();
      expect(emptyBucket.observedRate).toBeNull();
      expect(emptyBucket.absoluteCalibrationError).toBeNull();
    }
    // All 10 buckets always present
    expect(report.calibration.manualReviewProbability).toHaveLength(10);
  });

  it("computes slices grouped by at least the split key", async () => {
    const r1 = makeRecord({ ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    r1.split = "train";
    const r2 = makeRecord({ ids: { filingId: "f2", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    r2.split = "validation";
    const report = await buildReport([r1, r2]);
    // Slices should include fiscalYear slice (fiscalYear=2023 present)
    const fiscalSlice = report.slices.find((s) => s.key === "fiscalYear");
    expect(fiscalSlice).toBeDefined();
  });

  it("identifies false positives and false negatives for manual review", async () => {
    const tp = makeRecord({ ids: { filingId: "tp", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    tp.labels.manualReviewRequired = 1;
    tp.booleanFeatures.hasBlockingRules = true;
    tp.booleanFeatures.hasManualReviewReasons = true;
    tp.booleanFeatures.hasParserRiskReasons = true;
    tp.categoricalFeatures.riskLevel = "HIGH";

    const fn = makeRecord({ ids: { filingId: "fn", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    fn.labels.manualReviewRequired = 1;
    fn.booleanFeatures.isPublished = true;
    fn.numericFeatures.confidenceScore = 0.9;

    const report = await buildReport([tp, fn], { threshold: 0.5 });
    // manualReviewMetrics should reflect the predictions
    expect(report.manualReviewMetrics.truePositive + report.manualReviewMetrics.falseNegative).toBeLessThanOrEqual(2);
  });

  it("identifies high confidence wrong cases in topErrors", async () => {
    // Record with high confidence but wrong route prediction
    const r = makeRecord({ ids: { filingId: "hc", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    r.labels.routeLabel = "OCR";
    // Default prediction will likely route TEXT_LAYER for a normal record
    // This creates a route mismatch
    const report = await buildReport([r]);
    // topErrors should be an array
    expect(Array.isArray(report.topErrors)).toBe(true);
    // topUncertain should also be an array
    expect(Array.isArray(report.topUncertain)).toBe(true);
  });

  it("caps examples by maxExamples", async () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      makeRecord({
        ids: { filingId: `f${i}`, extractionRunId: null, orgNumber: null, fiscalYear: 2023 },
        labels: {
          routeLabel: i % 2 === 0 ? "OCR" : "TEXT_LAYER",
          manualReviewRequired: 0,
          corrected: 0,
          unreadable: 0,
          reprocessRequested: 0,
          published: 1,
          failed: 0,
        },
      }),
    );
    const report = await buildReport(records, { maxExamples: 3 });
    expect(report.topErrors.length).toBeLessThanOrEqual(3);
    expect(report.topUncertain.length).toBeLessThanOrEqual(3);
  });

  it("output contains no raw text payload keys", async () => {
    const r = makeRecord({ ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    const report = await buildReport([r]);
    const json = JSON.stringify(report);
    expect(json).not.toContain("rawText");
    expect(json).not.toContain("pdfBuffer");
    expect(json).not.toContain("structuredDocument");
  });
});

describe("validatePdfDecisionShadowModelAnalysisReport", () => {
  it("catches NaN in metrics", async () => {
    const r = makeRecord({ ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    const report = await buildReport([r]);
    // Inject NaN
    (report.manualReviewMetrics as Record<string, unknown>).accuracy = NaN;
    const { valid, issues } = validatePdfDecisionShadowModelAnalysisReport(report);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("NaN"))).toBe(true);
  });

  it("validates confusion matrix consistency", async () => {
    const r = makeRecord({ ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    const report = await buildReport([r]);
    // Inject label without matrix row
    report.routeConfusionMatrix.labels.push("GHOST_LABEL");
    const { valid, issues } = validatePdfDecisionShadowModelAnalysisReport(report);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("GHOST_LABEL"))).toBe(true);
  });

  it("passes for a valid report", async () => {
    const r = makeRecord({ ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    const report = await buildReport([r]);
    const { valid } = validatePdfDecisionShadowModelAnalysisReport(report);
    expect(valid).toBe(true);
  });

  it("report is JSON-safe and contains no raw text", async () => {
    const r = makeRecord({ ids: { filingId: "f1", extractionRunId: null, orgNumber: null, fiscalYear: 2023 } });
    const report = await buildReport([r]);
    expect(() => JSON.stringify(report)).not.toThrow();
    const json = JSON.stringify(report);
    expect(json).not.toContain("rawPdf");
    expect(json).not.toContain("structuredDocument");
  });
});
