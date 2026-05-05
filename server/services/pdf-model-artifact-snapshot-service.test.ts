import {
  PdfModelArtifactKind,
  PdfModelArtifactStatus,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import { PDF_DECISION_ML_FEATURE_SCHEMA_VERSION } from "./pdf-decision-ml-feature-schema-service";
import {
  buildPdfModelArtifactSummary,
  persistPdfModelArtifactSnapshot,
  PdfModelArtifactSnapshotValidationError,
} from "./pdf-model-artifact-snapshot-service";

function makeSnapshot(
  overrides: Partial<PdfModelArtifactSnapshot> = {},
): PdfModelArtifactSnapshot {
  return {
    id: "snapshot-1",
    kind: PdfModelArtifactKind.SHADOW_MODEL_EVALUATION,
    status: PdfModelArtifactStatus.CREATED,
    modelId: null,
    modelVersion: null,
    modelTarget: null,
    featureSchemaVersion: null,
    fiscalYear: null,
    orgNumber: null,
    split: null,
    summary: {},
    payload: {},
    sourceCommand: null,
    sourceCommitSha: null,
    createdByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeEvaluation() {
  return {
    version: "pdf-decision-shadow-model-evaluation-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    modelVersion: "pdf-decision-shadow-baseline-v1",
    featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    input: { limit: 10, split: "all" },
    recordCount: 2,
    metrics: {
      routeAccuracy: 0.8,
      manualReviewAccuracy: 0.75,
      correctionBrierApprox: 0.2,
      unreadableBrierApprox: 0.1,
      publishBrierApprox: 0.15,
    },
    routePredictionDistribution: { TEXT_LAYER: 1, MANUAL_REVIEW: 1 },
    predictions: [],
  };
}

function makeAnalysis() {
  return {
    version: "pdf-decision-shadow-model-analysis-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    input: { limit: 10, split: "all", threshold: 0.5 },
    recordCount: 2,
    eligibleRouteCount: 2,
    routeConfusionMatrix: { labels: [], matrix: {} },
    manualReviewMetrics: {
      threshold: 0.5,
      eligibleCount: 2,
      truePositive: 1,
      falsePositive: 0,
      trueNegative: 1,
      falseNegative: 0,
      accuracy: 1,
      precision: 1,
      recall: 1,
      specificity: 1,
      f1: 1,
    },
    correctionMetrics: {
      threshold: 0.5,
      eligibleCount: 0,
      truePositive: 0,
      falsePositive: 0,
      trueNegative: 0,
      falseNegative: 0,
      accuracy: null,
      precision: null,
      recall: null,
      specificity: null,
      f1: null,
    },
    unreadableMetrics: {
      threshold: 0.5,
      eligibleCount: 0,
      truePositive: 0,
      falsePositive: 0,
      trueNegative: 0,
      falseNegative: 0,
      accuracy: null,
      precision: null,
      recall: null,
      specificity: null,
      f1: null,
    },
    calibration: {
      manualReviewProbability: [],
      correctionProbability: [],
      unreadableProbability: [],
      publishProbability: [],
    },
    slices: [],
    topErrors: [{ filingId: "f1" }],
    topUncertain: [],
  };
}

function makeGate(status = "PASS") {
  return {
    version: "pdf-shadow-vs-rule-comparison-gate-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    input: { limit: 10, split: "all", minRecordCount: 10 },
    status,
    checks: [
      { code: "MIN_RECORD_COUNT", status, message: "ok", observedValue: 10, threshold: 10 },
    ],
    summary: {
      recordCount: 10,
      disagreementCount: 2,
      highSeverityDisagreementCount: 1,
      shadowMoreConservativeCount: 1,
      shadowLessConservativeCount: 0,
      publishSafetyConcernCount: 0,
      manualReviewSafetyConcernCount: 0,
      unreadableSafetyConcernCount: 0,
    },
    metrics: {},
    items: [],
  };
}

function makeManifest() {
  return {
    version: "pdf-decision-model-registry-v1",
    modelId: "candidate-model",
    modelVersion: "v1",
    createdAt: "2026-01-01T00:00:00.000Z",
    lifecycleStage: "EXPERIMENTAL",
    target: "manualReviewRequired",
    algorithm: "BASELINE",
    featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    compatibleFeatureSchemaVersions: [PDF_DECISION_ML_FEATURE_SCHEMA_VERSION],
    metrics: { validation: { accuracy: 0.8 } },
    safety: {
      productionUseAllowed: false,
      routingUseAllowed: false,
      publishUseAllowed: false,
      requiresShadowGate: true,
      notes: ["shadow only"],
    },
    artifacts: [
      { kind: "MODEL_CARD", path: null, sha256: null, sizeBytes: null, required: true },
    ],
    provenance: {
      createdBy: null,
      sourceCommand: null,
      sourceCommitSha: null,
      trainingHarnessVersion: null,
    },
  };
}

describe("pdf model artifact snapshot service", () => {
  it("builds summary for shadow model evaluation", () => {
    expect(buildPdfModelArtifactSummary("SHADOW_MODEL_EVALUATION", makeEvaluation())).toMatchObject({
      recordCount: 2,
      routeAccuracy: 0.8,
      manualReviewAccuracy: 0.75,
    });
  });

  it("builds summary for shadow analysis", () => {
    expect(buildPdfModelArtifactSummary("SHADOW_MODEL_ANALYSIS", makeAnalysis())).toMatchObject({
      recordCount: 2,
      eligibleRouteCount: 2,
      manualReviewF1: 1,
      topErrorCount: 1,
    });
  });

  it("builds summary for shadow-vs-rule gate", () => {
    expect(buildPdfModelArtifactSummary("SHADOW_VS_RULE_GATE", makeGate("WARN"))).toMatchObject({
      status: "WARN",
      recordCount: 10,
      disagreementCount: 2,
      highSeverityDisagreementCount: 1,
      warnCheckCount: 1,
    });
  });

  it("builds summary for model manifest", () => {
    expect(buildPdfModelArtifactSummary("MODEL_REGISTRY_MANIFEST", makeManifest())).toMatchObject({
      modelId: "candidate-model",
      modelVersion: "v1",
      target: "manualReviewRequired",
      algorithm: "BASELINE",
      lifecycleStage: "EXPERIMENTAL",
    });
  });

  it("rejects NaN payload", async () => {
    await expect(
      persistPdfModelArtifactSnapshot({
        kind: "SHADOW_MODEL_EVALUATION",
        payload: { ...makeEvaluation(), recordCount: Number.NaN },
      }),
    ).rejects.toBeInstanceOf(PdfModelArtifactSnapshotValidationError);
  });

  it("rejects raw text keys", async () => {
    await expect(
      persistPdfModelArtifactSnapshot({
        kind: "SHADOW_MODEL_EVALUATION",
        payload: { ...makeEvaluation(), rawText: "too much" },
      }),
    ).rejects.toBeInstanceOf(PdfModelArtifactSnapshotValidationError);
  });

  it("validates manifest payload", async () => {
    await expect(
      persistPdfModelArtifactSnapshot({
        kind: "MODEL_REGISTRY_MANIFEST",
        payload: { ...makeManifest(), safety: { productionUseAllowed: true } },
      }),
    ).rejects.toBeInstanceOf(PdfModelArtifactSnapshotValidationError);
  });

  it("validates gate payload", async () => {
    await expect(
      persistPdfModelArtifactSnapshot({
        kind: "SHADOW_VS_RULE_GATE",
        payload: { ...makeGate(), status: "NOT_REAL" },
      }),
    ).rejects.toBeInstanceOf(PdfModelArtifactSnapshotValidationError);
  });

  it("persists through repository dependency", async () => {
    const created = await persistPdfModelArtifactSnapshot(
      {
        kind: "SHADOW_MODEL_EVALUATION",
        payload: makeEvaluation(),
        modelId: "m",
        modelVersion: "v1",
      },
      {
        create: async (input) =>
          makeSnapshot({
            kind: input.kind,
            modelId: input.modelId ?? null,
            modelVersion: input.modelVersion ?? null,
            summary: input.summary,
            payload: input.payload,
          }),
      },
    );

    expect(created.modelId).toBe("m");
    expect(created.status).toBe(PdfModelArtifactStatus.CREATED);
    expect(JSON.stringify(created)).not.toContain("rawText");
  });
});
