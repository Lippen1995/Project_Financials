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
  updatePdfModelCandidateStatus,
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
  getCandidate?: typeof getPdfModelCandidateById;
  updateStatus?: typeof updatePdfModelCandidateStatus;
  createDecision?: typeof createPdfModelCandidateDecision;
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

function assertTransition(
  current: PdfModelCandidateStatus,
  next: PdfModelCandidateStatus,
) {
  const allowed: Record<PdfModelCandidateStatus, PdfModelCandidateStatus[]> = {
    DRAFT: [PdfModelCandidateStatus.READY_FOR_REVIEW, PdfModelCandidateStatus.ARCHIVED],
    READY_FOR_REVIEW: [
      PdfModelCandidateStatus.APPROVED_FOR_SHADOW,
      PdfModelCandidateStatus.REJECTED,
      PdfModelCandidateStatus.ARCHIVED,
    ],
    APPROVED_FOR_SHADOW: [PdfModelCandidateStatus.ARCHIVED],
    REJECTED: [PdfModelCandidateStatus.ARCHIVED],
    ARCHIVED: [],
  };
  if (!allowed[current].includes(next)) {
    throw new PdfModelCandidateError(`Invalid model candidate transition ${current} -> ${next}.`);
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

async function transitionCandidate(
  input: {
    candidateId: string;
    nextStatus: PdfModelCandidateStatus;
    decisionType: PdfModelCandidateDecisionType;
    userId?: string | null;
    note?: string | null;
    payload?: unknown;
  },
  deps?: CandidateDeps,
): Promise<PdfModelCandidateRecord> {
  const getCandidate = deps?.getCandidate ?? getPdfModelCandidateById;
  const updateStatus = deps?.updateStatus ?? updatePdfModelCandidateStatus;
  const candidate = await getCandidate(input.candidateId);
  if (!candidate) throw new PdfModelCandidateError("Model candidate was not found.", 404);
  assertTransition(candidate.status, input.nextStatus);

  const updated = await updateStatus({ id: candidate.id, status: input.nextStatus });
  await recordDecision(
    {
      candidateId: candidate.id,
      decisionType: input.decisionType,
      userId: input.userId,
      note: input.note,
      payload: input.payload ?? { fromStatus: candidate.status, toStatus: input.nextStatus },
    },
    deps,
  );
  return updated;
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
  const getCandidate = deps?.getCandidate ?? getPdfModelCandidateById;
  const candidate = await getCandidate(candidateId);
  if (!candidate) throw new PdfModelCandidateError("Model candidate was not found.", 404);
  assertTransition(candidate.status, PdfModelCandidateStatus.APPROVED_FOR_SHADOW);

  if (candidate.gateArtifact) {
    const gateStatus = validateGateArtifact(candidate.gateArtifact);
    if (gateStatus === "FAIL" || gateStatus === "INSUFFICIENT_DATA") {
      throw new PdfModelCandidateError(
        `Candidate cannot be approved for shadow because gate status is ${gateStatus}.`,
      );
    }
  }

  const updateStatus = deps?.updateStatus ?? updatePdfModelCandidateStatus;
  const updated = await updateStatus({
    id: candidate.id,
    status: PdfModelCandidateStatus.APPROVED_FOR_SHADOW,
  });
  await recordDecision(
    {
      candidateId: candidate.id,
      decisionType: PdfModelCandidateDecisionType.APPROVED_FOR_SHADOW,
      userId,
      note,
      payload: {
        fromStatus: candidate.status,
        toStatus: PdfModelCandidateStatus.APPROVED_FOR_SHADOW,
        shadowOnly: true,
      },
    },
    deps,
  );
  return updated;
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
