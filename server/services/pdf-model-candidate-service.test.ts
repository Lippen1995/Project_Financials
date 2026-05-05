import {
  PdfModelArtifactKind,
  PdfModelArtifactStatus,
  PdfModelCandidateDecisionType,
  PdfModelCandidateStatus,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { PDF_DECISION_ML_FEATURE_SCHEMA_VERSION } from "./pdf-decision-ml-feature-schema-service";
import {
  approvePdfModelCandidateForShadow,
  archivePdfModelCandidate,
  createPdfModelCandidateFromManifestArtifact,
  PdfModelCandidateError,
  rejectPdfModelCandidate,
  submitPdfModelCandidateForReview,
} from "./pdf-model-candidate-service";

function makeArtifact(
  overrides: Partial<PdfModelArtifactSnapshot> = {},
): PdfModelArtifactSnapshot {
  return {
    id: "artifact-1",
    kind: PdfModelArtifactKind.MODEL_REGISTRY_MANIFEST,
    status: PdfModelArtifactStatus.CREATED,
    modelId: "candidate-model",
    modelVersion: "v1",
    modelTarget: "manualReviewRequired",
    featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    fiscalYear: null,
    orgNumber: null,
    split: null,
    summary: {},
    payload: makeManifest(),
    sourceCommand: null,
    sourceCommitSha: null,
    createdByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeManifest(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function makeGate(status: "PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA" = "PASS") {
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
      disagreementCount: 0,
      highSeverityDisagreementCount: 0,
      shadowMoreConservativeCount: 0,
      shadowLessConservativeCount: 0,
      publishSafetyConcernCount: 0,
      manualReviewSafetyConcernCount: 0,
      unreadableSafetyConcernCount: 0,
    },
    metrics: {},
    items: [],
  };
}

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "candidate-1",
    modelId: "candidate-model",
    modelVersion: "v1",
    modelTarget: "manualReviewRequired",
    algorithm: "BASELINE",
    featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    status: PdfModelCandidateStatus.DRAFT,
    manifestArtifactId: "manifest-1",
    manifestArtifact: makeArtifact({ id: "manifest-1" }),
    gateArtifactId: null,
    gateArtifact: null,
    analysisArtifactId: null,
    analysisArtifact: null,
    createdByUserId: "user-1",
    decisions: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as never;
}

function makeDeps(candidate = makeCandidate()) {
  const decisions: unknown[] = [];
  return {
    decisions,
    deps: {
      getCandidate: vi.fn(async () => candidate),
      createDecision: vi.fn(async (input) => {
        decisions.push(input);
        return { id: `decision-${decisions.length}`, ...input };
      }),
      transitionStatus: vi.fn(async (input) => {
        if (!input.expectedStatuses.includes(candidate.status)) {
          throw new PdfModelCandidateError(
            `Invalid model candidate transition ${candidate.status} -> ${input.nextStatus}.`,
          );
        }
        input.validateCandidate?.(candidate);
        const payload =
          input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
            ? { fromStatus: candidate.status, ...(input.payload as Record<string, unknown>) }
            : input.payload;
        decisions.push({
          candidateId: input.candidateId,
          decisionType: input.decisionType,
          note: input.note,
          payload,
          decidedByUserId: input.decidedByUserId,
        });
        return makeCandidate({ ...candidate, status: input.nextStatus });
      }),
    },
  };
}

describe("pdf model candidate service", () => {
  it("creates candidate from valid manifest artifact", async () => {
    const createCandidate = vi.fn(async (input) => makeCandidate(input));
    const candidate = await createPdfModelCandidateFromManifestArtifact(
      { manifestArtifactId: "manifest-1", createdByUserId: "user-1" },
      {
        getArtifact: vi.fn(async () => makeArtifact({ id: "manifest-1" })),
        createCandidate,
      },
    );

    expect(candidate.modelId).toBe("candidate-model");
    expect(createCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        modelTarget: "manualReviewRequired",
        manifestArtifactId: "manifest-1",
        createdByUserId: "user-1",
      }),
    );
  });

  it("rejects non-manifest artifact", async () => {
    await expect(
      createPdfModelCandidateFromManifestArtifact(
        { manifestArtifactId: "artifact-1" },
        {
          getArtifact: vi.fn(async () =>
            makeArtifact({ kind: PdfModelArtifactKind.SHADOW_MODEL_EVALUATION }),
          ),
          createCandidate: vi.fn(),
        },
      ),
    ).rejects.toBeInstanceOf(PdfModelCandidateError);
  });

  it("rejects unsafe manifest", async () => {
    await expect(
      createPdfModelCandidateFromManifestArtifact(
        { manifestArtifactId: "manifest-1" },
        {
          getArtifact: vi.fn(async () =>
            makeArtifact({
              payload: makeManifest({
                safety: {
                  productionUseAllowed: true,
                  routingUseAllowed: false,
                  publishUseAllowed: false,
                  requiresShadowGate: true,
                  notes: [],
                },
              }),
            }),
          ),
          createCandidate: vi.fn(),
        },
      ),
    ).rejects.toBeInstanceOf(PdfModelCandidateError);
  });

  it("submit creates decision and changes status", async () => {
    const { deps, decisions } = makeDeps(makeCandidate({ status: PdfModelCandidateStatus.DRAFT }));
    const candidate = await submitPdfModelCandidateForReview(
      "candidate-1",
      "user-1",
      "ready",
      deps,
    );

    expect(candidate.status).toBe(PdfModelCandidateStatus.READY_FOR_REVIEW);
    expect(decisions).toContainEqual(
      expect.objectContaining({
        decisionType: PdfModelCandidateDecisionType.SUBMITTED_FOR_REVIEW,
        note: "ready",
      }),
    );
  });

  it("approve shadow requires READY_FOR_REVIEW", async () => {
    const { deps } = makeDeps(makeCandidate({ status: PdfModelCandidateStatus.DRAFT }));
    await expect(
      approvePdfModelCandidateForShadow("candidate-1", "user-1", undefined, deps),
    ).rejects.toBeInstanceOf(PdfModelCandidateError);
  });

  it("approve shadow is blocked on FAIL gate", async () => {
    const gateArtifact = makeArtifact({
      id: "gate-1",
      kind: PdfModelArtifactKind.SHADOW_VS_RULE_GATE,
      payload: makeGate("FAIL"),
    });
    const { deps } = makeDeps(
      makeCandidate({
        status: PdfModelCandidateStatus.READY_FOR_REVIEW,
        gateArtifact,
        gateArtifactId: "gate-1",
      }),
    );

    await expect(
      approvePdfModelCandidateForShadow("candidate-1", "user-1", undefined, deps),
    ).rejects.toThrow(/gate status is FAIL/);
  });

  it("approve shadow is allowed on PASS and WARN gate", async () => {
    for (const status of ["PASS", "WARN"] as const) {
      const gateArtifact = makeArtifact({
        id: `gate-${status}`,
        kind: PdfModelArtifactKind.SHADOW_VS_RULE_GATE,
        payload: makeGate(status),
      });
      const { deps } = makeDeps(
        makeCandidate({
          status: PdfModelCandidateStatus.READY_FOR_REVIEW,
          gateArtifact,
          gateArtifactId: gateArtifact.id,
        }),
      );

      const candidate = await approvePdfModelCandidateForShadow(
        "candidate-1",
        "user-1",
        status,
        deps,
      );
      expect(candidate.status).toBe(PdfModelCandidateStatus.APPROVED_FOR_SHADOW);
    }
  });

  it("reject transition works", async () => {
    const { deps } = makeDeps(
      makeCandidate({ status: PdfModelCandidateStatus.READY_FOR_REVIEW }),
    );
    const candidate = await rejectPdfModelCandidate("candidate-1", "user-1", "no", deps);
    expect(candidate.status).toBe(PdfModelCandidateStatus.REJECTED);
  });

  it("archive transition works", async () => {
    const { deps } = makeDeps(makeCandidate({ status: PdfModelCandidateStatus.REJECTED }));
    const candidate = await archivePdfModelCandidate("candidate-1", "user-1", "done", deps);
    expect(candidate.status).toBe(PdfModelCandidateStatus.ARCHIVED);
  });

  it("invalid transitions throw conflict/domain error", async () => {
    const { deps } = makeDeps(makeCandidate({ status: PdfModelCandidateStatus.ARCHIVED }));
    await expect(
      submitPdfModelCandidateForReview("candidate-1", "user-1", undefined, deps),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("audit decision is created for every status mutation", async () => {
    const { deps, decisions } = makeDeps(
      makeCandidate({ status: PdfModelCandidateStatus.READY_FOR_REVIEW }),
    );
    await rejectPdfModelCandidate("candidate-1", "user-1", "bad gate", deps);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      candidateId: "candidate-1",
      decisionType: PdfModelCandidateDecisionType.REJECTED,
    });
  });

  it("approved_for_shadow does not write production config", async () => {
    const { deps, decisions } = makeDeps(
      makeCandidate({ status: PdfModelCandidateStatus.READY_FOR_REVIEW }),
    );
    await approvePdfModelCandidateForShadow("candidate-1", "user-1", "shadow only", deps);
    expect(decisions[0]).toMatchObject({
      payload: expect.objectContaining({ shadowOnly: true }),
    });
    expect(JSON.stringify(decisions)).not.toContain("productionUseAllowed");
  });

  it("does not create an audit decision when transition precondition fails", async () => {
    const { deps, decisions } = makeDeps(makeCandidate({ status: PdfModelCandidateStatus.REJECTED }));
    await expect(
      approvePdfModelCandidateForShadow("candidate-1", "user-1", undefined, deps),
    ).rejects.toBeInstanceOf(PdfModelCandidateError);
    expect(decisions).toHaveLength(0);
  });
});
