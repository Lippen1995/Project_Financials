import { describe, expect, it } from "vitest";

import {
  buildPdfShadowVsRuleComparisonGateReport,
  validatePdfShadowVsRuleComparisonGateReport,
  serializePdfShadowVsRuleComparisonGateReportAsJson,
  type PdfShadowVsRuleComparisonGateReport,
} from "./pdf-shadow-vs-rule-comparison-gate-service";
import type { PdfDecisionShadowModelEvaluation } from "./pdf-decision-shadow-model-service";
import {
  PDF_DECISION_MODEL_REGISTRY_CONTRACT_VERSION,
  type PdfDecisionModelRegistryManifest,
} from "./pdf-decision-model-registry-contract-service";
import { PDF_DECISION_ML_FEATURE_SCHEMA_VERSION } from "./pdf-decision-ml-feature-schema-service";

function makePrediction(overrides: {
  filingId?: string;
  routeRecommendation?: string;
  manualReviewProbability?: number;
  unreadableProbability?: number;
  publishProbability?: number;
  actualRouteLabel?: string | null;
  actualManualReviewRequired?: 0 | 1 | null;
  actualUnreadable?: 0 | 1 | null;
  actualPublished?: 0 | 1 | null;
  routeMatch?: boolean | null;
} = {}): PdfDecisionShadowModelEvaluation["predictions"][number] {
  return {
    filingId: overrides.filingId ?? "filing-1",
    modelVersion: "pdf-decision-shadow-baseline-v1",
    featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    predictions: {
      routeRecommendation: (overrides.routeRecommendation ?? "PUBLISH") as never,
      manualReviewProbability: overrides.manualReviewProbability ?? 0.1,
      correctionProbability: 0.1,
      unreadableProbability: overrides.unreadableProbability ?? 0.05,
      reprocessProbability: 0.05,
      publishProbability: overrides.publishProbability ?? 0.8,
    },
    confidence: { overall: 0.8, route: 0.8, manualReview: 0.8 },
    explanations: [],
    comparison: {
      actualRouteLabel: overrides.actualRouteLabel ?? null,
      actualManualReviewRequired: overrides.actualManualReviewRequired ?? null,
      actualUnreadable: overrides.actualUnreadable ?? null,
      actualPublished: overrides.actualPublished ?? null,
      routeMatch: overrides.routeMatch ?? null,
    },
  };
}

function makeEvaluation(
  predictions: PdfDecisionShadowModelEvaluation["predictions"],
): PdfDecisionShadowModelEvaluation {
  return {
    version: "pdf-decision-shadow-model-evaluation-v1",
    generatedAt: new Date().toISOString(),
    modelVersion: "pdf-decision-shadow-baseline-v1",
    featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    input: { limit: 100 },
    recordCount: predictions.length,
    metrics: {},
    routePredictionDistribution: {},
    predictions,
  };
}

function makeManifest(
  overrides: Partial<PdfDecisionModelRegistryManifest> = {},
): PdfDecisionModelRegistryManifest {
  return {
    version: PDF_DECISION_MODEL_REGISTRY_CONTRACT_VERSION,
    modelId: "test-model",
    modelVersion: "v1",
    createdAt: "2026-01-01T00:00:00.000Z",
    lifecycleStage: "EXPERIMENTAL",
    target: "manualReviewRequired",
    algorithm: "MAJORITY_BASELINE",
    featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    compatibleFeatureSchemaVersions: [PDF_DECISION_ML_FEATURE_SCHEMA_VERSION],
    metrics: {},
    safety: {
      productionUseAllowed: false,
      routingUseAllowed: false,
      publishUseAllowed: false,
      requiresShadowGate: true,
      notes: [],
    },
    artifacts: [{ kind: "MODEL_CARD", path: null, sha256: null, sizeBytes: null, required: true }],
    provenance: { createdBy: null, sourceCommand: null, sourceCommitSha: null, trainingHarnessVersion: null },
    ...overrides,
  };
}

describe("buildPdfShadowVsRuleComparisonGateReport", () => {
  it("zero records => INSUFFICIENT_DATA", async () => {
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 10 },
      { evaluateShadowModel: async () => makeEvaluation([]) },
    );
    expect(report.status).toBe("INSUFFICIENT_DATA");
    const minCheck = report.checks.find((c) => c.code === "MIN_RECORD_COUNT");
    expect(minCheck?.status).toBe("INSUFFICIENT_DATA");
    expect(report.summary.recordCount).toBe(0);
  });

  it("enough good records with route matches => PASS", async () => {
    const predictions = Array.from({ length: 15 }, (_, i) =>
      makePrediction({
        filingId: `filing-${i}`,
        routeRecommendation: "PUBLISH",
        publishProbability: 0.85,
        manualReviewProbability: 0.1,
        actualRouteLabel: "PUBLISH",
        routeMatch: true,
        actualManualReviewRequired: 0,
        actualPublished: 1,
      }),
    );
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 10 },
      { evaluateShadowModel: async () => makeEvaluation(predictions) },
    );
    expect(report.status).toBe("PASS");
    expect(report.summary.recordCount).toBe(15);
  });

  it("low manual review recall => FAIL", async () => {
    // 5 actual manual review cases, shadow predicts low probability for all
    const mrPredictions = Array.from({ length: 5 }, (_, i) =>
      makePrediction({
        filingId: `mr-${i}`,
        manualReviewProbability: 0.1, // well below 0.5 threshold => all miss => recall=0
        publishProbability: 0.2,
        actualManualReviewRequired: 1,
        actualRouteLabel: "MANUAL_REVIEW",
        routeMatch: false,
      }),
    );
    // Pad with enough records to pass MIN_RECORD_COUNT
    const padding = Array.from({ length: 10 }, (_, i) =>
      makePrediction({ filingId: `pad-${i}`, actualManualReviewRequired: 0, routeMatch: true }),
    );
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 10 },
      { evaluateShadowModel: async () => makeEvaluation([...mrPredictions, ...padding]) },
    );
    const mrCheck = report.checks.find((c) => c.code === "MANUAL_REVIEW_RECALL");
    expect(mrCheck?.status).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  it("publish safety concern => FAIL", async () => {
    const unsafePrediction = makePrediction({
      filingId: "unsafe-1",
      publishProbability: 0.9, // >= 0.7
      manualReviewProbability: 0.05,
      actualManualReviewRequired: 1, // actual bad outcome
      routeMatch: false,
    });
    const padding = Array.from({ length: 14 }, (_, i) =>
      makePrediction({ filingId: `pad-${i}`, routeMatch: true }),
    );
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 10 },
      { evaluateShadowModel: async () => makeEvaluation([unsafePrediction, ...padding]) },
    );
    const safetyCheck = report.checks.find((c) => c.code === "PUBLISH_SAFETY");
    expect(safetyCheck?.status).toBe("FAIL");
    expect(report.status).toBe("FAIL");
    expect(report.summary.publishSafetyConcernCount).toBeGreaterThan(0);
  });

  it("shadow less conservative on conservative rule case => MEDIUM severity disagreement", async () => {
    const prediction = makePrediction({
      filingId: "less-conservative-1",
      routeRecommendation: "PUBLISH",
      publishProbability: 0.8,
      manualReviewProbability: 0.1,
      actualRouteLabel: "MANUAL_REVIEW", // rule is conservative
      routeMatch: false,
    });
    const padding = Array.from({ length: 14 }, (_, i) =>
      makePrediction({ filingId: `pad-${i}`, routeMatch: true }),
    );
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 10 },
      { evaluateShadowModel: async () => makeEvaluation([prediction, ...padding]) },
    );
    expect(report.summary.shadowLessConservativeCount).toBeGreaterThan(0);
    const item = report.items.find((i) => i.filingId === "less-conservative-1");
    expect(item?.disagreementType).toBe("SHADOW_LESS_CONSERVATIVE");
    expect(item?.severity).toBe("MEDIUM");
  });

  it("shadow more conservative counted separately", async () => {
    const prediction = makePrediction({
      filingId: "more-conservative-1",
      routeRecommendation: "MANUAL_REVIEW", // shadow is conservative
      publishProbability: 0.1,
      manualReviewProbability: 0.8,
      actualRouteLabel: "PUBLISH", // rule says publish
      routeMatch: false,
    });
    const padding = Array.from({ length: 14 }, (_, i) =>
      makePrediction({ filingId: `pad-${i}`, routeMatch: true }),
    );
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 10 },
      { evaluateShadowModel: async () => makeEvaluation([prediction, ...padding]) },
    );
    expect(report.summary.shadowMoreConservativeCount).toBeGreaterThan(0);
    const item = report.items.find((i) => i.filingId === "more-conservative-1");
    expect(item?.disagreementType).toBe("SHADOW_MORE_CONSERVATIVE");
    expect(item?.severity).toBe("LOW");
  });

  it("disagreement summary counts are correct", async () => {
    const predictions = [
      makePrediction({ filingId: "no-disagreement", routeMatch: true, actualRouteLabel: "PUBLISH" }),
      makePrediction({
        filingId: "less-cons",
        routeRecommendation: "PUBLISH",
        publishProbability: 0.8,
        actualRouteLabel: "MANUAL_REVIEW",
        routeMatch: false,
      }),
    ];
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 1 },
      { evaluateShadowModel: async () => makeEvaluation(predictions) },
    );
    expect(report.summary.disagreementCount).toBe(1);
    expect(report.summary.recordCount).toBe(2);
  });

  it("gate status WARN when below min count but nonzero", async () => {
    const predictions = Array.from({ length: 3 }, (_, i) =>
      makePrediction({ filingId: `f-${i}`, routeMatch: true }),
    );
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 10 },
      { evaluateShadowModel: async () => makeEvaluation(predictions) },
    );
    const minCheck = report.checks.find((c) => c.code === "MIN_RECORD_COUNT");
    expect(minCheck?.status).toBe("WARN");
  });

  it("validates model manifest when provided and manifest is safe", async () => {
    const manifest = makeManifest({ lifecycleStage: "SHADOW_CANDIDATE" });
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 1, modelManifest: manifest },
      { evaluateShadowModel: async () => makeEvaluation([makePrediction()]) },
    );
    expect(report.model?.modelId).toBe("test-model");
    expect(report.model?.lifecycleStage).toBe("SHADOW_CANDIDATE");
  });

  it("rejects unsafe manifest (REJECTED lifecycle stage)", async () => {
    const manifest = makeManifest({ lifecycleStage: "REJECTED" as never });
    await expect(
      buildPdfShadowVsRuleComparisonGateReport(
        { minRecordCount: 1, modelManifest: manifest },
        { evaluateShadowModel: async () => makeEvaluation([makePrediction()]) },
      ),
    ).rejects.toThrow(/REJECTED/);
  });

  it("rejects unsafe manifest (incompatible feature schema)", async () => {
    const manifest = makeManifest({ compatibleFeatureSchemaVersions: ["pdf-decision-ml-features-v0"] });
    await expect(
      buildPdfShadowVsRuleComparisonGateReport(
        { minRecordCount: 1, modelManifest: manifest },
        { evaluateShadowModel: async () => makeEvaluation([makePrediction()]) },
      ),
    ).rejects.toThrow(/incompatible/);
  });
});

describe("serializePdfShadowVsRuleComparisonGateReportAsJson", () => {
  it("serialization is JSON-safe", async () => {
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 1 },
      { evaluateShadowModel: async () => makeEvaluation([makePrediction()]) },
    );
    expect(() => serializePdfShadowVsRuleComparisonGateReportAsJson(report)).not.toThrow();
    const json = serializePdfShadowVsRuleComparisonGateReportAsJson(report);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("validatePdfShadowVsRuleComparisonGateReport", () => {
  it("accepts a valid report", async () => {
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 1 },
      { evaluateShadowModel: async () => makeEvaluation([makePrediction()]) },
    );
    const { valid, issues } = validatePdfShadowVsRuleComparisonGateReport(report);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it("catches probability out of range in items", () => {
    const badReport: PdfShadowVsRuleComparisonGateReport = {
      version: "pdf-shadow-vs-rule-comparison-gate-v1",
      generatedAt: new Date().toISOString(),
      input: { limit: 100, minRecordCount: 10, split: "all" },
      status: "PASS",
      checks: [],
      summary: {
        recordCount: 1,
        disagreementCount: 0,
        highSeverityDisagreementCount: 0,
        shadowMoreConservativeCount: 0,
        shadowLessConservativeCount: 0,
        publishSafetyConcernCount: 0,
        manualReviewSafetyConcernCount: 0,
        unreadableSafetyConcernCount: 0,
      },
      metrics: {},
      items: [
        {
          filingId: "bad",
          shadowRoute: "PUBLISH",
          shadowManualReviewProbability: 1.5, // out of range
          shadowUnreadableProbability: 0.1,
          shadowPublishProbability: 0.8,
          disagreementType: "NONE",
          severity: "LOW",
          notes: [],
        },
      ],
    };
    const { valid, issues } = validatePdfShadowVsRuleComparisonGateReport(badReport);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("shadowManualReviewProbability"))).toBe(true);
  });

  it("catches NaN in report metrics", async () => {
    const report = await buildPdfShadowVsRuleComparisonGateReport(
      { minRecordCount: 1 },
      { evaluateShadowModel: async () => makeEvaluation([makePrediction()]) },
    );
    (report.metrics as Record<string, unknown>).shadowRouteAccuracy = NaN;
    const { valid, issues } = validatePdfShadowVsRuleComparisonGateReport(report);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("NaN"))).toBe(true);
  });
});
