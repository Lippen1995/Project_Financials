import { describe, expect, it } from "vitest";

import {
  evaluatePdfDecisionShadow,
  type PdfDecisionShadowOutcome,
} from "./annual-report-pdf-decision-shadow-evaluation";
import type { AnnualReportDecisionShadowRow } from "@/server/persistence/annual-report-decision-shadow-repository";
import type { PdfDecisionGoldSetItemRecord } from "@/server/persistence/pdf-decision-gold-set-repository";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRow(
  overrides: Partial<AnnualReportDecisionShadowRow> = {},
): AnnualReportDecisionShadowRow {
  return {
    filingId: "filing-1",
    fiscalYear: 2024,
    filingStatus: "PUBLISHED",
    orgNumber: "928846466",
    pdfDecisionArtifacts: [],
    hasStructuredDocument: false,
    latestExtractionRun: null,
    latestReview: null,
    reviewedFactCount: 0,
    trainingLabelCount: 0,
    ...overrides,
  };
}

function makeDecisionArtifactBuffer(overrides: {
  phase?: string;
  route?: string;
  riskLevel?: string;
  confidenceScore?: number;
  reasons?: string[];
  manualReviewReasons?: string[];
  qualityRisk?: string;
  recommendedRouteHint?: string;
  parserRiskReasons?: string[];
}): Buffer {
  const payload = {
    version: "pdf-decision-engine-v1",
    phase: overrides.phase ?? "pre_extraction",
    decision: {
      route: overrides.route ?? "TEXT_LAYER",
      riskLevel: overrides.riskLevel ?? "LOW",
      confidenceScore: overrides.confidenceScore ?? 0.85,
      reasons: overrides.reasons ?? ["Reliable embedded text layer detected"],
      manualReviewReasons: overrides.manualReviewReasons ?? [],
      diagnostics: {
        qualityRisk: overrides.qualityRisk ?? "LOW",
        recommendedRouteHint: overrides.recommendedRouteHint ?? "TEXT_LAYER",
        parserRiskReasons: overrides.parserRiskReasons ?? [],
        extractionWarnings: [],
      },
    },
    inputSummary: { hasPreflight: true, hasStructuredDocument: true },
    createdAt: new Date().toISOString(),
    source: "annual-report-financials-service",
  };
  return Buffer.from(JSON.stringify(payload), "utf8");
}

function makeArtifactReader(
  artifacts: Record<string, Buffer>,
): (key: string) => Promise<Buffer | null> {
  return async (key) => artifacts[key] ?? null;
}

function makeGoldSetItem(
  overrides: Partial<PdfDecisionGoldSetItemRecord> = {},
): PdfDecisionGoldSetItemRecord {
  return {
    id: "gold-1",
    filingId: "filing-1",
    extractionRunId: null,
    orgNumber: "928846466",
    fiscalYear: 2024,
    status: "CANDIDATE",
    reason: "REPRESENTATIVE_SAMPLE",
    note: null,
    decisionRoute: "TEXT_LAYER",
    riskLevel: "LOW",
    confidenceScore: 0.85,
    outcome: "PUBLISHED",
    source: "ADMIN",
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evaluatePdfDecisionShadow", () => {
  it("returns empty result for no rows", async () => {
    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => [], readArtifact: undefined },
    );

    expect(result.version).toBe("pdf-decision-shadow-evaluation-v1");
    expect(result.documents).toHaveLength(0);
    expect(result.metrics.totalDocuments).toBe(0);
    expect(result.metrics.routeDistribution).toEqual({});
    expect(result.metrics.riskDistribution).toEqual({});
    expect(result.metrics.outcomeDistribution).toEqual({});
    expect(result.metrics.goldSetDistribution).toEqual({});
    expect(result.metrics.approvedGoldSetCount).toBe(0);
    expect(result.metrics.candidateGoldSetCount).toBe(0);
    expect(result.metrics.excludedGoldSetCount).toBe(0);
    expect(result.metrics.candidateGoldSet).toHaveLength(0);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("prefers post_validation over pre_extraction decision artifact", async () => {
    const row = makeRow({
      filingId: "filing-pv",
      filingStatus: "PUBLISHED",
      pdfDecisionArtifacts: [
        { storageKey: "key-pre", metadata: null },
        { storageKey: "key-post", metadata: null },
      ],
    });

    const artifacts = {
      "key-pre": makeDecisionArtifactBuffer({
        phase: "pre_extraction",
        route: "TEXT_LAYER",
        riskLevel: "LOW",
      }),
      "key-post": makeDecisionArtifactBuffer({
        phase: "post_validation",
        route: "MANUAL_REVIEW",
        riskLevel: "HIGH",
      }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => [row], readArtifact: makeArtifactReader(artifacts) },
    );

    const doc = result.documents[0];
    expect(doc.decisionPhase).toBe("post_validation");
    expect(doc.decisionRoute).toBe("MANUAL_REVIEW");
    expect(doc.riskLevel).toBe("HIGH");
    expect(doc.hasPostValidationDecision).toBe(true);
  });

  it("falls back to pre_extraction if no post_validation artifact", async () => {
    const row = makeRow({
      pdfDecisionArtifacts: [{ storageKey: "key-pre", metadata: null }],
    });

    const result = await evaluatePdfDecisionShadow(
      {},
      {
        listRows: async () => [row],
        readArtifact: makeArtifactReader({
          "key-pre": makeDecisionArtifactBuffer({ phase: "pre_extraction", route: "TEXT_LAYER" }),
        }),
      },
    );

    expect(result.documents[0].decisionPhase).toBe("pre_extraction");
    expect(result.documents[0].hasPostValidationDecision).toBe(false);
  });

  it("derives PUBLISHED outcome from filing status", async () => {
    const row = makeRow({ filingStatus: "PUBLISHED", latestReview: null });
    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => [row] },
    );
    expect(result.documents[0].outcome).toBe("PUBLISHED" satisfies PdfDecisionShadowOutcome);
  });

  it("derives MANUAL_REVIEW_PENDING from review status", async () => {
    const row = makeRow({
      filingStatus: "MANUAL_REVIEW",
      latestReview: {
        id: "rev-1",
        extractionRunId: null,
        status: "PENDING_REVIEW",
        blockingRuleCodes: [],
        qualityScore: null,
        decisions: [],
      },
    });
    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => [row] },
    );
    expect(result.documents[0].outcome).toBe(
      "MANUAL_REVIEW_PENDING" satisfies PdfDecisionShadowOutcome,
    );
  });

  it("derives MANUAL_REVIEW_CORRECTED from latest decision type", async () => {
    const row = makeRow({
      filingStatus: "PUBLISHED",
      latestReview: {
        id: "rev-1",
        extractionRunId: "run-1",
        status: "ACCEPTED",
        blockingRuleCodes: ["BS_TOTAL_BALANCES"],
        qualityScore: 0.6,
        decisions: [
          { decisionType: "CORRECTED", createdAt: new Date() },
          { decisionType: "REPROCESS_REQUESTED", createdAt: new Date() },
        ],
      },
    });
    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => [row] },
    );
    expect(result.documents[0].outcome).toBe(
      "MANUAL_REVIEW_CORRECTED" satisfies PdfDecisionShadowOutcome,
    );
    expect(result.documents[0].latestReviewDecisionType).toBe("CORRECTED");
    expect(result.documents[0].reviewDecisionCount).toBe(2);
  });

  it("derives MANUAL_REVIEW_UNREADABLE from latest decision", async () => {
    const row = makeRow({
      filingStatus: "MANUAL_REVIEW",
      latestReview: {
        id: "rev-1",
        extractionRunId: null,
        status: "REJECTED",
        blockingRuleCodes: [],
        qualityScore: null,
        decisions: [{ decisionType: "UNREADABLE", createdAt: new Date() }],
      },
    });
    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => [row] },
    );
    expect(result.documents[0].outcome).toBe(
      "MANUAL_REVIEW_UNREADABLE" satisfies PdfDecisionShadowOutcome,
    );
  });

  it("derives FAILED from filing status", async () => {
    const row = makeRow({ filingStatus: "FAILED", latestReview: null });
    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => [row] },
    );
    expect(result.documents[0].outcome).toBe("FAILED" satisfies PdfDecisionShadowOutcome);
  });

  it("computes correct route/risk/outcome distributions", async () => {
    const rows = [
      makeRow({
        filingId: "f1",
        filingStatus: "PUBLISHED",
        pdfDecisionArtifacts: [{ storageKey: "k1", metadata: null }],
      }),
      makeRow({
        filingId: "f2",
        filingStatus: "PUBLISHED",
        pdfDecisionArtifacts: [{ storageKey: "k2", metadata: null }],
      }),
      makeRow({
        filingId: "f3",
        filingStatus: "MANUAL_REVIEW",
        latestReview: {
          id: "rev-3",
          extractionRunId: null,
          status: "PENDING_REVIEW",
          blockingRuleCodes: [],
          qualityScore: null,
          decisions: [],
        },
        pdfDecisionArtifacts: [{ storageKey: "k3", metadata: null }],
      }),
    ];

    const artifacts = {
      k1: makeDecisionArtifactBuffer({ route: "TEXT_LAYER", riskLevel: "LOW", confidenceScore: 0.9 }),
      k2: makeDecisionArtifactBuffer({ route: "TEXT_LAYER", riskLevel: "LOW", confidenceScore: 0.8 }),
      k3: makeDecisionArtifactBuffer({ route: "MANUAL_REVIEW", riskLevel: "HIGH", confidenceScore: 0.35 }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(result.metrics.totalDocuments).toBe(3);
    expect(result.metrics.routeDistribution["TEXT_LAYER"]).toBe(2);
    expect(result.metrics.routeDistribution["MANUAL_REVIEW"]).toBe(1);
    expect(result.metrics.riskDistribution["LOW"]).toBe(2);
    expect(result.metrics.riskDistribution["HIGH"]).toBe(1);
    expect(result.metrics.outcomeDistribution["PUBLISHED"]).toBe(2);
    expect(result.metrics.outcomeDistribution["MANUAL_REVIEW_PENDING"]).toBe(1);
  });

  it("computes correct manualReviewRateByRisk", async () => {
    const rows = [
      makeRow({ filingId: "f1", filingStatus: "PUBLISHED", pdfDecisionArtifacts: [{ storageKey: "k1", metadata: null }] }),
      makeRow({
        filingId: "f2",
        filingStatus: "MANUAL_REVIEW",
        latestReview: { id: "rev-2", extractionRunId: null, status: "PENDING_REVIEW", blockingRuleCodes: [], qualityScore: null, decisions: [] },
        pdfDecisionArtifacts: [{ storageKey: "k2", metadata: null }],
      }),
    ];

    const artifacts = {
      k1: makeDecisionArtifactBuffer({ riskLevel: "LOW" }),
      k2: makeDecisionArtifactBuffer({ riskLevel: "LOW" }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(result.metrics.manualReviewRateByRisk["LOW"]).toBe(0.5);
    expect(result.metrics.publishRateByRisk["LOW"]).toBe(0.5);
  });

  it("computes correct correctionRateByRisk", async () => {
    const rows = [
      makeRow({
        filingId: "f1",
        filingStatus: "PUBLISHED",
        latestReview: {
          id: "rev-1",
          extractionRunId: null,
          status: "ACCEPTED",
          blockingRuleCodes: [],
          qualityScore: null,
          decisions: [{ decisionType: "CORRECTED", createdAt: new Date() }],
        },
        pdfDecisionArtifacts: [{ storageKey: "k1", metadata: null }],
      }),
      makeRow({
        filingId: "f2",
        filingStatus: "PUBLISHED",
        pdfDecisionArtifacts: [{ storageKey: "k2", metadata: null }],
      }),
    ];

    const artifacts = {
      k1: makeDecisionArtifactBuffer({ riskLevel: "HIGH" }),
      k2: makeDecisionArtifactBuffer({ riskLevel: "HIGH" }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(result.metrics.correctionRateByRisk["HIGH"]).toBe(0.5);
  });

  it("computes averageConfidenceByRisk", async () => {
    const rows = [
      makeRow({ filingId: "f1", pdfDecisionArtifacts: [{ storageKey: "k1", metadata: null }] }),
      makeRow({ filingId: "f2", pdfDecisionArtifacts: [{ storageKey: "k2", metadata: null }] }),
    ];
    const artifacts = {
      k1: makeDecisionArtifactBuffer({ riskLevel: "LOW", confidenceScore: 0.8 }),
      k2: makeDecisionArtifactBuffer({ riskLevel: "LOW", confidenceScore: 0.6 }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(result.metrics.averageConfidenceByRisk["LOW"]).toBeCloseTo(0.7, 3);
  });

  it("computes unreadableRateByRoute", async () => {
    const rows = [
      makeRow({
        filingId: "f1",
        filingStatus: "MANUAL_REVIEW",
        latestReview: {
          id: "rev-1",
          extractionRunId: null,
          status: "REJECTED",
          blockingRuleCodes: [],
          qualityScore: null,
          decisions: [{ decisionType: "UNREADABLE", createdAt: new Date() }],
        },
        pdfDecisionArtifacts: [{ storageKey: "k1", metadata: null }],
      }),
      makeRow({
        filingId: "f2",
        filingStatus: "PUBLISHED",
        pdfDecisionArtifacts: [{ storageKey: "k2", metadata: null }],
      }),
    ];
    const artifacts = {
      k1: makeDecisionArtifactBuffer({ route: "FORCE_OCR", riskLevel: "HIGH" }),
      k2: makeDecisionArtifactBuffer({ route: "FORCE_OCR", riskLevel: "HIGH" }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(result.metrics.unreadableRateByRoute["FORCE_OCR"]).toBe(0.5);
  });

  it("aggregates top manual review reasons", async () => {
    const rows = [
      makeRow({ filingId: "f1", pdfDecisionArtifacts: [{ storageKey: "k1", metadata: null }] }),
      makeRow({ filingId: "f2", pdfDecisionArtifacts: [{ storageKey: "k2", metadata: null }] }),
    ];
    const artifacts = {
      k1: makeDecisionArtifactBuffer({ manualReviewReasons: ["No financial sections", "High quality risk"] }),
      k2: makeDecisionArtifactBuffer({ manualReviewReasons: ["No financial sections"] }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(result.metrics.topManualReviewReasons[0]).toEqual({ reason: "No financial sections", count: 2 });
  });

  it("aggregates top blocking rule codes", async () => {
    const rows = [
      makeRow({
        filingId: "f1",
        latestReview: {
          id: "r1",
          extractionRunId: null,
          status: "PENDING_REVIEW",
          blockingRuleCodes: ["BS_TOTAL_BALANCES", "INCOME_MISMATCH"],
          qualityScore: null,
          decisions: [],
        },
      }),
      makeRow({
        filingId: "f2",
        latestReview: {
          id: "r2",
          extractionRunId: null,
          status: "PENDING_REVIEW",
          blockingRuleCodes: ["BS_TOTAL_BALANCES"],
          qualityScore: null,
          decisions: [],
        },
      }),
    ];

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows },
    );

    expect(result.metrics.topBlockingRuleCodes[0]).toEqual({ ruleCode: "BS_TOTAL_BALANCES", count: 2 });
  });

  it("aggregates top parser risk reasons", async () => {
    const rows = [
      makeRow({ filingId: "f1", pdfDecisionArtifacts: [{ storageKey: "k1", metadata: null }] }),
      makeRow({ filingId: "f2", pdfDecisionArtifacts: [{ storageKey: "k2", metadata: null }] }),
    ];
    const artifacts = {
      k1: makeDecisionArtifactBuffer({ parserRiskReasons: ["Weak text layer"] }),
      k2: makeDecisionArtifactBuffer({ parserRiskReasons: ["Weak text layer", "Low density"] }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(result.metrics.topParserRiskReasons[0]).toEqual({ reason: "Weak text layer", count: 2 });
  });

  it("includes low-risk non-published doc in gold set", async () => {
    const rows = [
      makeRow({
        filingId: "f1",
        filingStatus: "MANUAL_REVIEW",
        latestReview: {
          id: "r1",
          extractionRunId: null,
          status: "PENDING_REVIEW",
          blockingRuleCodes: [],
          qualityScore: null,
          decisions: [],
        },
        pdfDecisionArtifacts: [{ storageKey: "k1", metadata: null }],
      }),
    ];
    const artifacts = {
      k1: makeDecisionArtifactBuffer({ riskLevel: "LOW", confidenceScore: 0.9 }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(result.metrics.candidateGoldSet.some((c) => c.filingId === "f1")).toBe(true);
    expect(
      result.metrics.candidateGoldSet.find((c) => c.filingId === "f1")?.reason,
    ).toContain("LOW risk");
  });

  it("includes high-risk accepted doc in gold set", async () => {
    const rows = [
      makeRow({
        filingId: "f2",
        filingStatus: "PUBLISHED",
        latestReview: {
          id: "r2",
          extractionRunId: null,
          status: "ACCEPTED",
          blockingRuleCodes: [],
          qualityScore: null,
          decisions: [{ decisionType: "ACCEPTED", createdAt: new Date() }],
        },
        pdfDecisionArtifacts: [{ storageKey: "k2", metadata: null }],
      }),
    ];
    const artifacts = {
      k2: makeDecisionArtifactBuffer({ riskLevel: "HIGH", confidenceScore: 0.3 }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(result.metrics.candidateGoldSet.some((c) => c.filingId === "f2")).toBe(true);
    expect(
      result.metrics.candidateGoldSet.find((c) => c.filingId === "f2")?.reason,
    ).toContain("HIGH risk");
  });

  it("includes unreadable doc in gold set", async () => {
    const row = makeRow({
      filingId: "f-unreadable",
      filingStatus: "MANUAL_REVIEW",
      latestReview: {
        id: "r-u",
        extractionRunId: null,
        status: "REJECTED",
        blockingRuleCodes: [],
        qualityScore: null,
        decisions: [{ decisionType: "UNREADABLE", createdAt: new Date() }],
      },
    });

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => [row] },
    );

    const candidate = result.metrics.candidateGoldSet.find((c) => c.filingId === "f-unreadable");
    expect(candidate).toBeDefined();
    expect(candidate?.outcome).toBe("MANUAL_REVIEW_UNREADABLE");
  });

  it("respects gold set max of 25 candidates", async () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      makeRow({
        filingId: `f-${i}`,
        filingStatus: "MANUAL_REVIEW",
        latestReview: {
          id: `r-${i}`,
          extractionRunId: null,
          status: "PENDING_REVIEW",
          blockingRuleCodes: [],
          qualityScore: null,
          decisions: [],
        },
        pdfDecisionArtifacts: [{ storageKey: `k-${i}`, metadata: null }],
      }),
    );
    const artifacts: Record<string, Buffer> = {};
    for (let i = 0; i < 40; i++) {
      artifacts[`k-${i}`] = makeDecisionArtifactBuffer({ riskLevel: "LOW" });
    }

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(result.metrics.candidateGoldSet.length).toBeLessThanOrEqual(25);
  });

  it("merges gold-set state onto documents and metrics", async () => {
    const rows = [
      makeRow({ filingId: "f-approved", filingStatus: "PUBLISHED" }),
      makeRow({ filingId: "f-candidate", filingStatus: "PUBLISHED" }),
      makeRow({ filingId: "f-excluded", filingStatus: "PUBLISHED" }),
    ];

    const result = await evaluatePdfDecisionShadow(
      {},
      {
        listRows: async () => rows,
        listGoldSetItems: async (filingIds) => {
          expect(filingIds).toEqual(["f-approved", "f-candidate", "f-excluded"]);
          return [
            makeGoldSetItem({ id: "g1", filingId: "f-approved", status: "APPROVED" }),
            makeGoldSetItem({
              id: "g2",
              filingId: "f-candidate",
              status: "CANDIDATE",
              reason: "LOW_RISK_FAILED",
              note: "Check manually",
            }),
            makeGoldSetItem({ id: "g3", filingId: "f-excluded", status: "EXCLUDED" }),
          ];
        },
      },
    );

    expect(result.documents.find((doc) => doc.filingId === "f-approved")?.goldSet).toMatchObject({
      status: "APPROVED",
      reason: "REPRESENTATIVE_SAMPLE",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(result.documents.find((doc) => doc.filingId === "f-candidate")?.goldSet).toMatchObject({
      status: "CANDIDATE",
      reason: "LOW_RISK_FAILED",
      note: "Check manually",
    });
    expect(result.metrics.goldSetDistribution).toEqual({
      APPROVED: 1,
      CANDIDATE: 1,
      EXCLUDED: 1,
    });
    expect(result.metrics.approvedGoldSetCount).toBe(1);
    expect(result.metrics.candidateGoldSetCount).toBe(1);
    expect(result.metrics.excludedGoldSetCount).toBe(1);
  });

  it("marks curated candidate rows and excludes explicitly excluded documents", async () => {
    const rows = [
      makeRow({
        filingId: "f-curated-candidate",
        filingStatus: "MANUAL_REVIEW",
        latestReview: {
          id: "r1",
          extractionRunId: null,
          status: "PENDING_REVIEW",
          blockingRuleCodes: [],
          qualityScore: null,
          decisions: [],
        },
        pdfDecisionArtifacts: [{ storageKey: "k1", metadata: null }],
      }),
      makeRow({
        filingId: "f-excluded-candidate",
        filingStatus: "MANUAL_REVIEW",
        latestReview: {
          id: "r2",
          extractionRunId: null,
          status: "PENDING_REVIEW",
          blockingRuleCodes: [],
          qualityScore: null,
          decisions: [],
        },
        pdfDecisionArtifacts: [{ storageKey: "k2", metadata: null }],
      }),
    ];
    const artifacts = {
      k1: makeDecisionArtifactBuffer({ riskLevel: "LOW", confidenceScore: 0.9 }),
      k2: makeDecisionArtifactBuffer({ riskLevel: "LOW", confidenceScore: 0.9 }),
    };

    const result = await evaluatePdfDecisionShadow(
      {},
      {
        listRows: async () => rows,
        readArtifact: makeArtifactReader(artifacts),
        listGoldSetItems: async () => [
          makeGoldSetItem({
            filingId: "f-curated-candidate",
            status: "CANDIDATE",
            reason: "LOW_RISK_FAILED",
          }),
          makeGoldSetItem({
            filingId: "f-excluded-candidate",
            status: "EXCLUDED",
            reason: "LOW_RISK_FAILED",
          }),
        ],
      },
    );

    const candidate = result.metrics.candidateGoldSet.find(
      (item) => item.filingId === "f-curated-candidate",
    );
    expect(candidate?.goldSet).toMatchObject({ status: "CANDIDATE" });
    expect(
      result.metrics.candidateGoldSet.some((item) => item.filingId === "f-excluded-candidate"),
    ).toBe(false);
  });

  it("handles malformed artifact gracefully", async () => {
    const row = makeRow({
      filingId: "f-bad",
      pdfDecisionArtifacts: [{ storageKey: "k-bad", metadata: null }],
    });

    const result = await evaluatePdfDecisionShadow(
      {},
      {
        listRows: async () => [row],
        readArtifact: async () => Buffer.from("not valid json {{{{", "utf8"),
      },
    );

    const doc = result.documents[0];
    expect(doc.hasPdfDecision).toBe(true);
    expect(doc.decisionRoute).toBeNull();
    expect(doc.riskLevel).toBeNull();
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("handles null readArtifact dep with hasPdfDecision true", async () => {
    const row = makeRow({
      filingId: "f-no-read",
      pdfDecisionArtifacts: [{ storageKey: "k-x", metadata: null }],
    });

    // No readArtifact dep — should not crash, decision fields null
    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => [row] },
    );

    const doc = result.documents[0];
    expect(doc.hasPdfDecision).toBe(true);
    expect(doc.decisionRoute).toBeNull();
  });

  it("result is JSON-safe", async () => {
    const rows = [
      makeRow({ filingId: "f1", pdfDecisionArtifacts: [{ storageKey: "k1", metadata: null }] }),
    ];
    const artifacts = { k1: makeDecisionArtifactBuffer({ route: "TEXT_LAYER", riskLevel: "LOW" }) };

    const result = await evaluatePdfDecisionShadow(
      {},
      { listRows: async () => rows, readArtifact: makeArtifactReader(artifacts) },
    );

    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("passes limit and filters to listRows", async () => {
    let capturedInput: unknown;
    const result = await evaluatePdfDecisionShadow(
      { limit: 42, fiscalYear: 2023, orgNumber: "12345" },
      {
        listRows: async (inp) => {
          capturedInput = inp;
          return [];
        },
      },
    );

    expect(capturedInput).toMatchObject({ limit: 42, fiscalYear: 2023, orgNumber: "12345" });
    expect(result.input).toMatchObject({ limit: 42, fiscalYear: 2023, orgNumber: "12345" });
  });
});
