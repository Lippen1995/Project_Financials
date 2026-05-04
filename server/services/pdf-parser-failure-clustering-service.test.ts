import { describe, expect, it } from "vitest";

import type {
  PdfDecisionShadowDocument,
  PdfDecisionShadowEvaluationResult,
} from "./annual-report-pdf-decision-shadow-evaluation";
import {
  clusterPdfParserFailures,
  serializePdfParserFailureClusteringResult,
  validatePdfParserFailureClusteringResult,
  type PdfParserFailureClusteringResult,
} from "./pdf-parser-failure-clustering-service";

function makeDocument(
  overrides: Partial<PdfDecisionShadowDocument> = {},
): PdfDecisionShadowDocument {
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
    reasons: [],
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

async function run(documents: PdfDecisionShadowDocument[], maxExamplesPerCluster = 5) {
  return clusterPdfParserFailures(
    { limit: 100, maxExamplesPerCluster },
    { evaluateShadow: async () => makeShadowResult(documents) },
  );
}

describe("pdf parser failure clustering service", () => {
  it("returns zero clusters for empty input", async () => {
    const result = await run([]);

    expect(result.totalDocuments).toBe(0);
    expect(result.clusterCount).toBe(0);
    expect(result.clusters).toEqual([]);
  });

  it("clusters validation blockers by blocking rule", async () => {
    const result = await run([
      makeDocument({ blockingRuleCodes: ["INCOME_MISMATCH"], outcome: "MANUAL_REVIEW_PENDING" }),
      makeDocument({ filingId: "filing-2", blockingRuleCodes: ["INCOME_MISMATCH"] }),
    ]);

    expect(result.clusters[0]).toMatchObject({
      clusterId: "validation_blocker:income_mismatch",
      kind: "VALIDATION_BLOCKER",
      likelyFixArea: "VALIDATION_RULES",
      suggestedNextAction: "IMPROVE_VALIDATION",
      documentCount: 2,
    });
    expect(result.clusters[0].topBlockingRuleCodes[0]).toEqual({
      code: "INCOME_MISMATCH",
      count: 2,
    });
  });

  it("maps balance mismatch to validation rules", async () => {
    const result = await run([
      makeDocument({ blockingRuleCodes: ["BS_TOTAL_BALANCES"], outcome: "MANUAL_REVIEW_CORRECTED" }),
    ]);

    expect(result.clusters[0].clusterId).toBe("validation_blocker:balance_mismatch");
    expect(result.clusters[0].likelyFixArea).toBe("VALIDATION_RULES");
    expect(result.clusters[0].suggestedNextAction).toBe("IMPROVE_VALIDATION");
  });

  it("maps weak page hints and missing sections", async () => {
    const result = await run([
      makeDocument({ filingId: "weak", manualReviewReasons: ["Weak page hints detected"] }),
      makeDocument({ filingId: "missing", manualReviewReasons: ["No financial statement sections detected"] }),
    ]);

    const weak = result.clusters.find((cluster) => cluster.kind === "WEAK_PAGE_HINTS");
    const missing = result.clusters.find((cluster) => cluster.kind === "MISSING_FINANCIAL_SECTIONS");
    expect(weak?.likelyFixArea).toBe("PAGE_HINTS");
    expect(weak?.suggestedNextAction).toBe("IMPROVE_SECTION_SEGMENTATION");
    expect(missing?.likelyFixArea).toBe("SECTION_SEGMENTATION");
    expect(missing?.suggestedNextAction).toBe("IMPROVE_SECTION_SEGMENTATION");
  });

  it("maps unreadable and reprocess to high-priority parser work", async () => {
    const result = await run([
      makeDocument({ filingId: "u", outcome: "MANUAL_REVIEW_UNREADABLE" }),
      makeDocument({ filingId: "r", latestReviewDecisionType: "REPROCESS_REQUESTED" }),
    ]);

    const unreadable = result.clusters.find((cluster) => cluster.kind === "UNREADABLE");
    const reprocess = result.clusters.find((cluster) => cluster.kind === "REPROCESS");
    expect(unreadable?.likelyFixArea).toBe("OCR_ODL_ROUTING");
    expect(unreadable?.suggestedNextAction).toBe("EVALUATE_OCR_ODL");
    expect(reprocess?.severity).toBe("HIGH");
  });

  it("aggregates repeated parser risk and caps examples", async () => {
    const result = await run(
      Array.from({ length: 4 }, (_, index) =>
        makeDocument({
          filingId: `f-${index}`,
          parserRiskReasons: ["Suspicious table density"],
          decisionRoute: index % 2 === 0 ? "TEXT_LAYER" : "FORCE_OCR",
          riskLevel: index % 2 === 0 ? "MEDIUM" : "HIGH",
          outcome: index % 2 === 0 ? "PUBLISHED" : "FAILED",
        }),
      ),
      2,
    );

    const cluster = result.clusters[0];
    expect(cluster.clusterId).toBe("parser_risk:suspicious_table_density");
    expect(cluster.documentCount).toBe(4);
    expect(cluster.examples).toHaveLength(2);
    expect(cluster.routeDistribution).toMatchObject({ TEXT_LAYER: 2, FORCE_OCR: 2 });
    expect(cluster.riskDistribution).toMatchObject({ MEDIUM: 2, HIGH: 2 });
    expect(cluster.outcomeDistribution).toMatchObject({ PUBLISHED: 2, FAILED: 2 });
    expect(cluster.topParserRiskReasons[0]).toEqual({
      reason: "Suspicious table density",
      count: 4,
    });
  });

  it("normalizes deterministic cluster IDs", async () => {
    const result = await run([
      makeDocument({ parserRiskReasons: ["  Odd punctuation: tables/pages!!!  "] }),
    ]);

    expect(result.clusters[0].clusterId).toBe("parser_risk:odd_punctuation_tables_pages");
  });

  it("clusters low confidence and OCR/ODL candidates", async () => {
    const result = await run([
      makeDocument({ filingId: "low", confidenceScore: 0.2 }),
      makeDocument({ filingId: "ocr", decisionRoute: "OPENDATALOADER_HYBRID", qualityRisk: "HIGH" }),
    ]);

    expect(result.clusters.some((cluster) => cluster.kind === "LOW_CONFIDENCE")).toBe(true);
    expect(result.clusters.find((cluster) => cluster.kind === "OCR_ODL_CANDIDATE")?.suggestedNextAction).toBe(
      "EVALUATE_OCR_ODL",
    );
  });

  it("validates malformed results", async () => {
    const result = await run([makeDocument()]);
    const malformed: PdfParserFailureClusteringResult = {
      ...result,
      clusters: [
        {
          ...result.clusters[0],
          clusterId: "",
          documentCount: 0,
          examples: result.clusters[0].examples,
        },
      ],
    };

    const validation = validatePdfParserFailureClusteringResult(malformed);

    expect(validation.valid).toBe(false);
    expect(validation.issues.join(" ")).toContain("clusterId");
    expect(validation.issues.join(" ")).toContain("documentCount");
  });

  it("is JSON-safe", async () => {
    const result = await run([makeDocument()]);

    expect(() => JSON.stringify(result)).not.toThrow();
    expect(() => JSON.parse(serializePdfParserFailureClusteringResult(result))).not.toThrow();
    expect(validatePdfParserFailureClusteringResult(result)).toEqual({ valid: true, issues: [] });
  });
});
