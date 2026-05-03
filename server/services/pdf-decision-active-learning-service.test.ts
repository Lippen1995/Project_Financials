import { describe, expect, it } from "vitest";

import type {
  PdfDecisionShadowDocument,
  PdfDecisionShadowEvaluationResult,
} from "./annual-report-pdf-decision-shadow-evaluation";
import { listPdfDecisionActiveLearningQueue } from "./pdf-decision-active-learning-service";

function makeDocument(overrides: Partial<PdfDecisionShadowDocument> = {}): PdfDecisionShadowDocument {
  return {
    filingId: "filing-1",
    extractionRunId: "run-1",
    orgNumber: "928846466",
    fiscalYear: 2024,
    decisionPhase: "post_validation",
    decisionRoute: "TEXT_LAYER",
    riskLevel: "LOW",
    confidenceScore: 0.8,
    manualReviewReasons: [],
    reasons: ["Reliable text"],
    qualityRisk: "LOW",
    recommendedRouteHint: "TEXT_LAYER",
    parserRiskReasons: [],
    extractionWarnings: [],
    hasStructuredDocument: true,
    hasPdfDecision: true,
    hasPostValidationDecision: true,
    filingStatus: "PUBLISHED",
    extractionRunStatus: "COMPLETED",
    validationScore: 0.9,
    blockingRuleCodes: [],
    warningRuleCodes: [],
    reviewStatus: null,
    latestReviewDecisionType: null,
    reviewDecisionCount: 0,
    trainingLabelCount: 0,
    outcome: "PUBLISHED",
    goldSet: null,
    ...overrides,
  };
}

function makeShadowResult(documents: PdfDecisionShadowDocument[]): PdfDecisionShadowEvaluationResult {
  return {
    version: "pdf-decision-shadow-evaluation-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    input: { limit: documents.length },
    documents,
    metrics: {
      totalDocuments: documents.length,
      routeDistribution: {},
      riskDistribution: {},
      outcomeDistribution: {},
      manualReviewRateByRisk: {},
      correctionRateByRisk: {},
      publishRateByRisk: {},
      unreadableRateByRoute: {},
      averageConfidenceByRisk: {},
      goldSetDistribution: {},
      approvedGoldSetCount: 0,
      candidateGoldSetCount: 0,
      excludedGoldSetCount: 0,
      topManualReviewReasons: [],
      topBlockingRuleCodes: [],
      topParserRiskReasons: [],
      candidateGoldSet: [],
    },
  };
}

async function queue(documents: PdfDecisionShadowDocument[], includeCurated = false) {
  return listPdfDecisionActiveLearningQueue(
    { limit: 20, includeCurated },
    { evaluateShadow: async () => makeShadowResult(documents) },
  );
}

describe("listPdfDecisionActiveLearningQueue", () => {
  it("prioritizes low risk corrected documents", async () => {
    const result = await queue([
      makeDocument({
        riskLevel: "LOW",
        outcome: "MANUAL_REVIEW_CORRECTED",
        latestReviewDecisionType: "CORRECTED",
      }),
    ]);

    expect(result.items[0].priorityBand).toBe("HIGH");
    expect(result.items[0].reasons).toContain("LOW_RISK_FAILED");
    expect(result.items[0].reasons).toContain("MANUAL_CORRECTION");
    expect(result.items[0].suggestedAction).toBe("MARK_CANDIDATE");
    expect(result.items[0].suggestedGoldSetReason).toBe("LOW_RISK_FAILED");
  });

  it("prioritizes high risk documents that published", async () => {
    const result = await queue([
      makeDocument({ riskLevel: "HIGH", outcome: "PUBLISHED", confidenceScore: 0.4 }),
    ]);

    expect(result.items[0].priorityBand).toBe("HIGH");
    expect(result.items[0].reasons).toContain("HIGH_RISK_SUCCEEDED");
    expect(result.items[0].suggestedGoldSetReason).toBe("HIGH_RISK_SUCCEEDED");
  });

  it("prioritizes unreadable and reprocess outcomes", async () => {
    const result = await queue([
      makeDocument({ filingId: "unreadable", outcome: "MANUAL_REVIEW_UNREADABLE" }),
      makeDocument({ filingId: "reprocess", outcome: "REPROCESS_REQUESTED" }),
    ]);

    expect(result.items.find((item) => item.filingId === "unreadable")?.reasons).toContain("UNREADABLE");
    expect(result.items.find((item) => item.filingId === "reprocess")?.reasons).toContain("REPROCESS_REQUESTED");
  });

  it("adds balance mismatch reason for balance blocking rules", async () => {
    const result = await queue([
      makeDocument({ blockingRuleCodes: ["BS_TOTAL_BALANCES"] }),
    ]);

    expect(result.items[0].reasons).toContain("BALANCE_MISMATCH");
    expect(result.items[0].suggestedGoldSetReason).toBe("BALANCE_MISMATCH");
  });

  it("includes candidate items by default so they can be approved", async () => {
    const result = await queue([
      makeDocument({
        riskLevel: "LOW",
        outcome: "MANUAL_REVIEW_CORRECTED",
        latestReviewDecisionType: "CORRECTED",
        goldSet: { status: "CANDIDATE", reason: "LOW_RISK_FAILED" },
      }),
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].goldSetStatus).toBe("CANDIDATE");
    expect(result.items[0].suggestedAction).toBe("APPROVE_GOLD_SET");
  });

  it("omits approved and excluded items by default", async () => {
    const approved = makeDocument({
      filingId: "approved",
      riskLevel: "LOW",
      outcome: "MANUAL_REVIEW_CORRECTED",
      goldSet: { status: "APPROVED", reason: "LOW_RISK_FAILED" },
    });
    const excluded = makeDocument({
      filingId: "excluded",
      riskLevel: "LOW",
      outcome: "MANUAL_REVIEW_CORRECTED",
      goldSet: { status: "EXCLUDED", reason: "LOW_RISK_FAILED" },
    });

    expect((await queue([approved, excluded])).items).toHaveLength(0);
  });

  it("includes approved and excluded items when includeCurated is true", async () => {
    const approved = makeDocument({
      filingId: "approved",
      riskLevel: "LOW",
      outcome: "MANUAL_REVIEW_CORRECTED",
      goldSet: { status: "APPROVED", reason: "LOW_RISK_FAILED" },
    });
    const excluded = makeDocument({
      filingId: "excluded",
      riskLevel: "LOW",
      outcome: "MANUAL_REVIEW_CORRECTED",
      goldSet: { status: "EXCLUDED", reason: "LOW_RISK_FAILED" },
    });

    expect((await queue([approved, excluded], true)).items.map((item) => item.filingId)).toEqual([
      "approved",
      "excluded",
    ]);
  });

  it("suggests approving high priority existing candidates", async () => {
    const result = await queue(
      [
        makeDocument({
          riskLevel: "LOW",
          outcome: "MANUAL_REVIEW_CORRECTED",
          latestReviewDecisionType: "CORRECTED",
          goldSet: { status: "CANDIDATE", reason: "LOW_RISK_FAILED" },
        }),
      ],
    );

    expect(result.items[0].suggestedAction).toBe("APPROVE_GOLD_SET");
  });

  it("sorts by priority descending and clamps at 100", async () => {
    const result = await queue([
      makeDocument({
        filingId: "lower",
        confidenceScore: 0.5,
      }),
      makeDocument({
        filingId: "higher",
        riskLevel: "LOW",
        outcome: "MANUAL_REVIEW_CORRECTED",
        latestReviewDecisionType: "CORRECTED",
        blockingRuleCodes: ["BS_TOTAL_BALANCES"],
        confidenceScore: 0.2,
        parserRiskReasons: ["Weak text layer"],
        manualReviewReasons: ["Weak page hints"],
      }),
    ]);

    expect(result.items[0].filingId).toBe("higher");
    expect(result.items[0].priorityScore).toBe(100);
    expect(result.items[0].priorityBand).toBe("HIGH");
  });
});
