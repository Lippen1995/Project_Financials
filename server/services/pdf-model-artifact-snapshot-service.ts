import {
  PdfModelArtifactKind,
  PdfModelArtifactStatus,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";

import {
  validatePdfDecisionModelRegistryManifest,
} from "@/server/services/pdf-decision-model-registry-contract-service";
import {
  validatePdfDecisionShadowModelAnalysisReport,
} from "@/server/services/pdf-decision-shadow-model-analysis-service";
import {
  validatePdfDecisionShadowModelEvaluation,
} from "@/server/services/pdf-decision-shadow-model-service";
import {
  validatePdfShadowVsRuleComparisonGateReport,
} from "@/server/services/pdf-shadow-vs-rule-comparison-gate-service";
import {
  buildPdfParserRouteRecommendationV2Report,
  validatePdfParserRouteRecommendationV2Report,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";
import type {
  PdfParserRouteRecommendationV2Input,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";
import {
  buildPdfParserRouteCanaryPreviewReport,
} from "@/server/services/pdf-parser-route-canary-config-service";
import type {
  PdfParserRouteCanaryPreviewInput,
} from "@/server/services/pdf-parser-route-canary-config-service";
import {
  archivePdfModelArtifactSnapshot,
  createPdfModelArtifactSnapshot,
  getPdfModelArtifactSnapshotById,
  listPdfModelArtifactSnapshots,
} from "@/server/persistence/pdf-model-artifact-snapshot-repository";

export type PersistPdfModelArtifactSnapshotInput = {
  kind:
    | "SHADOW_MODEL_EVALUATION"
    | "SHADOW_MODEL_ANALYSIS"
    | "SHADOW_VS_RULE_GATE"
    | "MODEL_REGISTRY_MANIFEST"
    | "PARSER_ROUTE_SHADOW_EXECUTION"
    | "PARSER_ROUTE_RECOMMENDATION_V2"
    | "PARSER_ROUTE_CANARY_PREVIEW";
  payload: unknown;
  modelId?: string | null;
  modelVersion?: string | null;
  modelTarget?: string | null;
  featureSchemaVersion?: string | null;
  fiscalYear?: number | null;
  orgNumber?: string | null;
  split?: string | null;
  sourceCommand?: string | null;
  sourceCommitSha?: string | null;
  createdByUserId?: string | null;
};

export class PdfModelArtifactSnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfModelArtifactSnapshotValidationError";
  }
}

const RAW_KEYS = new Set([
  "fullText",
  "normalizedText",
  "pdfText",
  "documentText",
  "rawPdf",
  "base64",
  "modelBinary",
  "modelWeights",
  "checkpoint",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasInvalidNumber);
  }
  return false;
}

function hasRawPayloadKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasRawPayloadKey);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => RAW_KEYS.has(key) || hasRawPayloadKey(nested),
    );
  }
  return false;
}

function validateParserRouteShadowExecutionPayload(payload: unknown): { issues: string[] } {
  const issues: string[] = [];
  const p = asRecord(payload);
  if (p.schemaVersion !== 1) issues.push("PARSER_ROUTE_SHADOW_EXECUTION payload must have schemaVersion: 1.");
  if (p.kind !== "PARSER_ROUTE_SHADOW_EXECUTION") issues.push("PARSER_ROUTE_SHADOW_EXECUTION payload must have kind field.");
  const safety = asRecord(p.safety);
  if (safety.productionRoutingChanged !== false) issues.push("safety.productionRoutingChanged must be false.");
  if (safety.productionFactsMutated !== false) issues.push("safety.productionFactsMutated must be false.");
  if (safety.publishAffected !== false) issues.push("safety.publishAffected must be false.");
  if (safety.shadowOnly !== true) issues.push("safety.shadowOnly must be true.");
  if (!Array.isArray(p.routes)) issues.push("PARSER_ROUTE_SHADOW_EXECUTION payload must have a routes array.");
  return { issues };
}

function validateParserRouteRecommendationV2Payload(payload: unknown): { issues: string[] } {
  const issues: string[] = [];
  const p = asRecord(payload);
  if (p.schemaVersion !== 1) issues.push("PARSER_ROUTE_RECOMMENDATION_V2 payload must have schemaVersion: 1.");
  const safety = asRecord(p.safety);
  if (safety.productionRoutingChanged !== false) issues.push("safety.productionRoutingChanged must be false.");
  if (safety.productionFactsMutated !== false) issues.push("safety.productionFactsMutated must be false.");
  if (safety.publishAffected !== false) issues.push("safety.publishAffected must be false.");
  if (safety.shadowOnly !== true) issues.push("safety.shadowOnly must be true.");
  if (safety.canUseForProductionRouting !== false) issues.push("safety.canUseForProductionRouting must be false.");
  if (typeof p.generatedAt !== "string" || !p.generatedAt) issues.push("payload must have generatedAt string.");
  if (!Array.isArray(p.decisions)) issues.push("payload must have a decisions array.");
  // Reject any decision with canUseForProductionRouting=true
  if (Array.isArray(p.decisions)) {
    for (const d of p.decisions as unknown[]) {
      const guardrails = asRecord(asRecord(d).guardrails);
      if (guardrails.canUseForProductionRouting !== false) {
        issues.push("One or more decisions have canUseForProductionRouting !== false.");
        break;
      }
    }
  }
  return { issues };
}

function validateParserRouteCanaryPreviewPayload(payload: unknown): { issues: string[] } {
  const issues: string[] = [];
  const p = asRecord(payload);
  if (p.schemaVersion !== 1) issues.push("PARSER_ROUTE_CANARY_PREVIEW payload must have schemaVersion: 1.");
  const safety = asRecord(p.safety);
  if (safety.productionRoutingChanged !== false) issues.push("safety.productionRoutingChanged must be false.");
  if (safety.productionFactsMutated !== false) issues.push("safety.productionFactsMutated must be false.");
  if (safety.publishAffected !== false) issues.push("safety.publishAffected must be false.");
  if (safety.shadowOnly !== true) issues.push("safety.shadowOnly must be true.");
  if (safety.canUseForProductionRouting !== false) issues.push("safety.canUseForProductionRouting must be false.");
  if (typeof p.generatedAt !== "string" || !p.generatedAt) issues.push("payload must have generatedAt string.");
  if (!Array.isArray(p.filings)) issues.push("payload must have a filings array.");
  // Reject any filing with canUseForProductionRouting=true
  if (Array.isArray(p.filings)) {
    for (const f of p.filings as unknown[]) {
      if (asRecord(f).canUseForProductionRouting !== false) {
        issues.push("One or more filings have canUseForProductionRouting !== false.");
        break;
      }
    }
  }
  return { issues };
}

function assertJsonSafePayload(kind: PdfModelArtifactKind, payload: unknown) {
  const issues: string[] = [];
  if (hasInvalidNumber(payload)) issues.push("Payload contains NaN or Infinity.");
  if (hasRawPayloadKey(payload)) issues.push("Payload contains raw text/model/PDF-like fields.");
  try {
    JSON.stringify(payload);
  } catch {
    issues.push("Payload is not JSON-safe.");
  }

  if (kind === PdfModelArtifactKind.MODEL_REGISTRY_MANIFEST) {
    const validation = validatePdfDecisionModelRegistryManifest(payload);
    issues.push(...validation.issues);
  } else if (kind === PdfModelArtifactKind.SHADOW_VS_RULE_GATE) {
    const validation = validatePdfShadowVsRuleComparisonGateReport(payload as never);
    issues.push(...validation.issues);
  } else if (kind === PdfModelArtifactKind.SHADOW_MODEL_ANALYSIS) {
    const validation = validatePdfDecisionShadowModelAnalysisReport(payload as never);
    issues.push(...validation.issues);
  } else if (kind === PdfModelArtifactKind.SHADOW_MODEL_EVALUATION) {
    const validation = validatePdfDecisionShadowModelEvaluation(payload as never);
    issues.push(...validation.issues);
  } else if (kind === PdfModelArtifactKind.PARSER_ROUTE_SHADOW_EXECUTION) {
    const validation = validateParserRouteShadowExecutionPayload(payload);
    issues.push(...validation.issues);
  } else if (kind === PdfModelArtifactKind.PARSER_ROUTE_RECOMMENDATION_V2) {
    const validation = validateParserRouteRecommendationV2Payload(payload);
    issues.push(...validation.issues);
  } else if (kind === PdfModelArtifactKind.PARSER_ROUTE_CANARY_PREVIEW) {
    const validation = validateParserRouteCanaryPreviewPayload(payload);
    issues.push(...validation.issues);
  }

  if (issues.length > 0) {
    throw new PdfModelArtifactSnapshotValidationError(issues.join(" "));
  }
}

function n(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildPdfModelArtifactSummary(
  kind: PdfModelArtifactKind | PersistPdfModelArtifactSnapshotInput["kind"],
  payload: unknown,
): Record<string, unknown> {
  const k = kind as PdfModelArtifactKind;
  const p = asRecord(payload);
  if (k === PdfModelArtifactKind.SHADOW_MODEL_EVALUATION) {
    const metrics = asRecord(p.metrics);
    return {
      recordCount: n(p.recordCount),
      routeAccuracy: n(metrics.routeAccuracy),
      manualReviewAccuracy: n(metrics.manualReviewAccuracy),
      routePredictionDistribution: asRecord(p.routePredictionDistribution),
    };
  }
  if (k === PdfModelArtifactKind.SHADOW_MODEL_ANALYSIS) {
    const manual = asRecord(p.manualReviewMetrics);
    return {
      recordCount: n(p.recordCount),
      eligibleRouteCount: n(p.eligibleRouteCount),
      manualReviewF1: n(manual.f1),
      manualReviewPrecision: n(manual.precision),
      manualReviewRecall: n(manual.recall),
      topErrorCount: Array.isArray(p.topErrors) ? p.topErrors.length : 0,
    };
  }
  if (k === PdfModelArtifactKind.SHADOW_VS_RULE_GATE) {
    const summary = asRecord(p.summary);
    const checks = Array.isArray(p.checks) ? p.checks : [];
    return {
      status: typeof p.status === "string" ? p.status : null,
      recordCount: n(summary.recordCount),
      disagreementCount: n(summary.disagreementCount),
      highSeverityDisagreementCount: n(summary.highSeverityDisagreementCount),
      failedCheckCount: checks.filter((c) => asRecord(c).status === "FAIL").length,
      warnCheckCount: checks.filter((c) => asRecord(c).status === "WARN").length,
    };
  }
  if (k === PdfModelArtifactKind.PARSER_ROUTE_SHADOW_EXECUTION) {
    const inputSection = asRecord(p.input);
    const routes = Array.isArray(p.routes) ? p.routes : [];
    return {
      annualReportId: typeof inputSection.annualReportId === "string" ? inputSection.annualReportId : null,
      orgNumber: typeof inputSection.organizationNumber === "string" ? inputSection.organizationNumber : null,
      fiscalYear: typeof inputSection.fiscalYear === "number" ? inputSection.fiscalYear : null,
      requestedRouteCount: Array.isArray(inputSection.requestedRoutes) ? inputSection.requestedRoutes.length : 0,
      successCount: routes.filter((r) => asRecord(r).status === "SUCCESS").length,
      unavailableCount: routes.filter((r) => asRecord(r).status === "RUNTIME_UNAVAILABLE").length,
      failedCount: routes.filter((r) => asRecord(r).status === "FAILED").length,
      skippedCount: routes.filter((r) => asRecord(r).status === "SKIPPED").length,
      shadowOnly: true,
    };
  }
  if (k === PdfModelArtifactKind.PARSER_ROUTE_RECOMMENDATION_V2) {
    const summary = asRecord(p.summary);
    return {
      totalDocuments: n(summary.totalDocuments),
      textLayerRecommended: n(summary.textLayerRecommended),
      ocrRecommended: n(summary.ocrRecommended),
      odlRecommended: n(summary.odlRecommended),
      hybridRecommended: n(summary.hybridRecommended),
      manualReviewRequired: n(summary.manualReviewRequired),
      highConfidence: n(summary.highConfidence),
      highRisk: n(summary.highRisk),
      insufficientData:
        typeof asRecord(p.corpus).insufficientData === "boolean"
          ? asRecord(p.corpus).insufficientData
          : null,
      canUseForProductionRouting: false,
      shadowOnly: true,
    };
  }
  if (k === PdfModelArtifactKind.PARSER_ROUTE_CANARY_PREVIEW) {
    const summary = asRecord(p.summary);
    const config = asRecord(p.config);
    return {
      configMode: typeof config.mode === "string" ? config.mode : null,
      maxCanaryPercent:
        typeof config.maxCanaryPercent === "number" ? config.maxCanaryPercent : null,
      totalDocuments: n(summary.totalDocuments),
      eligible: n(summary.eligible),
      blocked: n(summary.blocked),
      disabled: n(summary.disabled),
      canUseForProductionRouting: false,
      shadowOnly: true,
    };
  }
  const safety = asRecord(p.safety);
  return {
    modelId: typeof p.modelId === "string" ? p.modelId : null,
    modelVersion: typeof p.modelVersion === "string" ? p.modelVersion : null,
    target: typeof p.target === "string" ? p.target : null,
    algorithm: typeof p.algorithm === "string" ? p.algorithm : null,
    lifecycleStage: typeof p.lifecycleStage === "string" ? p.lifecycleStage : null,
    featureSchemaVersion:
      typeof p.featureSchemaVersion === "string" ? p.featureSchemaVersion : null,
    productionUseAllowed: safety.productionUseAllowed === true,
    routingUseAllowed: safety.routingUseAllowed === true,
    publishUseAllowed: safety.publishUseAllowed === true,
  };
}

function kind(value: PersistPdfModelArtifactSnapshotInput["kind"]): PdfModelArtifactKind {
  return PdfModelArtifactKind[value];
}

export async function persistPdfModelArtifactSnapshot(
  input: PersistPdfModelArtifactSnapshotInput,
  deps?: {
    create?: typeof createPdfModelArtifactSnapshot;
  },
): Promise<PdfModelArtifactSnapshot> {
  const artifactKind = kind(input.kind);
  assertJsonSafePayload(artifactKind, input.payload);
  const summary = buildPdfModelArtifactSummary(artifactKind, input.payload);
  const create = deps?.create ?? createPdfModelArtifactSnapshot;
  return create({
    kind: artifactKind,
    modelId: input.modelId ?? (summary.modelId as string | null | undefined) ?? null,
    modelVersion: input.modelVersion ?? (summary.modelVersion as string | null | undefined) ?? null,
    modelTarget: input.modelTarget ?? (summary.target as string | null | undefined) ?? null,
    featureSchemaVersion:
      input.featureSchemaVersion ??
      (summary.featureSchemaVersion as string | null | undefined) ??
      null,
    fiscalYear: input.fiscalYear ?? null,
    orgNumber: input.orgNumber ?? null,
    split: input.split ?? null,
    summary,
    payload: input.payload,
    sourceCommand: input.sourceCommand ?? null,
    sourceCommitSha: input.sourceCommitSha ?? null,
    createdByUserId: input.createdByUserId ?? null,
  });
}

export async function listPersistedPdfModelArtifactSnapshots(input?: {
  kind?: PdfModelArtifactKind;
  modelId?: string;
  modelVersion?: string;
  fiscalYear?: number;
  orgNumber?: string;
  status?: PdfModelArtifactStatus;
  limit?: number;
}): Promise<PdfModelArtifactSnapshot[]> {
  return listPdfModelArtifactSnapshots(input);
}

export async function getPersistedPdfModelArtifactSnapshot(
  id: string,
): Promise<PdfModelArtifactSnapshot | null> {
  return getPdfModelArtifactSnapshotById(id);
}

export async function archivePersistedPdfModelArtifactSnapshot(
  id: string,
): Promise<PdfModelArtifactSnapshot> {
  return archivePdfModelArtifactSnapshot(id);
}

// ---- Build-and-persist helpers for new report kinds -------------------------

export type PdfParserRouteRecommendationV2SnapshotResult = {
  artifactId: string;
  kind: "PARSER_ROUTE_RECOMMENDATION_V2";
  createdAt: Date;
  summary: Record<string, unknown>;
};

export type PdfParserRouteCanaryPreviewSnapshotResult = {
  artifactId: string;
  kind: "PARSER_ROUTE_CANARY_PREVIEW";
  createdAt: Date;
  summary: Record<string, unknown>;
};

/**
 * Builds a recommendation v2 report, validates it, and persists it as a
 * PARSER_ROUTE_RECOMMENDATION_V2 artifact snapshot. Read-only — no production
 * routing, fact, or publish changes.
 */
export async function buildAndPersistPdfParserRouteRecommendationV2Snapshot(
  input?: PdfParserRouteRecommendationV2Input & {
    sourceCommand?: string | null;
    createdByUserId?: string | null;
  },
  deps?: {
    buildReport?: typeof buildPdfParserRouteRecommendationV2Report;
    create?: typeof createPdfModelArtifactSnapshot;
  },
): Promise<PdfParserRouteRecommendationV2SnapshotResult> {
  const buildReport = deps?.buildReport ?? buildPdfParserRouteRecommendationV2Report;

  const report = await buildReport({
    from: input?.from,
    to: input?.to,
    fiscalYear: input?.fiscalYear,
    organizationNumber: input?.organizationNumber,
    routes: input?.routes,
    limit: input?.limit,
  });

  const { valid, issues } = validatePdfParserRouteRecommendationV2Report(report);
  if (!valid) {
    throw new PdfModelArtifactSnapshotValidationError(
      `PARSER_ROUTE_RECOMMENDATION_V2 report validation failed: ${issues.join("; ")}`,
    );
  }

  const artifact = await persistPdfModelArtifactSnapshot(
    {
      kind: "PARSER_ROUTE_RECOMMENDATION_V2",
      payload: report,
      fiscalYear: input?.fiscalYear ?? null,
      orgNumber: input?.organizationNumber ?? null,
      sourceCommand: input?.sourceCommand ?? null,
      createdByUserId: input?.createdByUserId ?? null,
    },
    { create: deps?.create },
  );

  return {
    artifactId: artifact.id,
    kind: "PARSER_ROUTE_RECOMMENDATION_V2",
    createdAt: artifact.createdAt,
    summary: artifact.summary as Record<string, unknown>,
  };
}

/**
 * Builds a canary preview report, validates it, and persists it as a
 * PARSER_ROUTE_CANARY_PREVIEW artifact snapshot. Read-only — no production
 * routing, fact, or publish changes.
 */
export async function buildAndPersistPdfParserRouteCanaryPreviewSnapshot(
  input?: PdfParserRouteCanaryPreviewInput & {
    sourceCommand?: string | null;
    createdByUserId?: string | null;
  },
  deps?: {
    buildReport?: typeof buildPdfParserRouteCanaryPreviewReport;
    create?: typeof createPdfModelArtifactSnapshot;
  },
): Promise<PdfParserRouteCanaryPreviewSnapshotResult> {
  const buildReport = deps?.buildReport ?? buildPdfParserRouteCanaryPreviewReport;

  const report = await buildReport({
    from: input?.from,
    to: input?.to,
    fiscalYear: input?.fiscalYear,
    organizationNumber: input?.organizationNumber,
    limit: input?.limit,
    config: input?.config,
  });

  // Validate safety flags
  const safety = report.safety;
  const safetyIssues: string[] = [];
  if (safety.canUseForProductionRouting !== false)
    safetyIssues.push("safety.canUseForProductionRouting must be false.");
  if (safety.productionRoutingChanged !== false)
    safetyIssues.push("safety.productionRoutingChanged must be false.");
  if (safety.shadowOnly !== true) safetyIssues.push("safety.shadowOnly must be true.");
  if (safetyIssues.length > 0) {
    throw new PdfModelArtifactSnapshotValidationError(
      `PARSER_ROUTE_CANARY_PREVIEW safety validation failed: ${safetyIssues.join("; ")}`,
    );
  }

  const artifact = await persistPdfModelArtifactSnapshot(
    {
      kind: "PARSER_ROUTE_CANARY_PREVIEW",
      payload: report,
      fiscalYear: input?.fiscalYear ?? null,
      orgNumber: input?.organizationNumber ?? null,
      sourceCommand: input?.sourceCommand ?? null,
      createdByUserId: input?.createdByUserId ?? null,
    },
    { create: deps?.create },
  );

  return {
    artifactId: artifact.id,
    kind: "PARSER_ROUTE_CANARY_PREVIEW",
    createdAt: artifact.createdAt,
    summary: artifact.summary as Record<string, unknown>,
  };
}
