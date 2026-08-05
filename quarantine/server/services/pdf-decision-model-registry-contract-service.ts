import {
  PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
} from "@/server/services/pdf-decision-ml-feature-schema-service";
import type { PdfDecisionOfflineModelCard } from "@/server/services/pdf-decision-offline-model-training-service";

export type PdfDecisionModelRegistryContractVersion =
  "pdf-decision-model-registry-v1";

export type PdfDecisionModelArtifactKind =
  | "MODEL_CARD"
  | "COEFFICIENTS_JSON"
  | "METRICS_JSON"
  | "MANIFEST_JSON";

export type PdfDecisionModelTarget =
  | "manualReviewRequired"
  | "corrected"
  | "unreadable"
  | "published"
  | "routeRecommendation";

export type PdfDecisionModelLifecycleStage =
  | "EXPERIMENTAL"
  | "SHADOW_CANDIDATE"
  | "REJECTED"
  | "ARCHIVED";

export type PdfDecisionModelRegistryManifest = {
  version: PdfDecisionModelRegistryContractVersion;
  modelId: string;
  modelVersion: string;
  createdAt: string;

  lifecycleStage: PdfDecisionModelLifecycleStage;

  target: PdfDecisionModelTarget;
  algorithm: string;

  featureSchemaVersion: string;
  compatibleFeatureSchemaVersions: string[];

  trainingDataset?: {
    datasetVersion?: string | null;
    recordCount?: number | null;
    splitSeed?: string | null;
    generatedAt?: string | null;
  };

  metrics: {
    train?: Record<string, number | null>;
    validation?: Record<string, number | null>;
    test?: Record<string, number | null>;
  };

  safety: {
    productionUseAllowed: false;
    routingUseAllowed: false;
    publishUseAllowed: false;
    requiresShadowGate: true;
    notes: string[];
  };

  artifacts: Array<{
    kind: PdfDecisionModelArtifactKind;
    path?: string | null;
    sha256?: string | null;
    sizeBytes?: number | null;
    required: boolean;
  }>;

  provenance: {
    createdBy?: string | null;
    sourceCommand?: string | null;
    sourceCommitSha?: string | null;
    trainingHarnessVersion?: string | null;
  };
};

// ---- Constants ----

export const PDF_DECISION_MODEL_REGISTRY_CONTRACT_VERSION =
  "pdf-decision-model-registry-v1" satisfies PdfDecisionModelRegistryContractVersion;

const KNOWN_TARGETS: PdfDecisionModelTarget[] = [
  "manualReviewRequired",
  "corrected",
  "unreadable",
  "published",
  "routeRecommendation",
];

const KNOWN_LIFECYCLE_STAGES: PdfDecisionModelLifecycleStage[] = [
  "EXPERIMENTAL",
  "SHADOW_CANDIDATE",
  "REJECTED",
  "ARCHIVED",
];

const SHADOW_EVALUABLE_STAGES: PdfDecisionModelLifecycleStage[] = [
  "EXPERIMENTAL",
  "SHADOW_CANDIDATE",
];

const KNOWN_ARTIFACT_KINDS: PdfDecisionModelArtifactKind[] = [
  "MODEL_CARD",
  "COEFFICIENTS_JSON",
  "METRICS_JSON",
  "MANIFEST_JSON",
];

// Safe model ID: alphanumeric, hyphens, underscores, dots. 1-128 chars.
const SAFE_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

// ---- Helpers ----

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasInvalidNumber);
  }
  return false;
}

function hasRawPayloadKey(value: unknown): boolean {
  const rawKeys = new Set([
    "rawPdf", "pdfBuffer", "rawText", "fullText", "structuredDocument", "pagesText",
    "modelBinary", "modelWeights", "checkpoint",
  ]);
  if (Array.isArray(value)) return value.some(hasRawPayloadKey);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => rawKeys.has(key) || hasRawPayloadKey(nested),
    );
  }
  return false;
}

function isNullOrFinite(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "number") return false;
  return Number.isFinite(value);
}

// ---- Validation ----

export function validatePdfDecisionModelRegistryManifest(
  manifest: unknown,
): { valid: boolean; issues: string[]; manifest?: PdfDecisionModelRegistryManifest } {
  const issues: string[] = [];

  if (!manifest || typeof manifest !== "object") {
    return { valid: false, issues: ["Manifest must be a non-null object."] };
  }

  const m = manifest as Record<string, unknown>;

  if (m.version !== PDF_DECISION_MODEL_REGISTRY_CONTRACT_VERSION) {
    issues.push(`version must be "${PDF_DECISION_MODEL_REGISTRY_CONTRACT_VERSION}".`);
  }

  if (typeof m.modelId !== "string" || !SAFE_ID_RE.test(m.modelId)) {
    issues.push("modelId must be a non-empty slug-like string (alphanumeric, hyphens, underscores, dots; 1–128 chars).");
  }

  if (typeof m.modelVersion !== "string" || !SAFE_ID_RE.test(m.modelVersion)) {
    issues.push("modelVersion must be a non-empty slug-like string.");
  }

  if (typeof m.createdAt !== "string" || !m.createdAt) {
    issues.push("createdAt must be a non-empty string.");
  }

  if (!KNOWN_LIFECYCLE_STAGES.includes(m.lifecycleStage as PdfDecisionModelLifecycleStage)) {
    issues.push(`lifecycleStage must be one of: ${KNOWN_LIFECYCLE_STAGES.join(", ")}.`);
  }

  if (!KNOWN_TARGETS.includes(m.target as PdfDecisionModelTarget)) {
    issues.push(`target must be one of: ${KNOWN_TARGETS.join(", ")}.`);
  }

  if (typeof m.algorithm !== "string" || !m.algorithm) {
    issues.push("algorithm must be a non-empty string.");
  }

  if (typeof m.featureSchemaVersion !== "string" || !m.featureSchemaVersion) {
    issues.push("featureSchemaVersion must be a non-empty string.");
  }

  const compatible = m.compatibleFeatureSchemaVersions;
  if (!Array.isArray(compatible) || !compatible.includes(PDF_DECISION_ML_FEATURE_SCHEMA_VERSION)) {
    issues.push(
      `compatibleFeatureSchemaVersions must include current schema version "${PDF_DECISION_ML_FEATURE_SCHEMA_VERSION}".`,
    );
  }

  // Safety constraints — must be exactly these values
  const safety = m.safety as Record<string, unknown> | undefined;
  if (!safety || typeof safety !== "object") {
    issues.push("safety block is required.");
  } else {
    if (safety.productionUseAllowed !== false) issues.push("safety.productionUseAllowed must be false.");
    if (safety.routingUseAllowed !== false) issues.push("safety.routingUseAllowed must be false.");
    if (safety.publishUseAllowed !== false) issues.push("safety.publishUseAllowed must be false.");
    if (safety.requiresShadowGate !== true) issues.push("safety.requiresShadowGate must be true.");
    if (!Array.isArray(safety.notes)) issues.push("safety.notes must be an array.");
  }

  // Metrics: all values must be finite or null
  const metrics = m.metrics as Record<string, unknown> | undefined;
  if (metrics && typeof metrics === "object") {
    for (const [split, splitMetrics] of Object.entries(metrics)) {
      if (splitMetrics && typeof splitMetrics === "object") {
        for (const [key, value] of Object.entries(splitMetrics as Record<string, unknown>)) {
          if (!isNullOrFinite(value)) {
            issues.push(`metrics.${split}.${key} must be a finite number or null.`);
          }
        }
      }
    }
  }

  // Artifacts array
  const artifacts = m.artifacts;
  if (!Array.isArray(artifacts)) {
    issues.push("artifacts must be an array.");
  } else {
    for (let i = 0; i < artifacts.length; i++) {
      const a = artifacts[i] as Record<string, unknown>;
      if (!KNOWN_ARTIFACT_KINDS.includes(a.kind as PdfDecisionModelArtifactKind)) {
        issues.push(`artifacts[${i}].kind must be one of: ${KNOWN_ARTIFACT_KINDS.join(", ")}.`);
      }
      if (typeof a.required !== "boolean") {
        issues.push(`artifacts[${i}].required must be a boolean.`);
      }
      if (a.sizeBytes != null && (typeof a.sizeBytes !== "number" || !Number.isFinite(a.sizeBytes) || a.sizeBytes < 0)) {
        issues.push(`artifacts[${i}].sizeBytes must be a finite non-negative number or null.`);
      }
      if (a.sha256 != null && typeof a.sha256 !== "string") {
        issues.push(`artifacts[${i}].sha256 must be a string or null.`);
      }
      if (a.path != null && typeof a.path !== "string") {
        issues.push(`artifacts[${i}].path must be a string or null.`);
      }
    }

    const hasRequiredModelCard = artifacts.some(
      (a) => (a as Record<string, unknown>).kind === "MODEL_CARD" && (a as Record<string, unknown>).required === true,
    );
    if (!hasRequiredModelCard) {
      issues.push("artifacts must include a required MODEL_CARD artifact.");
    }
  }

  // No raw payload keys (model binary, PDF text, etc.)
  if (hasRawPayloadKey(manifest)) {
    issues.push("Manifest contains raw payload keys (model binary, PDF/document text, etc.).");
  }

  // No NaN/Infinity
  if (hasInvalidNumber(manifest)) {
    issues.push("Manifest contains NaN or Infinity.");
  }

  // JSON-safe
  try {
    JSON.stringify(manifest);
  } catch {
    issues.push("Manifest is not JSON-safe.");
  }

  const valid = issues.length === 0;
  return { valid, issues, ...(valid ? { manifest: manifest as PdfDecisionModelRegistryManifest } : {}) };
}

// ---- Safety assertion ----

export function assertPdfDecisionModelManifestSafeForShadowEvaluation(
  manifest: PdfDecisionModelRegistryManifest,
): void {
  const errors: string[] = [];

  if (manifest.safety.productionUseAllowed !== false) {
    errors.push("Manifest has productionUseAllowed=true; shadow evaluation is not permitted.");
  }
  if (manifest.safety.routingUseAllowed !== false) {
    errors.push("Manifest has routingUseAllowed=true; shadow evaluation is not permitted.");
  }
  if (manifest.safety.publishUseAllowed !== false) {
    errors.push("Manifest has publishUseAllowed=true; shadow evaluation is not permitted.");
  }
  if (manifest.safety.requiresShadowGate !== true) {
    errors.push("Manifest has requiresShadowGate=false; shadow evaluation is not permitted.");
  }
  if (!SHADOW_EVALUABLE_STAGES.includes(manifest.lifecycleStage)) {
    errors.push(
      `Manifest lifecycleStage "${manifest.lifecycleStage}" is not evaluable; must be EXPERIMENTAL or SHADOW_CANDIDATE.`,
    );
  }
  if (!manifest.compatibleFeatureSchemaVersions.includes(PDF_DECISION_ML_FEATURE_SCHEMA_VERSION)) {
    errors.push(
      `Manifest featureSchemaVersion "${manifest.featureSchemaVersion}" is incompatible with current schema "${PDF_DECISION_ML_FEATURE_SCHEMA_VERSION}".`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Manifest is not safe for shadow evaluation:\n${errors.join("\n")}`);
  }
}

// ---- Manifest builder from offline model card ----

export function buildPdfDecisionModelRegistryManifestFromModelCard(input: {
  modelCard: PdfDecisionOfflineModelCard;
  modelId: string;
  modelVersion: string;
  lifecycleStage?: PdfDecisionModelLifecycleStage;
  sourceCommand?: string;
  sourceCommitSha?: string;
  createdBy?: string;
}): PdfDecisionModelRegistryManifest {
  const {
    modelCard,
    modelId,
    modelVersion,
    lifecycleStage = "EXPERIMENTAL",
    sourceCommand,
    sourceCommitSha,
    createdBy,
  } = input;

  // Map model card metrics to plain Record<string, number | null>
  function flattenMetrics(m?: {
    eligibleCount: number;
    positiveRate: number | null;
    accuracy: number | null;
    precision: number | null;
    recall: number | null;
    f1: number | null;
    brierScore: number | null;
    logLossApprox: number | null;
  }): Record<string, number | null> | undefined {
    if (!m) return undefined;
    return {
      eligibleCount: m.eligibleCount,
      positiveRate: m.positiveRate,
      accuracy: m.accuracy,
      precision: m.precision,
      recall: m.recall,
      f1: m.f1,
      brierScore: m.brierScore,
      logLossApprox: m.logLossApprox,
    };
  }

  const trainMetrics = flattenMetrics(modelCard.metrics.train);
  const validationMetrics = flattenMetrics(modelCard.metrics.validation);
  const testMetrics = flattenMetrics(modelCard.metrics.test);

  return {
    version: PDF_DECISION_MODEL_REGISTRY_CONTRACT_VERSION,
    modelId,
    modelVersion,
    createdAt: modelCard.generatedAt,

    lifecycleStage,
    target: modelCard.target as PdfDecisionModelTarget,
    algorithm: modelCard.algorithm,

    featureSchemaVersion: modelCard.featureSchemaVersion,
    compatibleFeatureSchemaVersions: [PDF_DECISION_ML_FEATURE_SCHEMA_VERSION],

    trainingDataset: {
      recordCount: modelCard.recordCounts.total,
    },

    metrics: {
      ...(trainMetrics ? { train: trainMetrics } : {}),
      ...(validationMetrics ? { validation: validationMetrics } : {}),
      ...(testMetrics ? { test: testMetrics } : {}),
    },

    safety: {
      productionUseAllowed: false,
      routingUseAllowed: false,
      publishUseAllowed: false,
      requiresShadowGate: true,
      notes: [
        "This manifest was generated by an offline training harness.",
        "The model is NOT connected to production routing, extraction, or publishing.",
        "Shadow evaluation requires passing the shadow-vs-rule gate before any further use.",
      ],
    },

    artifacts: [
      {
        kind: "MODEL_CARD",
        path: null,
        sha256: null,
        sizeBytes: null,
        required: true,
      },
    ],

    provenance: {
      createdBy: createdBy ?? null,
      sourceCommand: sourceCommand ?? null,
      sourceCommitSha: sourceCommitSha ?? null,
      trainingHarnessVersion: "pdf-decision-offline-training-harness-v1",
    },
  };
}
