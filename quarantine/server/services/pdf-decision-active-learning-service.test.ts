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

  it("uses default config confidence thresholds", async () => {
    const result = await queue([
      makeDocument({ confidenceScore: 0.44 }),
    ]);

    expect(result.items[0].reasons).toContain("LOW_CONFIDENCE");
    expect(result.items[0].reasonDetails).toContain("Decision confidence is below 45%.");
  });

  it("uses custom low confidence threshold", async () => {
    const result = await listPdfDecisionActiveLearningQueue(
      {
        limit: 20,
        ruleConfig: {
          activeLearning: {
            lowConfidenceThreshold: 0.6,
            mediumConfidenceThreshold: 0.65,
          },
        },
      },
      {
        evaluateShadow: async () => makeShadowResult([
          makeDocument({ confidenceScore: 0.55 }),
        ]),
      },
    );

    expect(result.items[0].reasonDetails).toContain("Decision confidence is below 60%.");
  });

  it("uses custom medium confidence threshold", async () => {
    const defaultResult = await queue([
      makeDocument({ confidenceScore: 0.7 }),
    ]);
    const customResult = await listPdfDecisionActiveLearningQueue(
      {
        limit: 20,
        ruleConfig: {
          activeLearning: {
            lowConfidenceThreshold: 0.45,
            mediumConfidenceThreshold: 0.75,
          },
        },
      },
      {
        evaluateShadow: async () => makeShadowResult([
          makeDocument({ confidenceScore: 0.7 }),
        ]),
      },
    );

    expect(defaultResult.items[0].reasons).toEqual(["NOT_IN_GOLD_SET"]);
    expect(customResult.items[0].reasons).toContain("LOW_CONFIDENCE");
    expect(customResult.items[0].priorityScore).toBeGreaterThan(defaultResult.items[0].priorityScore);
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

  it("sorts by priority descending then diversity descending and clamps at 100", async () => {
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

  // PR #30 new tests

  it("coverage summary counts route/risk/outcome/routeRisk/year", async () => {
    const docs = [
      makeDocument({ filingId: "a", decisionRoute: "TEXT_LAYER", riskLevel: "LOW", outcome: "PUBLISHED", fiscalYear: 2023 }),
      makeDocument({ filingId: "b", decisionRoute: "TEXT_LAYER", riskLevel: "HIGH", outcome: "FAILED", fiscalYear: 2024 }),
      makeDocument({ filingId: "c", decisionRoute: "OCR", riskLevel: "LOW", outcome: "PUBLISHED", fiscalYear: 2023 }),
    ];
    const result = await queue(docs, true);

    expect(result.coverageSummary.routeCounts["TEXT_LAYER"]).toBe(2);
    expect(result.coverageSummary.routeCounts["OCR"]).toBe(1);
    expect(result.coverageSummary.riskCounts["LOW"]).toBe(2);
    expect(result.coverageSummary.riskCounts["HIGH"]).toBe(1);
    expect(result.coverageSummary.outcomeCounts["PUBLISHED"]).toBe(2);
    expect(result.coverageSummary.outcomeCounts["FAILED"]).toBe(1);
    expect(result.coverageSummary.fiscalYearCounts["2023"]).toBe(2);
    expect(result.coverageSummary.fiscalYearCounts["2024"]).toBe(1);
    expect(result.coverageSummary.routeRiskCounts["TEXT_LAYER:LOW"]).toBe(1);
    expect(result.coverageSummary.routeRiskCounts["TEXT_LAYER:HIGH"]).toBe(1);
  });

  it("adds UNDERREPRESENTED_ROUTE signal for rare routes", async () => {
    // OCR appears once in a sea of TEXT_LAYER docs
    const docs = [
      makeDocument({ filingId: "ocr", decisionRoute: "OCR", riskLevel: "LOW", outcome: "PUBLISHED", fiscalYear: 2024 }),
      ...Array.from({ length: 5 }, (_, i) =>
        makeDocument({ filingId: `tl-${i}`, decisionRoute: "TEXT_LAYER", riskLevel: "LOW", outcome: "PUBLISHED", fiscalYear: 2024 }),
      ),
    ];
    const result = await queue(docs, true);
    const ocrItem = result.items.find((item) => item.filingId === "ocr");
    expect(ocrItem?.coverageSignals).toContain("UNDERREPRESENTED_ROUTE");
  });

  it("adds UNDERREPRESENTED_RISK signal for rare risk levels", async () => {
    const docs = [
      makeDocument({ filingId: "high", decisionRoute: "TEXT_LAYER", riskLevel: "HIGH", outcome: "PUBLISHED", fiscalYear: 2024 }),
      ...Array.from({ length: 5 }, (_, i) =>
        makeDocument({ filingId: `low-${i}`, decisionRoute: "TEXT_LAYER", riskLevel: "LOW", outcome: "PUBLISHED", fiscalYear: 2024 }),
      ),
    ];
    const result = await queue(docs, true);
    const highItem = result.items.find((item) => item.filingId === "high");
    expect(highItem?.coverageSignals).toContain("UNDERREPRESENTED_RISK");
  });

  it("adds UNDERREPRESENTED_OUTCOME signal for rare outcomes", async () => {
    const docs = [
      makeDocument({ filingId: "failed", decisionRoute: "TEXT_LAYER", riskLevel: "LOW", outcome: "FAILED", fiscalYear: 2024 }),
      ...Array.from({ length: 5 }, (_, i) =>
        makeDocument({ filingId: `pub-${i}`, decisionRoute: "TEXT_LAYER", riskLevel: "LOW", outcome: "PUBLISHED", fiscalYear: 2024 }),
      ),
    ];
    const result = await queue(docs, true);
    const failedItem = result.items.find((item) => item.filingId === "failed");
    expect(failedItem?.coverageSignals).toContain("UNDERREPRESENTED_OUTCOME");
  });

  it("adds REPEATED_PARSER_FAILURE signal and PARSER investigationArea for repeated parser reasons", async () => {
    const docs = [
      makeDocument({ filingId: "a", parserRiskReasons: ["Weak text layer"] }),
      makeDocument({ filingId: "b", parserRiskReasons: ["Weak text layer"] }),
    ];
    const result = await queue(docs);
    const itemA = result.items.find((item) => item.filingId === "a");
    const itemB = result.items.find((item) => item.filingId === "b");
    expect(itemA?.coverageSignals).toContain("REPEATED_PARSER_FAILURE");
    expect(itemB?.coverageSignals).toContain("REPEATED_PARSER_FAILURE");
    expect(itemA?.investigationArea).toBe("PARSER");
    expect(itemA?.suggestedAction).toBe("PARSER_INVESTIGATION");
  });

  it("adds REPEATED_BLOCKING_RULE signal for repeated blocking codes", async () => {
    const docs = [
      makeDocument({ filingId: "a", blockingRuleCodes: ["BS_TOTAL_BALANCES"] }),
      makeDocument({ filingId: "b", blockingRuleCodes: ["BS_TOTAL_BALANCES"] }),
    ];
    const result = await queue(docs);
    const itemA = result.items.find((item) => item.filingId === "a");
    expect(itemA?.coverageSignals).toContain("REPEATED_BLOCKING_RULE");
  });

  it("diversity score increases priority but does not exceed 100", async () => {
    const doc = makeDocument({
      filingId: "diverse",
      decisionRoute: "OCR",
      riskLevel: "HIGH",
      outcome: "FAILED",
      fiscalYear: 2020,
      parserRiskReasons: ["something"],
    });
    const result = await queue([doc]);
    const item = result.items[0];
    expect(item.diversityScore).toBeGreaterThan(0);
    expect(item.priorityScore).toBeLessThanOrEqual(100);
  });

  it("gold-set approved and excluded remain hidden by default", async () => {
    const approved = makeDocument({ filingId: "approved", goldSet: { status: "APPROVED", reason: "REPRESENTATIVE_SAMPLE" } });
    const excluded = makeDocument({ filingId: "excluded", goldSet: { status: "EXCLUDED", reason: "REPRESENTATIVE_SAMPLE" } });
    const result = await queue([approved, excluded]);
    expect(result.items).toHaveLength(0);
  });

  it("candidate visible by default", async () => {
    const candidate = makeDocument({
      filingId: "candidate",
      riskLevel: "LOW",
      outcome: "MANUAL_REVIEW_CORRECTED",
      goldSet: { status: "CANDIDATE", reason: "LOW_RISK_FAILED" },
    });
    const result = await queue([candidate]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].goldSetStatus).toBe("CANDIDATE");
  });

  it("filter by minPriority", async () => {
    const docs = [
      makeDocument({ filingId: "high", riskLevel: "LOW", outcome: "MANUAL_REVIEW_CORRECTED", latestReviewDecisionType: "CORRECTED" }),
      makeDocument({ filingId: "low", riskLevel: "LOW", outcome: "PUBLISHED", confidenceScore: 0.85 }),
    ];
    const result = await listPdfDecisionActiveLearningQueue(
      { limit: 20, minPriority: 60 },
      { evaluateShadow: async () => makeShadowResult(docs) },
    );
    const filingIds = result.items.map((i) => i.filingId);
    expect(filingIds).toContain("high");
    expect(filingIds).not.toContain("low");
  });

  it("filter by priorityBand", async () => {
    const docs = [
      makeDocument({ filingId: "high", riskLevel: "LOW", outcome: "MANUAL_REVIEW_CORRECTED", latestReviewDecisionType: "CORRECTED" }),
      makeDocument({ filingId: "low", riskLevel: "LOW", outcome: "PUBLISHED", confidenceScore: 0.85 }),
    ];
    const result = await listPdfDecisionActiveLearningQueue(
      { limit: 20, priorityBand: "HIGH" },
      { evaluateShadow: async () => makeShadowResult(docs) },
    );
    for (const item of result.items) {
      expect(item.priorityBand).toBe("HIGH");
    }
  });

  it("filter by investigationArea", async () => {
    const docs = [
      makeDocument({ filingId: "parser", parserRiskReasons: ["Weak text layer"] }),
      makeDocument({ filingId: "other", blockingRuleCodes: ["BS_TOTAL_BALANCES"] }),
    ];
    const result = await listPdfDecisionActiveLearningQueue(
      { limit: 20, investigationArea: "PARSER" },
      { evaluateShadow: async () => makeShadowResult(docs) },
    );
    for (const item of result.items) {
      expect(item.investigationArea).toBe("PARSER");
    }
  });

  it("queue sorted by priority desc then diversity desc", async () => {
    const docs = [
      makeDocument({ filingId: "a", riskLevel: "LOW", outcome: "PUBLISHED", confidenceScore: 0.44 }),
      makeDocument({ filingId: "b", riskLevel: "LOW", outcome: "MANUAL_REVIEW_CORRECTED", latestReviewDecisionType: "CORRECTED" }),
    ];
    const result = await queue(docs);
    const priorities = result.items.map((i) => i.priorityScore);
    for (let idx = 1; idx < priorities.length; idx++) {
      expect(priorities[idx - 1]).toBeGreaterThanOrEqual(priorities[idx]);
    }
  });

  it("cluster summary is built from items", async () => {
    const docs = [
      makeDocument({ filingId: "a", blockingRuleCodes: ["BS_TOTAL_BALANCES"] }),
      makeDocument({ filingId: "b", blockingRuleCodes: ["BS_TOTAL_BALANCES"] }),
    ];
    const result = await queue(docs);
    const cluster = result.clusterSummary.find((c) => c.clusterKey === "blocking:BS_TOTAL_BALANCES");
    expect(cluster).toBeDefined();
    expect(cluster?.count).toBe(2);
    expect(cluster?.label).toContain("BS_TOTAL_BALANCES");
  });
});
