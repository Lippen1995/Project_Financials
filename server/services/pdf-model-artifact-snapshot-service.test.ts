import {
  PdfModelArtifactKind,
  PdfModelArtifactStatus,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { PDF_DECISION_ML_FEATURE_SCHEMA_VERSION } from "./pdf-decision-ml-feature-schema-service";
import {
  buildAndPersistPdfParserRouteCanaryPreviewSnapshot,
  buildAndPersistPdfParserRouteRecommendationV2Snapshot,
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

// ---- PARSER_ROUTE_RECOMMENDATION_V2 payload validation ----------------------

function makeRecommendationV2Payload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    filters: { limit: 100 },
    corpus: { artifactCount: 0, documentCount: 0, malformedArtifactCount: 0, successfulRouteRuns: 0, failedRouteRuns: 0, unavailableRouteRuns: 0, skippedRouteRuns: 0, insufficientData: true, insufficientDataReasons: [] },
    decisions: [],
    summary: { totalDocuments: 0, textLayerRecommended: 0, ocrRecommended: 0, odlRecommended: 0, hybridRecommended: 0, manualReviewRequired: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0, insufficientData: 0, highRisk: 0 },
    safety: {
      readOnly: true,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
    ...overrides,
  };
}

function makeCanaryPreviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    config: { version: "pdf-parser-route-canary-config-v1", mode: "DISABLED", maxCanaryPercent: 0, allowedRoutes: ["OCR"], orgNumberAllowlist: [], orgNumberBlocklist: [], fiscalYearAllowlist: [], requiredRecommendationConfidence: "HIGH", allowedRecommendationRisks: ["LOW"], requireShadowGatePass: true, requireModelCandidateApprovedForShadow: true, requireManualReviewFallback: true, hardBlocks: { blockIfInsufficientData: true, blockIfManualReviewRequired: true, blockIfParserWarningsAbove: 0, blockIfParserErrorsAbove: 0, blockIfMissingFinancialCoverage: true, blockIfMissingAuditorReport: false }, audit: { createdAt: "2026-01-01T00:00:00.000Z" } },
    configValid: true,
    configIssues: [],
    filings: [],
    summary: { totalDocuments: 0, eligible: 0, blocked: 0, disabled: 0, eligibleByRoute: {} },
    safety: {
      readOnly: true,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<PdfModelArtifactSnapshot> = {}): PdfModelArtifactSnapshot {
  return {
    id: "art-1",
    kind: PdfModelArtifactKind.PARSER_ROUTE_RECOMMENDATION_V2,
    status: PdfModelArtifactStatus.CREATED,
    modelId: null, modelVersion: null, modelTarget: null, featureSchemaVersion: null,
    fiscalYear: null, orgNumber: null, split: null,
    summary: {}, payload: {},
    sourceCommand: null, sourceCommitSha: null, createdByUserId: null,
    createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("PARSER_ROUTE_RECOMMENDATION_V2 payload validation", () => {
  it("accepts a valid payload", () => {
    expect(() =>
      persistPdfModelArtifactSnapshot(
        { kind: "PARSER_ROUTE_RECOMMENDATION_V2", payload: makeRecommendationV2Payload() },
        { create: async (input) => makeArtifact({ summary: input.summary as object }) },
      ),
    ).not.toThrow();
  });

  it("rejects payload with safety.canUseForProductionRouting=true", async () => {
    const payload = makeRecommendationV2Payload({
      safety: { readOnly: true, productionRoutingChanged: false, productionFactsMutated: false, publishAffected: false, shadowOnly: true, canUseForProductionRouting: true },
    });
    await expect(
      persistPdfModelArtifactSnapshot(
        { kind: "PARSER_ROUTE_RECOMMENDATION_V2", payload },
        { create: async () => makeArtifact() },
      ),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });

  it("rejects payload with safety.productionRoutingChanged=true", async () => {
    const payload = makeRecommendationV2Payload({
      safety: { readOnly: true, productionRoutingChanged: true, productionFactsMutated: false, publishAffected: false, shadowOnly: true, canUseForProductionRouting: false },
    });
    await expect(
      persistPdfModelArtifactSnapshot(
        { kind: "PARSER_ROUTE_RECOMMENDATION_V2", payload },
        { create: async () => makeArtifact() },
      ),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });

  it("rejects payload where a decision has canUseForProductionRouting=true", async () => {
    const payload = makeRecommendationV2Payload({
      decisions: [{ guardrails: { canUseForProductionRouting: true } }],
    });
    await expect(
      persistPdfModelArtifactSnapshot(
        { kind: "PARSER_ROUTE_RECOMMENDATION_V2", payload },
        { create: async () => makeArtifact() },
      ),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });

  it("rejects payload with NaN in numeric fields", async () => {
    const payload = makeRecommendationV2Payload();
    (payload.summary as Record<string, unknown>).totalDocuments = NaN;
    await expect(
      persistPdfModelArtifactSnapshot(
        { kind: "PARSER_ROUTE_RECOMMENDATION_V2", payload },
        { create: async () => makeArtifact() },
      ),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });

  it("accepts empty decisions array (empty-but-valid snapshot)", async () => {
    const payload = makeRecommendationV2Payload();
    const created = await persistPdfModelArtifactSnapshot(
      { kind: "PARSER_ROUTE_RECOMMENDATION_V2", payload },
      { create: async (input) => makeArtifact({ kind: PdfModelArtifactKind.PARSER_ROUTE_RECOMMENDATION_V2, summary: input.summary as object }) },
    );
    expect(created.kind).toBe(PdfModelArtifactKind.PARSER_ROUTE_RECOMMENDATION_V2);
  });
});

describe("PARSER_ROUTE_CANARY_PREVIEW payload validation", () => {
  it("accepts a valid payload", async () => {
    const payload = makeCanaryPreviewPayload();
    const created = await persistPdfModelArtifactSnapshot(
      { kind: "PARSER_ROUTE_CANARY_PREVIEW", payload },
      { create: async (input) => makeArtifact({ kind: PdfModelArtifactKind.PARSER_ROUTE_CANARY_PREVIEW, summary: input.summary as object }) },
    );
    expect(created.kind).toBe(PdfModelArtifactKind.PARSER_ROUTE_CANARY_PREVIEW);
  });

  it("rejects payload with safety.canUseForProductionRouting=true", async () => {
    const payload = makeCanaryPreviewPayload({
      safety: { readOnly: true, productionRoutingChanged: false, productionFactsMutated: false, publishAffected: false, shadowOnly: true, canUseForProductionRouting: true },
    });
    await expect(
      persistPdfModelArtifactSnapshot(
        { kind: "PARSER_ROUTE_CANARY_PREVIEW", payload },
        { create: async () => makeArtifact() },
      ),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });

  it("rejects payload where a filing has canUseForProductionRouting=true", async () => {
    const payload = makeCanaryPreviewPayload({
      filings: [{ filingId: "f1", canUseForProductionRouting: true }],
    });
    await expect(
      persistPdfModelArtifactSnapshot(
        { kind: "PARSER_ROUTE_CANARY_PREVIEW", payload },
        { create: async () => makeArtifact() },
      ),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });

  it("rejects malformed payload (missing generatedAt)", async () => {
    const payload = { ...makeCanaryPreviewPayload(), generatedAt: undefined };
    await expect(
      persistPdfModelArtifactSnapshot(
        { kind: "PARSER_ROUTE_CANARY_PREVIEW", payload },
        { create: async () => makeArtifact() },
      ),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });
});

describe("buildPdfModelArtifactSummary for new kinds", () => {
  it("extracts compact summary for PARSER_ROUTE_RECOMMENDATION_V2", () => {
    const payload = makeRecommendationV2Payload({
      summary: { totalDocuments: 5, textLayerRecommended: 3, ocrRecommended: 1, odlRecommended: 0, hybridRecommended: 1, manualReviewRequired: 0, highConfidence: 2, mediumConfidence: 2, lowConfidence: 1, insufficientData: 0, highRisk: 0 },
      corpus: { insufficientData: false },
    });
    const summary = buildPdfModelArtifactSummary("PARSER_ROUTE_RECOMMENDATION_V2", payload);
    expect(summary.totalDocuments).toBe(5);
    expect(summary.ocrRecommended).toBe(1);
    expect(summary.canUseForProductionRouting).toBe(false);
    expect(summary.shadowOnly).toBe(true);
  });

  it("extracts compact summary for PARSER_ROUTE_CANARY_PREVIEW", () => {
    const payload = makeCanaryPreviewPayload({
      summary: { totalDocuments: 10, eligible: 0, blocked: 2, disabled: 8, eligibleByRoute: {} },
      config: { mode: "DISABLED", maxCanaryPercent: 0 },
    });
    const summary = buildPdfModelArtifactSummary("PARSER_ROUTE_CANARY_PREVIEW", payload);
    expect(summary.configMode).toBe("DISABLED");
    expect(summary.maxCanaryPercent).toBe(0);
    expect(summary.eligible).toBe(0);
    expect(summary.canUseForProductionRouting).toBe(false);
  });
});

describe("buildAndPersistPdfParserRouteRecommendationV2Snapshot", () => {
  it("calls buildReport once and persists artifact with correct kind", async () => {
    const buildReport = vi.fn().mockResolvedValue(makeRecommendationV2Payload());
    const createArtifact = vi.fn().mockResolvedValue(
      makeArtifact({ kind: PdfModelArtifactKind.PARSER_ROUTE_RECOMMENDATION_V2 }),
    );

    const result = await buildAndPersistPdfParserRouteRecommendationV2Snapshot(
      {},
      { buildReport, create: createArtifact },
    );

    expect(buildReport).toHaveBeenCalledOnce();
    expect(createArtifact).toHaveBeenCalledOnce();
    expect(createArtifact.mock.calls[0]![0].kind).toBe(
      PdfModelArtifactKind.PARSER_ROUTE_RECOMMENDATION_V2,
    );
    expect(result.kind).toBe("PARSER_ROUTE_RECOMMENDATION_V2");
    expect(result.artifactId).toBe("art-1");
  });

  it("throws PdfModelArtifactSnapshotValidationError when report has invalid safety", async () => {
    const badReport = makeRecommendationV2Payload({
      safety: { readOnly: true, productionRoutingChanged: false, productionFactsMutated: false, publishAffected: false, shadowOnly: true, canUseForProductionRouting: true },
    });
    await expect(
      buildAndPersistPdfParserRouteRecommendationV2Snapshot(
        {},
        { buildReport: async () => badReport as never, create: async () => makeArtifact() },
      ),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });
});

describe("buildAndPersistPdfParserRouteCanaryPreviewSnapshot", () => {
  it("calls buildReport once and persists artifact with correct kind", async () => {
    const buildReport = vi.fn().mockResolvedValue(makeCanaryPreviewPayload());
    const createArtifact = vi.fn().mockResolvedValue(
      makeArtifact({ kind: PdfModelArtifactKind.PARSER_ROUTE_CANARY_PREVIEW }),
    );

    const result = await buildAndPersistPdfParserRouteCanaryPreviewSnapshot(
      {},
      { buildReport, create: createArtifact },
    );

    expect(buildReport).toHaveBeenCalledOnce();
    expect(createArtifact).toHaveBeenCalledOnce();
    expect(createArtifact.mock.calls[0]![0].kind).toBe(
      PdfModelArtifactKind.PARSER_ROUTE_CANARY_PREVIEW,
    );
    expect(result.kind).toBe("PARSER_ROUTE_CANARY_PREVIEW");
  });

  it("throws when canary preview safety is violated", async () => {
    const badReport = makeCanaryPreviewPayload({
      safety: { readOnly: true, productionRoutingChanged: false, productionFactsMutated: false, publishAffected: false, shadowOnly: true, canUseForProductionRouting: true },
    });
    await expect(
      buildAndPersistPdfParserRouteCanaryPreviewSnapshot(
        {},
        { buildReport: async () => badReport as never, create: async () => makeArtifact() },
      ),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });
});
