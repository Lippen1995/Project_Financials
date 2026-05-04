import { describe, expect, it } from "vitest";

import type {
  PdfOcrOdlRouteEvaluationItem,
  PdfOcrOdlRouteEvaluationResult,
} from "./pdf-ocr-odl-route-evaluation-service";
import {
  buildPdfRouteRecommendationExperimentReport,
  validatePdfRouteRecommendationExperimentReport,
  type PdfRouteRecommendationExperimentReport,
} from "./pdf-route-recommendation-experiment-service";

function makeRouteItem(
  overrides: Partial<PdfOcrOdlRouteEvaluationItem> = {},
): PdfOcrOdlRouteEvaluationItem {
  return {
    filingId: "filing-1",
    extractionRunId: "run-1",
    orgNumber: "999999999",
    fiscalYear: 2024,
    currentDecisionRoute: "TEXT_LAYER",
    currentRiskLevel: "LOW",
    currentConfidenceScore: 0.88,
    currentOutcome: "PUBLISHED",
    qualityRisk: "LOW",
    recommendedRouteHint: null,
    goldSetStatus: null,
    latestReviewDecisionType: null,
    signals: ["OTHER"],
    signalDetails: ["No specific signal."],
    routeScores: {
      TEXT_LAYER: 50,
      OPENDATALOADER_LOCAL: 0,
      OCR: 0,
      HYBRID: 0,
      MANUAL_REVIEW: 0,
    },
    recommendedRoute: "TEXT_LAYER",
    recommendationStrength: "MEDIUM",
    evaluationReason: "Stable text layer.",
    shouldSampleForOcrOdl: false,
    samplePriority: 50,
    parserClusterIds: [],
    remediationWorkstreams: [],
    ...overrides,
  };
}

function makeRouteEvaluation(items: PdfOcrOdlRouteEvaluationItem[]): PdfOcrOdlRouteEvaluationResult {
  return {
    version: "pdf-ocr-odl-route-evaluation-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    input: { limit: 100, includeLowPriority: false },
    summary: {
      totalDocuments: items.length,
      sampleCandidateCount: items.filter((item) => item.shouldSampleForOcrOdl).length,
      recommendedRouteDistribution: {
        TEXT_LAYER: 0,
        OPENDATALOADER_LOCAL: 0,
        OCR: 0,
        HYBRID: 0,
        MANUAL_REVIEW: 0,
      },
      signalDistribution: {
        UNRELIABLE_TEXT_LAYER: 0,
        IMAGE_ONLY_OR_LOW_TEXT_DENSITY: 0,
        WEAK_PAGE_HINTS: 0,
        MISSING_FINANCIAL_SECTIONS: 0,
        SUSPICIOUS_READING_ORDER: 0,
        PARSER_RISK: 0,
        UNREADABLE: 0,
        REPROCESS_REQUESTED: 0,
        MANUAL_CORRECTION: 0,
        VALIDATION_BLOCKER: 0,
        LOW_CONFIDENCE: 0,
        HIGH_QUALITY_RISK: 0,
        OCR_ODL_REMEDIATION_ITEM: 0,
        GOLD_SET_FAILURE: 0,
        OTHER: 0,
      },
      strengthDistribution: {},
    },
    items,
  };
}

async function run(items: PdfOcrOdlRouteEvaluationItem[]) {
  return buildPdfRouteRecommendationExperimentReport(
    { limit: 100 },
    { evaluateRoutes: async () => makeRouteEvaluation(items) },
  );
}

describe("pdf route recommendation experiment service", () => {
  it("returns zero items for empty evaluation", async () => {
    const report = await run([]);

    expect(report.totalDocuments).toBe(0);
    expect(report.experimentCandidateCount).toBe(0);
    expect(report.items).toEqual([]);
  });

  it("maps stable TEXT_LAYER to keep text layer and no experiment", async () => {
    const report = await run([makeRouteItem()]);

    expect(report.items[0]).toMatchObject({
      experimentRecommendation: "KEEP_TEXT_LAYER",
      outcomeBand: "NO_CHANGE",
      suggestedExperiment: "NO_EXPERIMENT",
      safeToExperiment: false,
    });
  });

  it("maps OCR recommendation to shadow OCR experiment", async () => {
    const report = await run([
      makeRouteItem({
        recommendedRoute: "OCR",
        recommendationStrength: "HIGH",
        signals: ["IMAGE_ONLY_OR_LOW_TEXT_DENSITY", "UNREADABLE"],
        signalDetails: ["Image only."],
        shouldSampleForOcrOdl: true,
        samplePriority: 90,
      }),
    ]);

    expect(report.items[0]).toMatchObject({
      experimentRecommendation: "TRY_OCR",
      outcomeBand: "LIKELY_IMPROVEMENT",
      suggestedExperiment: "SHADOW_RUN_OCR",
      safeToExperiment: true,
    });
  });

  it("maps OpenDataLoader recommendation to shadow ODL experiment", async () => {
    const report = await run([
      makeRouteItem({
        recommendedRoute: "OPENDATALOADER_LOCAL",
        recommendationStrength: "MEDIUM",
        signals: ["SUSPICIOUS_READING_ORDER", "PARSER_RISK"],
        shouldSampleForOcrOdl: true,
      }),
    ]);

    expect(report.items[0]).toMatchObject({
      experimentRecommendation: "TRY_OPENDATALOADER",
      outcomeBand: "POSSIBLE_IMPROVEMENT",
      suggestedExperiment: "SHADOW_RUN_OPENDATALOADER",
      safeToExperiment: true,
    });
  });

  it("maps HYBRID recommendation to shadow hybrid experiment", async () => {
    const report = await run([
      makeRouteItem({
        recommendedRoute: "HYBRID",
        recommendationStrength: "MEDIUM",
        signals: ["PARSER_RISK", "MANUAL_CORRECTION"],
        shouldSampleForOcrOdl: true,
      }),
    ]);

    expect(report.items[0]).toMatchObject({
      experimentRecommendation: "TRY_HYBRID",
      suggestedExperiment: "SHADOW_RUN_HYBRID",
      safeToExperiment: true,
    });
  });

  it("maps manual review recommendation to manual-review required", async () => {
    const report = await run([
      makeRouteItem({
        recommendedRoute: "MANUAL_REVIEW",
        recommendationStrength: "HIGH",
        signals: ["VALIDATION_BLOCKER"],
        shouldSampleForOcrOdl: false,
      }),
    ]);

    expect(report.items[0]).toMatchObject({
      experimentRecommendation: "MANUAL_REVIEW_REQUIRED",
      suggestedExperiment: "MANUAL_REVIEW_BEFORE_ROUTE_CHANGE",
      safeToExperiment: false,
    });
  });

  it("does not mark low-strength route recommendations safe to experiment", async () => {
    const report = await run([
      makeRouteItem({
        recommendedRoute: "OCR",
        recommendationStrength: "LOW",
        signals: ["IMAGE_ONLY_OR_LOW_TEXT_DENSITY"],
        shouldSampleForOcrOdl: false,
      }),
    ]);

    expect(report.items[0].safeToExperiment).toBe(false);
  });

  it("marks medium/high OCR, ODL, and HYBRID shadow routes safe to experiment", async () => {
    const report = await run([
      makeRouteItem({ filingId: "ocr", recommendedRoute: "OCR", recommendationStrength: "MEDIUM" }),
      makeRouteItem({
        filingId: "odl",
        recommendedRoute: "OPENDATALOADER_LOCAL",
        recommendationStrength: "MEDIUM",
      }),
      makeRouteItem({ filingId: "hybrid", recommendedRoute: "HYBRID", recommendationStrength: "HIGH" }),
    ]);

    expect(report.items.every((item) => item.safeToExperiment)).toBe(true);
  });

  it("computes distributions", async () => {
    const report = await run([
      makeRouteItem({ filingId: "ocr", recommendedRoute: "OCR", recommendationStrength: "MEDIUM" }),
      makeRouteItem({ filingId: "hybrid", recommendedRoute: "HYBRID", recommendationStrength: "HIGH" }),
    ]);

    expect(report.recommendationDistribution.TRY_OCR).toBe(1);
    expect(report.recommendationDistribution.TRY_HYBRID).toBe(1);
    expect(report.outcomeBandDistribution.POSSIBLE_IMPROVEMENT).toBe(2);
    expect(report.suggestedExperimentDistribution.SHADOW_RUN_OCR).toBe(1);
  });

  it("validation catches malformed report", async () => {
    const report = await run([makeRouteItem()]);
    const malformed: PdfRouteRecommendationExperimentReport = {
      ...report,
      items: [{ ...report.items[0], samplePriority: Number.NaN }],
    };

    expect(validatePdfRouteRecommendationExperimentReport(malformed).valid).toBe(false);
  });

  it("output is JSON-safe", async () => {
    const report = await run([makeRouteItem({ recommendedRoute: "OCR", recommendationStrength: "MEDIUM" })]);
    const validation = validatePdfRouteRecommendationExperimentReport(report);

    expect(validation.valid).toBe(true);
    expect(JSON.stringify(report)).not.toContain("rawText");
    expect(() => JSON.stringify(report)).not.toThrow();
  });
});
