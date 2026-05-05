import {
  PdfModelArtifactKind,
  PdfModelCandidateDecisionType,
  PdfModelCandidateStatus,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";

import {
  validatePdfDecisionModelRegistryManifest,
  type PdfDecisionModelRegistryManifest,
} from "@/server/services/pdf-decision-model-registry-contract-service";
import {
  validatePdfDecisionShadowModelAnalysisReport,
} from "@/server/services/pdf-decision-shadow-model-analysis-service";
import {
  validatePdfShadowVsRuleComparisonGateReport,
  type PdfShadowVsRuleGateStatus,
} from "@/server/services/pdf-shadow-vs-rule-comparison-gate-service";
import {
  createPdfModelCandidate,
  createPdfModelCandidateDecision,
  getPdfModelCandidateById,
  listPdfModelCandidates as listPdfModelCandidatesFromRepository,
  PdfModelCandidateTransitionConflictError,
  PdfModelCandidateTransitionNotFoundError,
  transitionPdfModelCandidateStatus,
  type PdfModelCandidateRecord,
} from "@/server/persistence/pdf-model-candidate-repository";
import {
  getPersistedPdfModelArtifactSnapshot,
} from "@/server/services/pdf-model-artifact-snapshot-service";

export class PdfModelCandidateError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 409,
  ) {
    super(message);
    this.name = "PdfModelCandidateError";
  }
}

type CandidateDeps = {
  getArtifact?: typeof getPersistedPdfModelArtifactSnapshot;
  createCandidate?: typeof createPdfModelCandidate;
  listCandidates?: typeof listPdfModelCandidatesFromRepository;
  createDecision?: typeof createPdfModelCandidateDecision;
  transitionStatus?: typeof transitionPdfModelCandidateStatus;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertArtifact(
  artifact: PdfModelArtifactSnapshot | null,
  expectedKind: PdfModelArtifactKind,
  label: string,
): PdfModelArtifactSnapshot {
  if (!artifact) throw new PdfModelCandidateError(`${label} artifact was not found.`, 404);
  if (artifact.kind !== expectedKind) {
    throw new PdfModelCandidateError(
      `${label} artifact must be ${expectedKind}; received ${artifact.kind}.`,
      400,
    );
  }
  return artifact;
}

function validateManifestArtifact(
  artifact: PdfModelArtifactSnapshot,
): PdfDecisionModelRegistryManifest {
  const validation = validatePdfDecisionModelRegistryManifest(artifact.payload);
  if (!validation.valid || !validation.manifest) {
    throw new PdfModelCandidateError(
      `Manifest artifact is not valid for candidate creation: ${validation.issues.join(" ")}`,
      400,
    );
  }
  return validation.manifest;
}

function validateGateArtifact(artifact: PdfModelArtifactSnapshot): PdfShadowVsRuleGateStatus {
  const validation = validatePdfShadowVsRuleComparisonGateReport(artifact.payload as never);
  if (!validation.valid) {
    throw new PdfModelCandidateError(
      `Gate artifact is not valid: ${validation.issues.join(" ")}`,
      400,
    );
  }
  const status = asRecord(artifact.payload).status;
  if (status !== "PASS" && status !== "WARN" && status !== "FAIL" && status !== "INSUFFICIENT_DATA") {
    throw new PdfModelCandidateError("Gate artifact is missing a valid status.", 400);
  }
  return status;
}

function validateAnalysisArtifact(artifact: PdfModelArtifactSnapshot) {
  const validation = validatePdfDecisionShadowModelAnalysisReport(artifact.payload as never);
  if (!validation.valid) {
    throw new PdfModelCandidateError(
      `Analysis artifact is not valid: ${validation.issues.join(" ")}`,
      400,
    );
  }
}

async function recordDecision(
  input: {
    candidateId: string;
    decisionType: PdfModelCandidateDecisionType;
    userId?: string | null;
    note?: string | null;
    payload?: unknown;
  },
  deps?: CandidateDeps,
) {
  const createDecision = deps?.createDecision ?? createPdfModelCandidateDecision;
  await createDecision({
    candidateId: input.candidateId,
    decisionType: input.decisionType,
    note: input.note ?? null,
    payload: input.payload,
    decidedByUserId: input.userId ?? null,
  });
}

function mapTransitionError(err: unknown): never {
  if (err instanceof PdfModelCandidateError) throw err;
  if (err instanceof PdfModelCandidateTransitionNotFoundError) {
    throw new PdfModelCandidateError(err.message, 404);
  }
  if (err instanceof PdfModelCandidateTransitionConflictError) {
    throw new PdfModelCandidateError(err.message, 409);
  }
  throw err;
}

async function transitionCandidate(
  input: {
    candidateId: string;
    expectedStatuses: PdfModelCandidateStatus[];
    nextStatus: PdfModelCandidateStatus;
    decisionType: PdfModelCandidateDecisionType;
    userId?: string | null;
    note?: string | null;
    payload?: unknown;
    validateCandidate?: (candidate: PdfModelCandidateRecord) => void;
  },
  deps?: CandidateDeps,
): Promise<PdfModelCandidateRecord> {
  const transitionStatus = deps?.transitionStatus ?? transitionPdfModelCandidateStatus;
  try {
    return await transitionStatus({
      candidateId: input.candidateId,
      expectedStatuses: input.expectedStatuses,
      nextStatus: input.nextStatus,
      decisionType: input.decisionType,
      note: input.note ?? null,
      payload: input.payload ?? { toStatus: input.nextStatus },
      decidedByUserId: input.userId ?? null,
      validateCandidate: input.validateCandidate,
    });
  } catch (err) {
    mapTransitionError(err);
  }
}

export async function createPdfModelCandidateFromManifestArtifact(
  input: {
    manifestArtifactId: string;
    gateArtifactId?: string | null;
    analysisArtifactId?: string | null;
    createdByUserId?: string | null;
    note?: string | null;
  },
  deps?: CandidateDeps,
): Promise<PdfModelCandidateRecord> {
  const getArtifact = deps?.getArtifact ?? getPersistedPdfModelArtifactSnapshot;
  const createCandidate = deps?.createCandidate ?? createPdfModelCandidate;

  const manifestArtifact = assertArtifact(
    await getArtifact(input.manifestArtifactId),
    PdfModelArtifactKind.MODEL_REGISTRY_MANIFEST,
    "Manifest",
  );
  const manifest = validateManifestArtifact(manifestArtifact);

  if (input.gateArtifactId) {
    const gateArtifact = assertArtifact(
      await getArtifact(input.gateArtifactId),
      PdfModelArtifactKind.SHADOW_VS_RULE_GATE,
      "Gate",
    );
    validateGateArtifact(gateArtifact);
  }

  if (input.analysisArtifactId) {
    const analysisArtifact = assertArtifact(
      await getArtifact(input.analysisArtifactId),
      PdfModelArtifactKind.SHADOW_MODEL_ANALYSIS,
      "Analysis",
    );
    validateAnalysisArtifact(analysisArtifact);
  }

  const candidate = await createCandidate({
    modelId: manifest.modelId,
    modelVersion: manifest.modelVersion,
    modelTarget: manifest.target,
    algorithm: manifest.algorithm,
    featureSchemaVersion: manifest.featureSchemaVersion,
    manifestArtifactId: manifestArtifact.id,
    gateArtifactId: input.gateArtifactId ?? null,
    analysisArtifactId: input.analysisArtifactId ?? null,
    createdByUserId: input.createdByUserId ?? null,
  });

  if (input.note) {
    await recordDecision(
      {
        candidateId: candidate.id,
        decisionType: PdfModelCandidateDecisionType.COMMENTED,
        userId: input.createdByUserId,
        note: input.note,
        payload: { action: "CREATED" },
      },
      deps,
    );
  }

  return candidate;
}

export async function submitPdfModelCandidateForReview(
  candidateId: string,
  userId?: string | null,
  note?: string | null,
  deps?: CandidateDeps,
): Promise<PdfModelCandidateRecord> {
  return transitionCandidate(
    {
      candidateId,
      expectedStatuses: [PdfModelCandidateStatus.DRAFT],
      nextStatus: PdfModelCandidateStatus.READY_FOR_REVIEW,
      decisionType: PdfModelCandidateDecisionType.SUBMITTED_FOR_REVIEW,
      userId,
      note,
    },
    deps,
  );
}

export async function approvePdfModelCandidateForShadow(
  candidateId: string,
  userId?: string | null,
  note?: string | null,
  deps?: CandidateDeps,
): Promise<PdfModelCandidateRecord> {
  return transitionCandidate(
    {
      candidateId,
      expectedStatuses: [PdfModelCandidateStatus.READY_FOR_REVIEW],
      nextStatus: PdfModelCandidateStatus.APPROVED_FOR_SHADOW,
      decisionType: PdfModelCandidateDecisionType.APPROVED_FOR_SHADOW,
      userId,
      note,
      payload: {
        toStatus: PdfModelCandidateStatus.APPROVED_FOR_SHADOW,
        shadowOnly: true,
      },
      validateCandidate: (candidate) => {
        if (!candidate.gateArtifact) return;
        const gateStatus = validateGateArtifact(candidate.gateArtifact);
        if (gateStatus === "FAIL" || gateStatus === "INSUFFICIENT_DATA") {
          throw new PdfModelCandidateError(
            `Candidate cannot be approved for shadow because gate status is ${gateStatus}.`,
          );
        }
      },
    },
    deps,
  );
}

export async function rejectPdfModelCandidate(
  candidateId: string,
  userId?: string | null,
  note?: string | null,
  deps?: CandidateDeps,
): Promise<PdfModelCandidateRecord> {
  return transitionCandidate(
    {
      candidateId,
      expectedStatuses: [PdfModelCandidateStatus.READY_FOR_REVIEW],
      nextStatus: PdfModelCandidateStatus.REJECTED,
      decisionType: PdfModelCandidateDecisionType.REJECTED,
      userId,
      note,
    },
    deps,
  );
}

export async function archivePdfModelCandidate(
  candidateId: string,
  userId?: string | null,
  note?: string | null,
  deps?: CandidateDeps,
): Promise<PdfModelCandidateRecord> {
  return transitionCandidate(
    {
      candidateId,
      expectedStatuses: [
        PdfModelCandidateStatus.DRAFT,
        PdfModelCandidateStatus.READY_FOR_REVIEW,
        PdfModelCandidateStatus.REJECTED,
        PdfModelCandidateStatus.APPROVED_FOR_SHADOW,
      ],
      nextStatus: PdfModelCandidateStatus.ARCHIVED,
      decisionType: PdfModelCandidateDecisionType.ARCHIVED,
      userId,
      note,
    },
    deps,
  );
}

export async function listPdfModelCandidates(input?: {
  status?: PdfModelCandidateStatus;
  modelTarget?: string;
  modelId?: string;
  limit?: number;
}): Promise<PdfModelCandidateRecord[]> {
  return listPdfModelCandidatesFromRepository(input);
}

export async function getPdfModelCandidateDetail(
  id: string,
): Promise<PdfModelCandidateRecord | null> {
  return getPdfModelCandidateById(id);
}
