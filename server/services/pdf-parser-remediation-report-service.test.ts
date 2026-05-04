import { describe, expect, it } from "vitest";

import type {
  PdfParserFailureCluster,
  PdfParserFailureClusteringResult,
} from "./pdf-parser-failure-clustering-service";
import { buildPdfParserRemediationReport } from "./pdf-parser-remediation-report-service";

function makeCluster(
  overrides: Partial<PdfParserFailureCluster> = {},
): PdfParserFailureCluster {
  return {
    clusterId: "validation_blocker:balance_mismatch",
    kind: "VALIDATION_BLOCKER",
    severity: "HIGH",
    label: "VALIDATION BLOCKER: balance mismatch",
    description: "Validation blocker",
    documentCount: 4,
    affectedOrgCount: 3,
    affectedFiscalYears: [2023, 2024],
    routeDistribution: { TEXT_LAYER: 4 },
    riskDistribution: { HIGH: 4 },
    outcomeDistribution: { MANUAL_REVIEW_CORRECTED: 2, FAILED: 2 },
    topBlockingRuleCodes: [{ code: "BS_TOTAL_BALANCES", count: 4 }],
    topParserRiskReasons: [],
    topManualReviewReasons: [],
    likelyFixArea: "VALIDATION_RULES",
    suggestedNextAction: "IMPROVE_VALIDATION",
    examples: [
      {
        filingId: "filing-1",
        blockingRuleCodes: ["BS_TOTAL_BALANCES"],
        parserRiskReasons: [],
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
    input: { limit: 100, maxExamplesPerCluster: 5 },
    totalDocuments: clusters.reduce((sum, cluster) => sum + cluster.documentCount, 0),
    clusterCount: clusters.length,
    clusters,
  };
}

async function run(clusters: PdfParserFailureCluster[]) {
  return buildPdfParserRemediationReport(
    { limit: 100, maxExamplesPerCluster: 5 },
    { clusterFailures: async () => makeClusterResult(clusters) },
  );
}

describe("pdf parser remediation report service", () => {
  it("returns zero items for empty clusters", async () => {
    const report = await run([]);

    expect(report.itemCount).toBe(0);
    expect(report.sourceClusterCount).toBe(0);
    expect(report.items).toEqual([]);
  });

  it("maps validation blocker clusters to validation workstream", async () => {
    const report = await run([makeCluster()]);

    expect(report.items[0]).toMatchObject({
      workstream: "VALIDATION_RULES",
      recommendedAction: "IMPROVE_VALIDATION_RULE",
      suggestedOwner: "VALIDATION",
      priority: "P1",
    });
  });

  it("maps page hints and missing sections to parser workstreams", async () => {
    const report = await run([
      makeCluster({
        clusterId: "weak_page_hints:weak_page_hints",
        kind: "WEAK_PAGE_HINTS",
        severity: "MEDIUM",
        likelyFixArea: "PAGE_HINTS",
        suggestedNextAction: "IMPROVE_SECTION_SEGMENTATION",
      }),
      makeCluster({
        clusterId: "missing_financial_sections:missing_financial_sections",
        kind: "MISSING_FINANCIAL_SECTIONS",
        severity: "HIGH",
        likelyFixArea: "SECTION_SEGMENTATION",
        suggestedNextAction: "IMPROVE_SECTION_SEGMENTATION",
      }),
    ]);

    expect(report.items.some((item) => item.workstream === "PAGE_HINTS")).toBe(true);
    expect(report.items.some((item) => item.workstream === "SECTION_SEGMENTATION")).toBe(true);
  });

  it("maps unreadable and OCR candidates to OCR/ODL routing", async () => {
    const report = await run([
      makeCluster({
        clusterId: "unreadable:unreadable",
        kind: "UNREADABLE",
        severity: "CRITICAL",
        likelyFixArea: "OCR_ODL_ROUTING",
        suggestedNextAction: "EVALUATE_OCR_ODL",
        documentCount: 12,
      }),
    ]);

    expect(report.items[0]).toMatchObject({
      workstream: "OCR_ODL_ROUTING",
      priority: "P0",
      expectedImpact: "HIGH",
      recommendedAction: "EVALUATE_OCR_ODL_ROUTE",
    });
  });

  it("assigns priorities deterministically", async () => {
    const report = await run([
      makeCluster({ clusterId: "critical", severity: "CRITICAL", documentCount: 1 }),
      makeCluster({ clusterId: "high", severity: "HIGH", documentCount: 1, likelyFixArea: "SECTION_SEGMENTATION" }),
      makeCluster({ clusterId: "medium", severity: "MEDIUM", documentCount: 1, likelyFixArea: "TEXT_LAYER" }),
      makeCluster({ clusterId: "low", severity: "LOW", documentCount: 1, likelyFixArea: "UNKNOWN" }),
    ]);

    expect(report.prioritySummary.P0).toBeGreaterThan(0);
    expect(report.prioritySummary.P1).toBeGreaterThan(0);
    expect(report.prioritySummary.P2).toBeGreaterThan(0);
    expect(report.prioritySummary.P3).toBeGreaterThan(0);
  });

  it("computes summaries and sorts by priority then document count", async () => {
    const report = await run([
      makeCluster({ clusterId: "text", severity: "MEDIUM", likelyFixArea: "TEXT_LAYER", documentCount: 2 }),
      makeCluster({ clusterId: "validation", severity: "HIGH", likelyFixArea: "VALIDATION_RULES", documentCount: 1 }),
    ]);

    expect(report.workstreamSummary.TEXT_LAYER).toBe(1);
    expect(report.workstreamSummary.VALIDATION_RULES).toBe(1);
    expect(report.items[0].priority).toBe("P1");
    expect(report.items[1].priority).toBe("P2");
  });

  it("includes evidence with cluster labels and examples", async () => {
    const report = await run([
      makeCluster({
        clusterId: "parser_risk:reading_order",
        label: "READING ORDER: reading order",
        examples: [
          {
            filingId: "filing-a",
            blockingRuleCodes: [],
            parserRiskReasons: ["Reading order"],
            manualReviewReasons: [],
          },
          {
            filingId: "filing-b",
            blockingRuleCodes: [],
            parserRiskReasons: ["Reading order"],
            manualReviewReasons: [],
          },
        ],
      }),
    ]);

    expect(report.items[0].evidence[0]).toMatchObject({
      clusterId: "parser_risk:reading_order",
      label: "READING ORDER: reading order",
      exampleFilingIds: ["filing-a", "filing-b"],
    });
    expect(() => JSON.stringify(report)).not.toThrow();
  });
});
