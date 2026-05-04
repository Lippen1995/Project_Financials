import { describe, expect, it } from "vitest";

import type {
  PdfDecisionShadowDocument,
  PdfDecisionShadowEvaluationResult,
} from "./annual-report-pdf-decision-shadow-evaluation";
import type {
  PdfParserFailureCluster,
  PdfParserFailureClusteringResult,
} from "./pdf-parser-failure-clustering-service";
import type { PdfParserRemediationReport } from "./pdf-parser-remediation-report-service";
import {
  evaluatePdfOcrOdlRouteCandidates,
  validatePdfOcrOdlRouteEvaluationResult,
  type PdfOcrOdlRouteEvaluationResult,
} from "./pdf-ocr-odl-route-evaluation-service";

function makeDoc(overrides: Partial<PdfDecisionShadowDocument> = {}): PdfDecisionShadowDocument {
  return {
    filingId: "filing-1",
    extractionRunId: "run-1",
    orgNumber: "999999999",
    fiscalYear: 2024,
    decisionPhase: "post_validation",
    ruleConfigVersion: "pdf-decision-rules-v1",
    decisionRoute: "TEXT_LAYER",
    riskLevel: "LOW",
    confidenceScore: 0.86,
    manualReviewReasons: [],
    reasons: [],
    qualityRisk: "LOW",
    recommendedRouteHint: null,
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

function makeShadow(docs: PdfDecisionShadowDocument[]): PdfDecisionShadowEvaluationResult {
  return {
    version: "pdf-decision-shadow-evaluation-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    input: { limit: docs.length || 100 },
    documents: docs,
    metrics: {
      totalDocuments: docs.length,
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

function makeCluster(
  overrides: Partial<PdfParserFailureCluster> = {},
): PdfParserFailureCluster {
  return {
    clusterId: "parser_risk:reading_order",
    kind: "READING_ORDER",
    severity: "MEDIUM",
    label: "READING ORDER: reading order",
    description: "Reading order issue",
    documentCount: 1,
    affectedOrgCount: 1,
    affectedFiscalYears: [2024],
    routeDistribution: {},
    riskDistribution: {},
    outcomeDistribution: {},
    topBlockingRuleCodes: [],
    topParserRiskReasons: [{ reason: "reading order", count: 1 }],
    topManualReviewReasons: [],
    likelyFixArea: "TEXT_LAYER",
    suggestedNextAction: "INVESTIGATE_PARSER",
    examples: [
      {
        filingId: "filing-1",
        blockingRuleCodes: [],
        parserRiskReasons: ["reading order"],
        manualReviewReasons: [],
      },
    ],
    ...overrides,
  };
}

function makeClusterResult(clusters: PdfParserFailureCluster[]): PdfParserFailureClusteringResult {
  return {
    version: "pdf-parser-failure-clustering-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    input: { limit: 100, maxExamplesPerCluster: 10 },
    totalDocuments: clusters.reduce((sum, cluster) => sum + cluster.documentCount, 0),
    clusterCount: clusters.length,
    clusters,
  };
}

function makeRemediation(workstreams: string[] = []): PdfParserRemediationReport {
  return {
    version: "pdf-parser-remediation-report-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    input: { limit: 100, maxExamplesPerCluster: 10 },
    sourceClusterCount: workstreams.length,
    totalDocuments: workstreams.length,
    itemCount: workstreams.length,
    workstreamSummary: {
      PAGE_HINTS: 0,
      SECTION_SEGMENTATION: 0,
      VALIDATION_RULES: 0,
      TEXT_LAYER: 0,
      OCR_ODL_ROUTING: 0,
      REVIEW_LABELING: 0,
      GOLD_SET_CURATION: 0,
      RULE_TUNING: 0,
    },
    prioritySummary: { P0: 0, P1: 0, P2: 0, P3: 0 },
    items: workstreams.map((workstream) => ({
      id: `remediation:${workstream.toLowerCase()}`,
      workstream: workstream as never,
      priority: "P2",
      title: workstream,
      description: workstream,
      clusterIds: ["parser_risk:reading_order"],
      documentCount: 1,
      affectedOrgCount: 1,
      affectedFiscalYears: [2024],
      expectedImpact: "MEDIUM",
      recommendedAction: "INVESTIGATE_TEXT_LAYER",
      evidence: [
        {
          clusterId: "parser_risk:reading_order",
          label: "Reading order",
          severity: "MEDIUM",
          documentCount: 1,
          exampleFilingIds: ["filing-1"],
        },
      ],
      suggestedOwner: "PARSER",
    })),
  };
}

async function run(
  docs: PdfDecisionShadowDocument[],
  options?: {
    clusters?: PdfParserFailureCluster[];
    remediationWorkstreams?: string[];
    includeLowPriority?: boolean;
  },
) {
  return evaluatePdfOcrOdlRouteCandidates(
    { limit: 100, includeLowPriority: options?.includeLowPriority },
    {
      evaluateShadow: async () => makeShadow(docs),
      clusterFailures: async () => makeClusterResult(options?.clusters ?? []),
      buildRemediationReport: async () => makeRemediation(options?.remediationWorkstreams ?? []),
    },
  );
}

describe("pdf OCR/ODL route evaluation service", () => {
  it("returns zero items for empty input", async () => {
    const result = await run([]);

    expect(result.summary.totalDocuments).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("recommends TEXT_LAYER for reliable published text-layer documents when low priority is included", async () => {
    const result = await run([makeDoc()], { includeLowPriority: true });

    expect(result.items[0]).toMatchObject({
      recommendedRoute: "TEXT_LAYER",
      recommendationStrength: "MEDIUM",
      shouldSampleForOcrOdl: true,
    });
  });

  it("recommends OCR for image-only or low-density documents", async () => {
    const result = await run([
      makeDoc({
        confidenceScore: 0.2,
        qualityRisk: "HIGH",
        outcome: "FAILED",
        parserRiskReasons: ["image only low text density"],
        manualReviewReasons: ["scanned image only"],
      }),
    ]);

    expect(result.items[0].recommendedRoute).toBe("OCR");
    expect(result.items[0].signals).toContain("IMAGE_ONLY_OR_LOW_TEXT_DENSITY");
    expect(result.items[0].shouldSampleForOcrOdl).toBe(true);
  });

  it("recommends OpenDataLoader for suspicious reading-order or structure issues", async () => {
    const result = await run(
      [
        makeDoc({
          confidenceScore: 0.62,
          outcome: "MANUAL_REVIEW_PENDING",
          parserRiskReasons: ["suspicious reading order in tables"],
        }),
      ],
      { clusters: [makeCluster()] },
    );

    expect(result.items[0].recommendedRoute).toBe("OPENDATALOADER_LOCAL");
    expect(result.items[0].signals).toContain("SUSPICIOUS_READING_ORDER");
  });

  it("recommends HYBRID for mixed parser risk plus manual correction", async () => {
    const result = await run(
      [
        makeDoc({
          confidenceScore: 0.4,
          outcome: "MANUAL_REVIEW_CORRECTED",
          latestReviewDecisionType: "CORRECTED",
          parserRiskReasons: ["parser table segmentation risk"],
        }),
      ],
      { remediationWorkstreams: ["TEXT_LAYER"] },
    );

    expect(result.items[0].recommendedRoute).toBe("HYBRID");
    expect(result.items[0].recommendationStrength).toBe("HIGH");
  });

  it("routes unreadable high-risk failures toward manual review or OCR depending signals", async () => {
    const result = await run([
      makeDoc({
        confidenceScore: 0.1,
        riskLevel: "HIGH",
        qualityRisk: "HIGH",
        outcome: "MANUAL_REVIEW_UNREADABLE",
        latestReviewDecisionType: "UNREADABLE",
      }),
    ]);

    expect(["MANUAL_REVIEW", "OCR"]).toContain(result.items[0].recommendedRoute);
    expect(result.items[0].signals).toContain("UNREADABLE");
  });

  it("increases manual review and hybrid scores for validation blockers", async () => {
    const result = await run([
      makeDoc({
        confidenceScore: 0.5,
        outcome: "MANUAL_REVIEW_PENDING",
        blockingRuleCodes: ["BS_TOTAL_BALANCES"],
      }),
    ]);

    expect(result.items[0].signals).toContain("VALIDATION_BLOCKER");
    expect(result.items[0].routeScores.MANUAL_REVIEW).toBeGreaterThanOrEqual(20);
    expect(result.items[0].routeScores.HYBRID).toBeGreaterThanOrEqual(25);
  });

  it("uses deterministic route tie-breaking", async () => {
    const doc = makeDoc({
      confidenceScore: 0.4,
      outcome: "FAILED",
      parserRiskReasons: ["image only low text density", "suspicious reading order"],
    });
    const first = await run([doc]);
    const second = await run([doc]);

    expect(second.items[0].recommendedRoute).toBe(first.items[0].recommendedRoute);
    expect(second.items[0].routeScores).toEqual(first.items[0].routeScores);
  });

  it("samples only relevant medium/high OCR, ODL, HYBRID, or manual OCR/ODL candidates", async () => {
    const result = await run([
      makeDoc({ filingId: "stable" }),
      makeDoc({
        filingId: "ocr",
        confidenceScore: 0.2,
        qualityRisk: "HIGH",
        outcome: "FAILED",
        parserRiskReasons: ["image only low text density"],
      }),
    ]);

    expect(result.items.some((item) => item.filingId === "stable")).toBe(false);
    expect(result.items.find((item) => item.filingId === "ocr")?.shouldSampleForOcrOdl).toBe(true);
  });

  it("clamps sample priority to 0-100", async () => {
    const result = await run(
      [
        makeDoc({
          confidenceScore: 0.05,
          riskLevel: "HIGH",
          qualityRisk: "HIGH",
          outcome: "MANUAL_REVIEW_UNREADABLE",
          latestReviewDecisionType: "UNREADABLE",
          parserRiskReasons: ["image only low text density", "reading order", "parser risk"],
          blockingRuleCodes: ["BS_TOTAL_BALANCES"],
          goldSet: {
            status: "APPROVED",
            reason: "UNREADABLE",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ],
      { clusters: [makeCluster()], remediationWorkstreams: ["OCR_ODL_ROUTING", "TEXT_LAYER"] },
    );

    expect(result.items[0].samplePriority).toBeLessThanOrEqual(100);
    expect(result.items[0].samplePriority).toBeGreaterThanOrEqual(0);
  });

  it("validation catches NaN route scores", async () => {
    const result = await run([makeDoc({ parserRiskReasons: ["image only"] })]);
    const malformed: PdfOcrOdlRouteEvaluationResult = {
      ...result,
      items: [
        {
          ...result.items[0],
          routeScores: { ...result.items[0].routeScores, OCR: Number.NaN },
        },
      ],
    };

    expect(validatePdfOcrOdlRouteEvaluationResult(malformed).valid).toBe(false);
  });

  it("output is JSON-safe and contains no raw text fields", async () => {
    const result = await run([makeDoc({ parserRiskReasons: ["image only"] })]);
    const validation = validatePdfOcrOdlRouteEvaluationResult(result);

    expect(validation.valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain("rawText");
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
