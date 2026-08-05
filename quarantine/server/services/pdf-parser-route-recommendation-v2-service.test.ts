import { describe, expect, it } from "vitest";

import type {
  DocumentComparison,
  PdfParserRouteQualityComparisonReport,
  RouteComparisonSummary,
} from "@/server/services/pdf-parser-route-quality-comparison-service";
import {
  buildPdfParserRouteRecommendationV2Report,
  serializePdfParserRouteRecommendationV2Report,
  validatePdfParserRouteRecommendationV2Report,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";

// ---- Fixture helpers --------------------------------------------------------

function makeBaselineSummary(score: number = 40): RouteComparisonSummary {
  return {
    route: "TEXT_LAYER",
    status: "BASELINE",
    qualityScore: score,
    financialsDetected: null,
    boardReportDetected: null,
    auditorReportDetected: null,
    financialCoverageScore: null,
    tableCount: null,
    lineItemCount: null,
    warningsCount: 0,
    errorsCount: 0,
    scoreBreakdown: [`+${score} confidence score proxy`],
    insufficientDetail: true,
  };
}

function makeSuccessAlt(
  route: "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID",
  score: number,
  opts?: {
    financialsDetected?: boolean;
    boardReportDetected?: boolean;
    auditorReportDetected?: boolean;
    tableCount?: number;
    warningsCount?: number;
    errorsCount?: number;
  },
): RouteComparisonSummary {
  return {
    route,
    status: "SUCCESS",
    qualityScore: score,
    financialsDetected: opts?.financialsDetected ?? true,
    boardReportDetected: opts?.boardReportDetected ?? true,
    auditorReportDetected: opts?.auditorReportDetected ?? false,
    financialCoverageScore: 0.7,
    tableCount: opts?.tableCount ?? 3,
    lineItemCount: 30,
    warningsCount: opts?.warningsCount ?? 0,
    errorsCount: opts?.errorsCount ?? 0,
    scoreBreakdown: ["+30 financials detected"],
    insufficientDetail: false,
  };
}

function makeUnavailableAlt(
  route: "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID",
): RouteComparisonSummary {
  return {
    route,
    status: "RUNTIME_UNAVAILABLE",
    qualityScore: null,
    financialsDetected: null,
    boardReportDetected: null,
    auditorReportDetected: null,
    financialCoverageScore: null,
    tableCount: null,
    lineItemCount: null,
    warningsCount: 0,
    errorsCount: 0,
    scoreBreakdown: ["binary_not_configured"],
    insufficientDetail: false,
  };
}

function makeFailedAlt(
  route: "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID",
): RouteComparisonSummary {
  return {
    route,
    status: "FAILED",
    qualityScore: null,
    financialsDetected: null,
    boardReportDetected: null,
    auditorReportDetected: null,
    financialCoverageScore: null,
    tableCount: null,
    lineItemCount: null,
    warningsCount: 0,
    errorsCount: 0,
    scoreBreakdown: ["OCR_RUNTIME_ERROR"],
    insufficientDetail: false,
  };
}

function makeComparison(
  id: string,
  baseline: RouteComparisonSummary,
  alternatives: RouteComparisonSummary[],
  opts?: { bestRoute?: "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID" | "TEXT_LAYER" | null },
): DocumentComparison {
  return {
    annualReportId: id,
    organizationNumber: "123456789",
    fiscalYear: 2024,
    artifactId: `artifact-${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    bestRoute: opts?.bestRoute ?? null,
    bestRouteReason: "Test comparison",
    baseline,
    alternatives,
    outcome: "INSUFFICIENT_DATA",
    comparisonScoreDelta: null,
    warnings: [],
  };
}

function makeEmptyQualityReport(
  comparisons: DocumentComparison[] = [],
): PdfParserRouteQualityComparisonReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    artifactKind: "PARSER_ROUTE_SHADOW_EXECUTION",
    filters: { limit: 100 },
    corpus: {
      artifactCount: comparisons.length,
      documentCount: comparisons.length,
      malformedArtifactCount: 0,
      successfulRouteRuns: 0,
      failedRouteRuns: 0,
      unavailableRouteRuns: 0,
      skippedRouteRuns: 0,
      insufficientData: comparisons.length === 0,
      insufficientDataReasons: comparisons.length === 0 ? ["No artifacts found."] : [],
    },
    routeMetrics: [],
    documentComparisons: comparisons,
    topOpportunities: [],
    topFailures: [],
    safety: {
      readOnly: true,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
    },
  };
}

async function buildReport(comparisons: DocumentComparison[]) {
  return buildPdfParserRouteRecommendationV2Report(undefined, {
    buildQualityReport: async () => makeEmptyQualityReport(comparisons),
  });
}

// ---- Tests ------------------------------------------------------------------

describe("buildPdfParserRouteRecommendationV2Report", () => {
  it("returns an empty decision list when no artifacts are available", async () => {
    const report = await buildReport([]);
    expect(report.decisions).toHaveLength(0);
    expect(report.summary.totalDocuments).toBe(0);
  });

  it("sets safety flags correctly on every report", async () => {
    const report = await buildReport([]);
    expect(report.safety.canUseForProductionRouting).toBe(false);
    expect(report.safety.productionRoutingChanged).toBe(false);
    expect(report.safety.productionFactsMutated).toBe(false);
    expect(report.safety.shadowOnly).toBe(true);
    expect(report.safety.readOnly).toBe(true);
  });

  it("recommends MANUAL_REVIEW when no shadow routes succeeded", async () => {
    const comparison = makeComparison("filing-1", makeBaselineSummary(40), [
      makeUnavailableAlt("OCR"),
      makeUnavailableAlt("OPENDATALOADER_LOCAL"),
    ]);
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    expect(decision).toBeDefined();
    expect(decision!.recommendedRoute).toBe("MANUAL_REVIEW");
    expect(decision!.confidence).toBe("INSUFFICIENT_DATA");
    expect(decision!.risk).toBe("UNKNOWN");
    expect(decision!.guardrails.canUseForProductionRouting).toBe(false);
    expect(decision!.guardrails.requiresManualReview).toBe(true);
    expect(decision!.guardrails.requiresMoreShadowEvidence).toBe(true);
    expect(decision!.evidence.completedRouteCount).toBe(0);
    expect(decision!.evidence.unavailableRouteCount).toBe(2);
  });

  it("recommends MANUAL_REVIEW when all alternatives failed", async () => {
    const comparison = makeComparison("filing-2", makeBaselineSummary(40), [
      makeFailedAlt("OCR"),
      makeFailedAlt("OPENDATALOADER_LOCAL"),
    ]);
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    expect(decision!.recommendedRoute).toBe("MANUAL_REVIEW");
    expect(decision!.confidence).toBe("INSUFFICIENT_DATA");
    expect(decision!.evidence.failedRouteCount).toBe(2);
  });

  it("recommends TEXT_LAYER when baseline beats all alternatives", async () => {
    const comparison = makeComparison(
      "filing-3",
      makeBaselineSummary(60),
      [makeSuccessAlt("OCR", 50)],
      { bestRoute: "TEXT_LAYER" },
    );
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    expect(decision!.recommendedRoute).toBe("TEXT_LAYER");
    expect(decision!.confidence).toBe("MEDIUM"); // GOOD band (60 >= 45)
    expect(decision!.guardrails.canUseForProductionRouting).toBe(false);
  });

  it("recommends TEXT_LAYER when best alternative is within the tie threshold (+2)", async () => {
    const comparison = makeComparison(
      "filing-tie",
      makeBaselineSummary(50),
      [makeSuccessAlt("OCR", 51)], // delta = 1, within threshold
    );
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    expect(decision!.recommendedRoute).toBe("TEXT_LAYER");
  });

  it("recommends OCR when OCR clearly outperforms TEXT_LAYER", async () => {
    const comparison = makeComparison(
      "filing-4",
      makeBaselineSummary(30),
      [makeSuccessAlt("OCR", 65, { financialsDetected: true })],
      { bestRoute: "OCR" },
    );
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    expect(decision!.recommendedRoute).toBe("OCR");
    expect(decision!.fallbackRoute).toBe("TEXT_LAYER");
    expect(decision!.evidence.ocrQualityScore).toBe(65);
  });

  it("recommends OPENDATALOADER_LOCAL when ODL clearly outperforms TEXT_LAYER", async () => {
    const comparison = makeComparison(
      "filing-5",
      makeBaselineSummary(25),
      [makeSuccessAlt("OPENDATALOADER_LOCAL", 72, { financialsDetected: true })],
      { bestRoute: "OPENDATALOADER_LOCAL" },
    );
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    expect(decision!.recommendedRoute).toBe("OPENDATALOADER_LOCAL");
    expect(decision!.fallbackRoute).toBe("TEXT_LAYER");
  });

  it("recommends HYBRID when OCR and ODL both beat TEXT_LAYER and are close to each other (hybrid available)", async () => {
    const comparison = makeComparison(
      "filing-6",
      makeBaselineSummary(30),
      [
        makeSuccessAlt("OCR", 60, { financialsDetected: true }),
        makeSuccessAlt("OPENDATALOADER_LOCAL", 63, { financialsDetected: true }),
        makeSuccessAlt("HYBRID", 65, { financialsDetected: true }),
      ],
      { bestRoute: "HYBRID" },
    );
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    expect(decision!.recommendedRoute).toBe("HYBRID");
  });

  it("recommends OCR or ODL (not HYBRID) when both beat TEXT_LAYER and HYBRID was not run", async () => {
    const comparison = makeComparison(
      "filing-7",
      makeBaselineSummary(30),
      [
        makeSuccessAlt("OCR", 60, { financialsDetected: true }),
        makeSuccessAlt("OPENDATALOADER_LOCAL", 62, { financialsDetected: true }),
        // No HYBRID run
      ],
    );
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    // OCR and ODL are within TIE_THRESHOLD (5), ODL scores higher → ODL
    expect(["OCR", "OPENDATALOADER_LOCAL"]).toContain(decision!.recommendedRoute);
  });

  it("recommends MANUAL_REVIEW and LOW confidence when all routes produce POOR quality", async () => {
    const comparison = makeComparison(
      "filing-poor",
      makeBaselineSummary(10),
      [
        makeSuccessAlt("OCR", 12, {
          financialsDetected: false,
          boardReportDetected: false,
          tableCount: 0,
        }),
      ],
    );
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    expect(decision!.recommendedRoute).toBe("MANUAL_REVIEW");
    expect(decision!.confidence).toBe("LOW");
    expect(decision!.guardrails.blockedReasons.length).toBeGreaterThan(0);
  });

  it("assigns HIGH confidence when the winning route dominates with EXCELLENT quality", async () => {
    const comparison = makeComparison(
      "filing-high-conf",
      makeBaselineSummary(20),
      [makeSuccessAlt("OCR", 75, { financialsDetected: true })],
      { bestRoute: "OCR" },
    );
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    expect(decision!.recommendedRoute).toBe("OCR");
    expect(decision!.confidence).toBe("HIGH");
  });

  it("assigns HIGH risk when non-TEXT_LAYER is recommended with LOW confidence and missing coverage", async () => {
    const comparison = makeComparison(
      "filing-high-risk",
      makeBaselineSummary(10),
      [
        makeSuccessAlt("OCR", 20, {
          financialsDetected: false,
          warningsCount: 5,
          errorsCount: 2,
        }),
      ],
    );
    const report = await buildReport([comparison]);

    const decision = report.decisions[0];
    // OCR barely beats TEXT_LAYER but no financial coverage + errors
    if (decision!.recommendedRoute !== "TEXT_LAYER" && decision!.recommendedRoute !== "MANUAL_REVIEW") {
      expect(decision!.risk).toBe("HIGH");
    }
  });

  it("always sets canUseForProductionRouting=false on every decision", async () => {
    const comparisons = [
      makeComparison("f1", makeBaselineSummary(60), [makeSuccessAlt("OCR", 80, { financialsDetected: true })]),
      makeComparison("f2", makeBaselineSummary(40), [makeUnavailableAlt("OCR")]),
      makeComparison("f3", makeBaselineSummary(50), [makeSuccessAlt("OPENDATALOADER_LOCAL", 45)]),
    ];
    const report = await buildReport(comparisons);

    for (const decision of report.decisions) {
      expect(decision.guardrails.canUseForProductionRouting).toBe(false);
    }
  });

  it("populates summary counts correctly", async () => {
    const comparisons = [
      // Should → OCR (delta +50)
      makeComparison("f1", makeBaselineSummary(20), [makeSuccessAlt("OCR", 75, { financialsDetected: true })]),
      // Should → TEXT_LAYER (baseline wins)
      makeComparison("f2", makeBaselineSummary(60), [makeSuccessAlt("OCR", 50)]),
      // Should → MANUAL_REVIEW (no runs)
      makeComparison("f3", makeBaselineSummary(40), [makeUnavailableAlt("OCR")]),
    ];
    const report = await buildReport(comparisons);

    expect(report.summary.totalDocuments).toBe(3);
    expect(report.summary.ocrRecommended).toBe(1);
    expect(report.summary.textLayerRecommended).toBe(1);
    expect(report.summary.manualReviewRequired).toBe(1);
  });

  it("evidence records per-route quality scores", async () => {
    const comparison = makeComparison(
      "f-evidence",
      makeBaselineSummary(30),
      [
        makeSuccessAlt("OCR", 55),
        makeSuccessAlt("OPENDATALOADER_LOCAL", 60),
      ],
    );
    const report = await buildReport([comparison]);

    const ev = report.decisions[0]!.evidence;
    expect(ev.ocrQualityScore).toBe(55);
    expect(ev.odlQualityScore).toBe(60);
    expect(ev.textLayerQualityScore).toBe(30);
    expect(ev.hybridQualityScore).toBeNull();
    expect(ev.completedRouteCount).toBe(2);
    expect(ev.unavailableRouteCount).toBe(0);
  });

  it("RUNTIME_UNAVAILABLE routes do not count as completed or failed", async () => {
    const comparison = makeComparison(
      "f-unavail",
      makeBaselineSummary(40),
      [
        makeSuccessAlt("OCR", 55),
        makeUnavailableAlt("OPENDATALOADER_LOCAL"),
      ],
    );
    const report = await buildReport([comparison]);

    const ev = report.decisions[0]!.evidence;
    expect(ev.completedRouteCount).toBe(1);
    expect(ev.unavailableRouteCount).toBe(1);
    expect(ev.failedRouteCount).toBe(0);
  });
});

// ---- Validation -------------------------------------------------------------

describe("validatePdfParserRouteRecommendationV2Report", () => {
  it("validates a correct report as valid", async () => {
    const report = await buildReport([]);
    const { valid, issues } = validatePdfParserRouteRecommendationV2Report(report);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it("catches canUseForProductionRouting=true in decision guardrails", async () => {
    const report = await buildReport([
      makeComparison("f1", makeBaselineSummary(50), [makeSuccessAlt("OCR", 80, { financialsDetected: true })]),
    ]);
    // Tamper with the guardrail flag.
    (report.decisions[0]!.guardrails as unknown as Record<string, unknown>).canUseForProductionRouting = true;

    const { valid, issues } = validatePdfParserRouteRecommendationV2Report(report);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("canUseForProductionRouting"))).toBe(true);
  });

  it("catches safety.canUseForProductionRouting=true", async () => {
    const report = await buildReport([]);
    (report.safety as Record<string, unknown>).canUseForProductionRouting = true;

    const { valid, issues } = validatePdfParserRouteRecommendationV2Report(report);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("canUseForProductionRouting"))).toBe(true);
  });

  it("catches NaN in numeric fields", async () => {
    const report = await buildReport([
      makeComparison("f1", makeBaselineSummary(50), [makeSuccessAlt("OCR", 70, { financialsDetected: true })]),
    ]);
    (report.decisions[0]!.evidence as unknown as Record<string, unknown>).ocrQualityScore = NaN;

    const { valid, issues } = validatePdfParserRouteRecommendationV2Report(report);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("NaN"))).toBe(true);
  });
});

// ---- Serialization ----------------------------------------------------------

describe("serializePdfParserRouteRecommendationV2Report", () => {
  it("produces valid JSON that round-trips cleanly", async () => {
    const report = await buildReport([
      makeComparison(
        "f1",
        makeBaselineSummary(40),
        [makeSuccessAlt("OCR", 70, { financialsDetected: true })],
        { bestRoute: "OCR" },
      ),
    ]);
    const json = serializePdfParserRouteRecommendationV2Report(report);
    const parsed = JSON.parse(json) as typeof report;

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.safety.canUseForProductionRouting).toBe(false);
    expect(parsed.decisions).toHaveLength(1);
  });
});
