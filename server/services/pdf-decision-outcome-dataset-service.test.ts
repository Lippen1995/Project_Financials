import { describe, expect, it } from "vitest";

import type {
  PdfDecisionShadowDocument,
  PdfDecisionShadowEvaluationResult,
} from "./annual-report-pdf-decision-shadow-evaluation";
import {
  buildPdfDecisionOutcomeDataset,
  PdfDecisionOutcomeDatasetValidationError,
  serializePdfDecisionOutcomeDatasetJsonl,
  validatePdfDecisionOutcomeDatasetRecord,
} from "./pdf-decision-outcome-dataset-service";

function makeDocument(
  overrides: Partial<PdfDecisionShadowDocument> = {},
): PdfDecisionShadowDocument & { reviewedFactCount: number } {
  return {
    filingId: "filing-1",
    extractionRunId: "run-1",
    orgNumber: "928846466",
    fiscalYear: 2024,
    decisionPhase: "post_validation",
    ruleConfigVersion: "pdf-decision-rules-v1",
    decisionRoute: "TEXT_LAYER",
    riskLevel: "LOW",
    confidenceScore: 0.88,
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
    trainingLabelCount: 2,
    reviewedFactCount: 3,
    outcome: "PUBLISHED",
    goldSet: null,
    ...overrides,
  };
}

function makeShadowResult(
  documents: PdfDecisionShadowDocument[],
): PdfDecisionShadowEvaluationResult {
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

describe("pdf decision outcome dataset service", () => {
  it("returns an empty dataset", async () => {
    const dataset = await buildPdfDecisionOutcomeDataset(
      { limit: 10 },
      { evaluateShadow: async () => makeShadowResult([]) },
    );

    expect(dataset.version).toBe("pdf-decision-outcome-dataset-v1");
    expect(dataset.recordCount).toBe(0);
    expect(dataset.records).toEqual([]);
  });

  it("maps shadow documents to compact feature and label records", async () => {
    const dataset = await buildPdfDecisionOutcomeDataset(
      { limit: 1 },
      {
        evaluateShadow: async () =>
          makeShadowResult([
            makeDocument({
              parserRiskReasons: ["Weak text layer"],
              extractionWarnings: ["Noisy table"],
              manualReviewReasons: ["Blocking validation errors"],
              blockingRuleCodes: ["BS_TOTAL_BALANCES"],
              warningRuleCodes: ["LOW_CONFIDENCE"],
              latestReviewDecisionType: "CORRECTED",
              outcome: "MANUAL_REVIEW_CORRECTED",
              goldSet: {
                status: "APPROVED",
                reason: "BALANCE_MISMATCH",
              },
            }),
          ]),
      },
    );

    expect(dataset.records[0]).toMatchObject({
      filingId: "filing-1",
      features: {
        decisionRoute: "TEXT_LAYER",
        riskLevel: "LOW",
        confidenceScore: 0.88,
        ruleConfigVersion: "pdf-decision-rules-v1",
        parserRiskReasonCount: 1,
        extractionWarningCount: 1,
        manualReviewReasonCount: 1,
        blockingRuleCount: 1,
        warningRuleCount: 1,
        hasGoldSet: true,
        goldSetStatus: "APPROVED",
        trainingLabelCount: 2,
        reviewedFactCount: 3,
      },
      labels: {
        outcome: "MANUAL_REVIEW_CORRECTED",
        corrected: true,
        published: false,
      },
      diagnostics: {
        blockingRuleCodes: ["BS_TOTAL_BALANCES"],
        parserRiskReasons: ["Weak text layer"],
      },
    });
  });

  it("derives unreadable, reprocess, published and failed labels", async () => {
    const dataset = await buildPdfDecisionOutcomeDataset(
      {},
      {
        evaluateShadow: async () =>
          makeShadowResult([
            makeDocument({ filingId: "published", outcome: "PUBLISHED" }),
            makeDocument({ filingId: "unreadable", outcome: "MANUAL_REVIEW_UNREADABLE" }),
            makeDocument({ filingId: "reprocess", outcome: "REPROCESS_REQUESTED" }),
            makeDocument({ filingId: "failed", outcome: "FAILED" }),
          ]),
      },
    );

    const byId = new Map(dataset.records.map((record) => [record.filingId, record]));
    expect(byId.get("published")?.labels.published).toBe(true);
    expect(byId.get("unreadable")?.labels.unreadable).toBe(true);
    expect(byId.get("reprocess")?.labels.reprocessRequested).toBe(true);
    expect(byId.get("failed")?.labels.failed).toBe(true);
  });

  it("serializes JSONL as one JSON object per line", async () => {
    const dataset = await buildPdfDecisionOutcomeDataset(
      {},
      {
        evaluateShadow: async () =>
          makeShadowResult([
            makeDocument({ filingId: "f1" }),
            makeDocument({ filingId: "f2" }),
          ]),
      },
    );

    const lines = serializePdfDecisionOutcomeDatasetJsonl(dataset).split("\n");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).filingId).toBe("f1");
    expect(JSON.parse(lines[1]).filingId).toBe("f2");
  });

  it("does not include raw text fields when includeText is false", async () => {
    const dataset = await buildPdfDecisionOutcomeDataset(
      { includeText: false },
      { evaluateShadow: async () => makeShadowResult([makeDocument()]) },
    );

    const serialized = JSON.stringify(dataset);
    expect(serialized).not.toMatch(/rawText|normalizedText|fullText|pdfBuffer/i);
  });

  it("rejects malformed records", () => {
    expect(() =>
      validatePdfDecisionOutcomeDatasetRecord({
        version: "pdf-decision-outcome-dataset-v1",
        filingId: "",
        features: {},
        labels: {},
        diagnostics: {},
      }),
    ).toThrow(PdfDecisionOutcomeDatasetValidationError);

    expect(() =>
      validatePdfDecisionOutcomeDatasetRecord({
        version: "pdf-decision-outcome-dataset-v1",
        filingId: "filing-1",
        features: {
          parserRiskReasonCount: "bad",
        },
        labels: {},
        diagnostics: {},
      }),
    ).toThrow("parserRiskReasonCount");
  });
});
