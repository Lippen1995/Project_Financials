import { describe, expect, it } from "vitest";

import {
  buildPdfDecisionModelRegistryManifestFromModelCard,
  validatePdfDecisionModelRegistryManifest,
  assertPdfDecisionModelManifestSafeForShadowEvaluation,
  PDF_DECISION_MODEL_REGISTRY_CONTRACT_VERSION,
  type PdfDecisionModelRegistryManifest,
  type PdfDecisionModelLifecycleStage,
} from "./pdf-decision-model-registry-contract-service";
import { PDF_DECISION_ML_FEATURE_SCHEMA_VERSION } from "./pdf-decision-ml-feature-schema-service";
import type { PdfDecisionOfflineModelCard } from "./pdf-decision-offline-model-training-service";

function makeModelCard(overrides: Partial<PdfDecisionOfflineModelCard> = {}): PdfDecisionOfflineModelCard {
  return {
    version: "pdf-decision-offline-model-card-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    target: "manualReviewRequired",
    algorithm: "MAJORITY_BASELINE",
    trainingConfig: { seed: "test" },
    recordCounts: { train: 10, validation: 3, test: 3, total: 16 },
    metrics: {
      train: {
        eligibleCount: 10,
        positiveRate: 0.4,
        accuracy: 0.8,
        precision: 0.75,
        recall: 0.9,
        f1: 0.82,
        brierScore: 0.12,
        logLossApprox: 0.35,
      },
    },
    featureNames: ["feat1", "feat2"],
    warnings: [],
    ...overrides,
  };
}

function makeManifest(overrides: Partial<PdfDecisionModelRegistryManifest> = {}): PdfDecisionModelRegistryManifest {
  return {
    version: PDF_DECISION_MODEL_REGISTRY_CONTRACT_VERSION,
    modelId: "test-model-1",
    modelVersion: "v1.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    lifecycleStage: "EXPERIMENTAL",
    target: "manualReviewRequired",
    algorithm: "MAJORITY_BASELINE",
    featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    compatibleFeatureSchemaVersions: [PDF_DECISION_ML_FEATURE_SCHEMA_VERSION],
    metrics: {
      train: { accuracy: 0.8, f1: 0.82 },
    },
    safety: {
      productionUseAllowed: false,
      routingUseAllowed: false,
      publishUseAllowed: false,
      requiresShadowGate: true,
      notes: ["Offline experiment only."],
    },
    artifacts: [
      { kind: "MODEL_CARD", path: null, sha256: null, sizeBytes: null, required: true },
    ],
    provenance: { createdBy: null, sourceCommand: null, sourceCommitSha: null, trainingHarnessVersion: null },
    ...overrides,
  };
}

describe("buildPdfDecisionModelRegistryManifestFromModelCard", () => {
  it("builds a valid manifest from a model card", () => {
    const card = makeModelCard();
    const manifest = buildPdfDecisionModelRegistryManifestFromModelCard({
      modelCard: card,
      modelId: "my-model",
      modelVersion: "v1",
    });
    expect(manifest.version).toBe(PDF_DECISION_MODEL_REGISTRY_CONTRACT_VERSION);
    expect(manifest.modelId).toBe("my-model");
    expect(manifest.modelVersion).toBe("v1");
    expect(manifest.target).toBe("manualReviewRequired");
    expect(manifest.algorithm).toBe("MAJORITY_BASELINE");
    expect(manifest.featureSchemaVersion).toBe(PDF_DECISION_ML_FEATURE_SCHEMA_VERSION);
    expect(manifest.compatibleFeatureSchemaVersions).toContain(PDF_DECISION_ML_FEATURE_SCHEMA_VERSION);
    expect(manifest.lifecycleStage).toBe("EXPERIMENTAL");
  });

  it("safety block is always hard-coded safe", () => {
    const manifest = buildPdfDecisionModelRegistryManifestFromModelCard({
      modelCard: makeModelCard(),
      modelId: "m",
      modelVersion: "v1",
    });
    expect(manifest.safety.productionUseAllowed).toBe(false);
    expect(manifest.safety.routingUseAllowed).toBe(false);
    expect(manifest.safety.publishUseAllowed).toBe(false);
    expect(manifest.safety.requiresShadowGate).toBe(true);
  });

  it("includes MODEL_CARD as required artifact", () => {
    const manifest = buildPdfDecisionModelRegistryManifestFromModelCard({
      modelCard: makeModelCard(),
      modelId: "m",
      modelVersion: "v1",
    });
    expect(manifest.artifacts.some((a) => a.kind === "MODEL_CARD" && a.required)).toBe(true);
  });

  it("maps model card metrics to manifest metrics", () => {
    const manifest = buildPdfDecisionModelRegistryManifestFromModelCard({
      modelCard: makeModelCard(),
      modelId: "m",
      modelVersion: "v1",
    });
    expect(manifest.metrics.train?.f1).toBe(0.82);
    expect(manifest.metrics.train?.accuracy).toBe(0.8);
  });

  it("accepts custom lifecycleStage and provenance", () => {
    const manifest = buildPdfDecisionModelRegistryManifestFromModelCard({
      modelCard: makeModelCard(),
      modelId: "m",
      modelVersion: "v1",
      lifecycleStage: "SHADOW_CANDIDATE",
      createdBy: "ci-bot",
      sourceCommand: "npm run train",
      sourceCommitSha: "abc123",
    });
    expect(manifest.lifecycleStage).toBe("SHADOW_CANDIDATE");
    expect(manifest.provenance.createdBy).toBe("ci-bot");
    expect(manifest.provenance.sourceCommand).toBe("npm run train");
    expect(manifest.provenance.sourceCommitSha).toBe("abc123");
  });

  it("manifest is JSON-safe", () => {
    const manifest = buildPdfDecisionModelRegistryManifestFromModelCard({
      modelCard: makeModelCard(),
      modelId: "m",
      modelVersion: "v1",
    });
    expect(() => JSON.stringify(manifest)).not.toThrow();
  });
});

describe("validatePdfDecisionModelRegistryManifest", () => {
  it("validates a good manifest", () => {
    const { valid, issues } = validatePdfDecisionModelRegistryManifest(makeManifest());
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it("rejects productionUseAllowed=true", () => {
    const m = makeManifest();
    (m.safety as Record<string, unknown>).productionUseAllowed = true;
    const { valid, issues } = validatePdfDecisionModelRegistryManifest(m);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("productionUseAllowed"))).toBe(true);
  });

  it("rejects routingUseAllowed=true", () => {
    const m = makeManifest();
    (m.safety as Record<string, unknown>).routingUseAllowed = true;
    const { valid, issues } = validatePdfDecisionModelRegistryManifest(m);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("routingUseAllowed"))).toBe(true);
  });

  it("rejects publishUseAllowed=true", () => {
    const m = makeManifest();
    (m.safety as Record<string, unknown>).publishUseAllowed = true;
    const { valid, issues } = validatePdfDecisionModelRegistryManifest(m);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("publishUseAllowed"))).toBe(true);
  });

  it("rejects requiresShadowGate=false", () => {
    const m = makeManifest();
    (m.safety as Record<string, unknown>).requiresShadowGate = false;
    const { valid, issues } = validatePdfDecisionModelRegistryManifest(m);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("requiresShadowGate"))).toBe(true);
  });

  it("rejects incompatible feature schema", () => {
    const m = makeManifest({
      compatibleFeatureSchemaVersions: ["pdf-decision-ml-features-v0"],
    });
    const { valid, issues } = validatePdfDecisionModelRegistryManifest(m);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("compatibleFeatureSchemaVersions"))).toBe(true);
  });

  it("rejects NaN metrics", () => {
    const m = makeManifest({
      metrics: { train: { accuracy: NaN } },
    });
    const { valid, issues } = validatePdfDecisionModelRegistryManifest(m);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("NaN"))).toBe(true);
  });

  it("rejects unsafe modelId (empty)", () => {
    const { valid, issues } = validatePdfDecisionModelRegistryManifest(makeManifest({ modelId: "" }));
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("modelId"))).toBe(true);
  });

  it("rejects unsafe modelVersion (spaces)", () => {
    const { valid, issues } = validatePdfDecisionModelRegistryManifest(makeManifest({ modelVersion: "v 1 bad" }));
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("modelVersion"))).toBe(true);
  });

  it("rejects null/non-object input", () => {
    const { valid } = validatePdfDecisionModelRegistryManifest(null);
    expect(valid).toBe(false);
  });

  it("manifest validation is JSON-safe and has no raw text", () => {
    const m = makeManifest();
    const { valid } = validatePdfDecisionModelRegistryManifest(m);
    expect(valid).toBe(true);
    const json = JSON.stringify(m);
    expect(json).not.toContain("rawText");
    expect(json).not.toContain("modelBinary");
    expect(json).not.toContain("pdfBuffer");
  });
});

describe("assertPdfDecisionModelManifestSafeForShadowEvaluation", () => {
  it("accepts EXPERIMENTAL stage", () => {
    expect(() =>
      assertPdfDecisionModelManifestSafeForShadowEvaluation(makeManifest({ lifecycleStage: "EXPERIMENTAL" })),
    ).not.toThrow();
  });

  it("accepts SHADOW_CANDIDATE stage", () => {
    expect(() =>
      assertPdfDecisionModelManifestSafeForShadowEvaluation(makeManifest({ lifecycleStage: "SHADOW_CANDIDATE" })),
    ).not.toThrow();
  });

  it("rejects REJECTED stage", () => {
    expect(() =>
      assertPdfDecisionModelManifestSafeForShadowEvaluation(makeManifest({ lifecycleStage: "REJECTED" as PdfDecisionModelLifecycleStage })),
    ).toThrow(/REJECTED/);
  });

  it("rejects ARCHIVED stage", () => {
    expect(() =>
      assertPdfDecisionModelManifestSafeForShadowEvaluation(makeManifest({ lifecycleStage: "ARCHIVED" as PdfDecisionModelLifecycleStage })),
    ).toThrow(/ARCHIVED/);
  });

  it("rejects incompatible feature schema", () => {
    expect(() =>
      assertPdfDecisionModelManifestSafeForShadowEvaluation(
        makeManifest({ compatibleFeatureSchemaVersions: ["pdf-decision-ml-features-v0"] }),
      ),
    ).toThrow(/incompatible/);
  });
});
