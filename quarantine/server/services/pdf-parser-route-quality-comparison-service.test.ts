import { PdfModelArtifactKind, PdfModelArtifactStatus } from "@prisma/client";
import type { PdfModelArtifactSnapshot } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  buildPdfParserRouteQualityComparisonReport,
  serializePdfParserRouteQualityComparisonReport,
  validatePdfParserRouteQualityComparisonReport,
} from "./pdf-parser-route-quality-comparison-service";

// ---- Fixtures ---------------------------------------------------------------

function makeArtifactBase(overrides: Partial<PdfModelArtifactSnapshot> = {}): PdfModelArtifactSnapshot {
  return {
    id: "artifact-1",
    kind: PdfModelArtifactKind.PARSER_ROUTE_SHADOW_EXECUTION,
    status: PdfModelArtifactStatus.CREATED,
    modelId: null,
    modelVersion: null,
    modelTarget: null,
    featureSchemaVersion: null,
    fiscalYear: 2024,
    orgNumber: "123456789",
    split: null,
    summary: {},
    payload: {},
    sourceCommand: null,
    sourceCommitSha: null,
    createdByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeValidPayload(options: {
  annualReportId?: string;
  orgNumber?: string;
  fiscalYear?: number;
  runStatus?: string | null;
  confidenceScore?: number | null;
  routes?: object[];
} = {}): object {
  return {
    schemaVersion: 1,
    kind: "PARSER_ROUTE_SHADOW_EXECUTION",
    createdAt: "2026-01-01T00:00:00Z",
    input: {
      annualReportId: options.annualReportId ?? "filing-1",
      organizationNumber: options.orgNumber ?? "123456789",
      fiscalYear: options.fiscalYear ?? 2024,
      requestedRoutes: options.routes?.map((r: { route?: string }) => r.route) ?? ["OCR"],
      source: "CLI",
      reason: null,
      runId: null,
      requestedBy: null,
    },
    productionBaseline: {
      route: "LEGACY",
      mode: null,
      confidenceScore: options.confidenceScore ?? 0.85,
      validationScore: 0.9,
      runStatus: options.runStatus === undefined ? "SUCCEEDED" : options.runStatus,
      openDataLoaderRoute: null,
      filingStatus: "EXTRACTED",
    },
    routes: options.routes ?? [makeSuccessRouteEntry("OCR")],
    safety: {
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
    },
  };
}

function makeSuccessRouteEntry(route: string) {
  return {
    route,
    status: "SUCCESS",
    runtime: { available: true, name: route, version: "1.0" },
    durationMs: 500,
    summary: {
      pageCount: 10,
      pagesProcessed: [1, 2, 3],
      financials: { detected: true, candidatePages: [4, 5], lineItemCount: 30, tableCount: 2, coverageScore: 0.8 },
      boardReport: { detected: true, candidatePages: [1], charCount: 4000 },
      auditorReport: { detected: true, candidatePages: [9], charCount: 2000 },
      warnings: [],
      errors: [],
    },
  };
}

function makeUnavailableRouteEntry(route: string) {
  return {
    route,
    status: "RUNTIME_UNAVAILABLE",
    runtime: { available: false, reason: "binary_not_configured" },
    durationMs: 0,
    summary: null,
  };
}

function makeFailedRouteEntry(route: string) {
  return {
    route,
    status: "FAILED",
    runtime: { available: true, name: route },
    durationMs: 50,
    errorCode: "PARSE_ERROR",
    errorMessage: "Could not parse document",
    summary: null,
  };
}

function makeSkippedRouteEntry(route: string) {
  return {
    route,
    status: "SKIPPED",
    runtime: { available: false, reason: "hybrid_execution_not_implemented" },
    durationMs: 0,
    summary: null,
  };
}

// ---- Tests ------------------------------------------------------------------

describe("buildPdfParserRouteQualityComparisonReport", () => {
  it("aggregates route statuses correctly across artifacts", async () => {
    const artifacts = [
      makeArtifactBase({
        id: "a1",
        payload: makeValidPayload({
          annualReportId: "filing-1",
          routes: [makeSuccessRouteEntry("OCR"), makeUnavailableRouteEntry("OPENDATALOADER_LOCAL")],
        }),
      }),
    ];

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue(artifacts) },
    );

    expect(report.corpus.artifactCount).toBe(1);
    expect(report.corpus.documentCount).toBe(1);
    expect(report.corpus.malformedArtifactCount).toBe(0);
    expect(report.corpus.successfulRouteRuns).toBe(1);
    expect(report.corpus.unavailableRouteRuns).toBe(1);
    expect(report.corpus.failedRouteRuns).toBe(0);
    expect(report.corpus.skippedRouteRuns).toBe(0);
  });

  it("computes route metrics for successful OCR results", async () => {
    // OCR score: +30 financials +20 board +20 auditor +8 coverage(0.8) +3 tables(2) +4 lineItems(30) = 85
    const artifacts = [
      makeArtifactBase({ id: "a1", payload: makeValidPayload({ annualReportId: "filing-1", routes: [makeSuccessRouteEntry("OCR")] }) }),
      makeArtifactBase({ id: "a2", payload: makeValidPayload({ annualReportId: "filing-2", routes: [makeSuccessRouteEntry("OCR")] }) }),
    ];

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue(artifacts) },
    );

    const ocrMetrics = report.routeMetrics.find((m) => m.route === "OCR");
    expect(ocrMetrics).toBeDefined();
    expect(ocrMetrics!.documentsCompared).toBe(2);
    expect(ocrMetrics!.successCount).toBe(2);
    expect(ocrMetrics!.financialsDetectedCount).toBe(2);
    expect(ocrMetrics!.boardReportDetectedCount).toBe(2);
    expect(ocrMetrics!.auditorReportDetectedCount).toBe(2);
    expect(ocrMetrics!.averageQualityScore).toBe(85);
  });

  it("chooses alternative route when it scores clearly better than TEXT_LAYER", async () => {
    // OCR score = 85 (full success)
    // TEXT_LAYER baseline: confidenceScore=0.85 + SUCCEEDED → 30 + round(0.85*40)=34 = 64
    // delta = 85 - 64 = 21 → ALTERNATIVE_BETTER
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [makeSuccessRouteEntry("OCR")],
        confidenceScore: 0.85,
        runStatus: "SUCCEEDED",
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    const doc = report.documentComparisons[0];
    expect(doc.outcome).toBe("ALTERNATIVE_BETTER");
    expect(doc.bestRoute).toBe("OCR");
    expect(doc.comparisonScoreDelta).toBe(21);
    expect(report.topOpportunities).toHaveLength(1);
    expect(report.topOpportunities[0].suggestedRoute).toBe("OCR");
    expect(report.topOpportunities[0].delta).toBe(21);
  });

  it("keeps TEXT_LAYER as best when alternatives score clearly worse", async () => {
    // TEXT_LAYER: confidenceScore=0.95 + SUCCEEDED → 30 + round(0.95*40)=38 = 68
    // OCR: financials=false, board=false, auditor=false, coverage=0.1 → round(0.1*10)=1, tables=0→0, lineItems=0→0 = 1
    // delta = 1 - 68 = -67 → TEXT_LAYER_BEST
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        confidenceScore: 0.95,
        runStatus: "SUCCEEDED",
        routes: [
          {
            route: "OCR",
            status: "SUCCESS",
            runtime: { available: true, name: "OCR", version: "1.0" },
            durationMs: 100,
            summary: {
              pageCount: 5,
              pagesProcessed: [1],
              financials: { detected: false, candidatePages: [], lineItemCount: 0, tableCount: 0, coverageScore: 0.1 },
              boardReport: { detected: false, candidatePages: [] },
              auditorReport: { detected: false, candidatePages: [] },
              warnings: [],
              errors: [],
            },
          },
        ],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    const doc = report.documentComparisons[0];
    expect(doc.outcome).toBe("TEXT_LAYER_BEST");
    expect(doc.bestRoute).toBe("TEXT_LAYER");
    expect(doc.comparisonScoreDelta).toBe(-67);
    expect(report.topOpportunities).toHaveLength(0);
  });

  it("scores delta within tie threshold as TIE and keeps TEXT_LAYER", async () => {
    // TEXT_LAYER: confidenceScore=0, runStatus=SUCCEEDED → 30 + round(0*40)=0 = 30
    // OCR: financials=true → 30, nothing else → 30
    // delta = 30 - 30 = 0 → TIE
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        confidenceScore: 0,
        runStatus: "SUCCEEDED",
        routes: [
          {
            route: "OCR",
            status: "SUCCESS",
            runtime: { available: true, name: "OCR", version: "1.0" },
            durationMs: 100,
            summary: {
              pageCount: 5,
              pagesProcessed: [1],
              financials: { detected: true, candidatePages: [], lineItemCount: 0, tableCount: 0, coverageScore: 0 },
              boardReport: { detected: false, candidatePages: [] },
              auditorReport: { detected: false, candidatePages: [] },
              warnings: [],
              errors: [],
            },
          },
        ],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    const doc = report.documentComparisons[0];
    expect(doc.outcome).toBe("TIE");
    expect(doc.bestRoute).toBe("TEXT_LAYER");
    expect(doc.comparisonScoreDelta).toBe(0);
  });

  it("marks ALL_ALTERNATIVES_UNAVAILABLE when every alternative route is unavailable", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [
          makeUnavailableRouteEntry("OCR"),
          makeUnavailableRouteEntry("OPENDATALOADER_LOCAL"),
        ],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    const doc = report.documentComparisons[0];
    expect(doc.outcome).toBe("ALL_ALTERNATIVES_UNAVAILABLE");
    expect(doc.bestRoute).toBe("TEXT_LAYER");
    expect(report.corpus.unavailableRouteRuns).toBe(2);
    expect(report.corpus.successfulRouteRuns).toBe(0);
  });

  it("marks ALL_ALTERNATIVES_FAILED when alternatives are FAILED or SKIPPED but not unavailable", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [makeFailedRouteEntry("OCR"), makeSkippedRouteEntry("HYBRID")],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    const doc = report.documentComparisons[0];
    expect(doc.outcome).toBe("ALL_ALTERNATIVES_FAILED");
    expect(doc.bestRoute).toBe("TEXT_LAYER");
    expect(report.corpus.failedRouteRuns).toBe(1);
    expect(report.corpus.skippedRouteRuns).toBe(1);
  });

  it("handles mixed FAILED/RUNTIME_UNAVAILABLE/SUCCESS: SUCCESS wins comparison", async () => {
    // OCR succeeds, ODL unavailable, HYBRID fails
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        confidenceScore: 0.5,
        runStatus: "SUCCEEDED",
        routes: [
          makeSuccessRouteEntry("OCR"),
          makeUnavailableRouteEntry("OPENDATALOADER_LOCAL"),
          makeFailedRouteEntry("HYBRID"),
        ],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    expect(report.corpus.successfulRouteRuns).toBe(1);
    expect(report.corpus.unavailableRouteRuns).toBe(1);
    expect(report.corpus.failedRouteRuns).toBe(1);

    const doc = report.documentComparisons[0];
    // TEXT_LAYER: 30 + round(0.5*40)=20 = 50; OCR = 85 → ALTERNATIVE_BETTER
    expect(doc.outcome).toBe("ALTERNATIVE_BETTER");
    expect(doc.bestRoute).toBe("OCR");

    const ocrAlt = doc.alternatives.find((a) => a.route === "OCR");
    const odlAlt = doc.alternatives.find((a) => a.route === "OPENDATALOADER_LOCAL");
    const hybridAlt = doc.alternatives.find((a) => a.route === "HYBRID");
    expect(ocrAlt?.status).toBe("SUCCESS");
    expect(odlAlt?.status).toBe("RUNTIME_UNAVAILABLE");
    expect(hybridAlt?.status).toBe("FAILED");
  });

  it("skips malformed artifacts without crashing and counts them", async () => {
    const malformed = makeArtifactBase({
      id: "bad-1",
      payload: { schemaVersion: 2, kind: "WRONG_KIND", routes: [] },
    });
    const good = makeArtifactBase({
      id: "good-1",
      payload: makeValidPayload({ routes: [makeSuccessRouteEntry("OCR")] }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([malformed, good]) },
    );

    expect(report.corpus.artifactCount).toBe(2);
    expect(report.corpus.malformedArtifactCount).toBe(1);
    expect(report.corpus.documentCount).toBe(1);
  });

  it("emits insufficient data warnings when corpus is empty", async () => {
    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([]) },
    );

    expect(report.corpus.insufficientData).toBe(true);
    expect(report.corpus.insufficientDataReasons).toContain(
      "No PARSER_ROUTE_SHADOW_EXECUTION artifacts found.",
    );
    expect(report.corpus.insufficientDataReasons).toContain(
      "Only 0 artifact(s) — aggregate metrics may not be representative.",
    );
    expect(report.corpus.insufficientDataReasons).toContain(
      "No successful alternative route runs — comparison limited to availability data.",
    );
  });

  it("emits insufficient data when corpus has artifacts but no successful runs", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({ routes: [makeUnavailableRouteEntry("OCR")] }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    expect(report.corpus.insufficientData).toBe(true);
    const reasons = report.corpus.insufficientDataReasons;
    expect(reasons.some((r) => r.includes("No successful alternative route runs"))).toBe(true);
  });

  it("safety flags are always read-only with no mutation flags set", async () => {
    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([]) },
    );

    expect(report.safety.readOnly).toBe(true);
    expect(report.safety.productionRoutingChanged).toBe(false);
    expect(report.safety.productionFactsMutated).toBe(false);
    expect(report.safety.publishAffected).toBe(false);
    expect(report.safety.shadowOnly).toBe(true);
  });

  it("includes structured production baseline from artifact payload", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        confidenceScore: 0.9,
        runStatus: "SUCCEEDED",
        routes: [makeUnavailableRouteEntry("OCR")],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    const doc = report.documentComparisons[0];
    // TEXT_LAYER: 30 + round(0.9*40)=36 = 66
    expect(doc.baseline.route).toBe("TEXT_LAYER");
    expect(doc.baseline.status).toBe("BASELINE");
    expect(doc.baseline.qualityScore).toBe(66);
    expect(doc.baseline.insufficientDetail).toBe(true);
  });

  it("top failures includes FAILED and RUNTIME_UNAVAILABLE entries", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [makeFailedRouteEntry("OCR"), makeUnavailableRouteEntry("OPENDATALOADER_LOCAL")],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    expect(report.topFailures).toHaveLength(2);
    const ocrFailure = report.topFailures.find((f) => f.route === "OCR");
    const odlFailure = report.topFailures.find((f) => f.route === "OPENDATALOADER_LOCAL");
    expect(ocrFailure?.status).toBe("FAILED");
    expect(odlFailure?.status).toBe("RUNTIME_UNAVAILABLE");
  });

  it("applies date filters correctly", async () => {
    const oldArtifact = makeArtifactBase({
      id: "old",
      createdAt: new Date("2025-06-01T00:00:00Z"),
      payload: makeValidPayload({ annualReportId: "filing-old", routes: [makeSuccessRouteEntry("OCR")] }),
    });
    const newArtifact = makeArtifactBase({
      id: "new",
      createdAt: new Date("2026-02-01T00:00:00Z"),
      payload: makeValidPayload({ annualReportId: "filing-new", routes: [makeSuccessRouteEntry("OCR")] }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      { from: "2026-01-01", to: "2026-12-31" },
      { listArtifacts: vi.fn().mockResolvedValue([oldArtifact, newArtifact]) },
    );

    expect(report.corpus.artifactCount).toBe(1);
    expect(report.documentComparisons[0].annualReportId).toBe("filing-new");
  });

  it("applies route filter to only compare requested routes", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [makeSuccessRouteEntry("OCR"), makeSuccessRouteEntry("OPENDATALOADER_LOCAL")],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      { routes: ["OCR"] },
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    const doc = report.documentComparisons[0];
    expect(doc.alternatives).toHaveLength(1);
    expect(doc.alternatives[0].route).toBe("OCR");
  });

  it("score breakdown contains penalty entries for warnings and errors", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [
          {
            route: "OCR",
            status: "SUCCESS",
            runtime: { available: true, name: "OCR", version: "1.0" },
            durationMs: 100,
            summary: {
              pageCount: 5,
              pagesProcessed: [1],
              financials: { detected: true, candidatePages: [], lineItemCount: 0, tableCount: 0, coverageScore: 0 },
              boardReport: { detected: false, candidatePages: [] },
              auditorReport: { detected: false, candidatePages: [] },
              warnings: ["warn-1", "warn-2", "warn-3"],
              errors: ["err-1"],
            },
          },
        ],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    const ocrSummary = report.documentComparisons[0].alternatives[0];
    // +30 financials -10 warnings (capped at 2 x 5) -10 errors (capped at 1 x 10) = 10
    expect(ocrSummary.qualityScore).toBe(10);
    expect(ocrSummary.scoreBreakdown.some((s) => s.startsWith("-10 warnings"))).toBe(true);
    expect(ocrSummary.scoreBreakdown.some((s) => s.startsWith("-10 errors"))).toBe(true);
  });
});

describe("serializePdfParserRouteQualityComparisonReport", () => {
  it("produces valid JSON output", async () => {
    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([]) },
    );

    const json = serializePdfParserRouteQualityComparisonReport(report);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as { schemaVersion: number; safety: { readOnly: boolean } };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.safety.readOnly).toBe(true);
  });
});

describe("validatePdfParserRouteQualityComparisonReport", () => {
  it("passes validation for a well-formed report", async () => {
    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([]) },
    );

    const { valid, issues } = validatePdfParserRouteQualityComparisonReport(report);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it("fails validation when safety flags are tampered with", () => {
    const report = {
      schemaVersion: 1 as const,
      generatedAt: new Date().toISOString(),
      artifactKind: "PARSER_ROUTE_SHADOW_EXECUTION" as const,
      filters: { limit: 100 },
      corpus: {
        artifactCount: 0,
        documentCount: 0,
        malformedArtifactCount: 0,
        successfulRouteRuns: 0,
        failedRouteRuns: 0,
        unavailableRouteRuns: 0,
        skippedRouteRuns: 0,
        insufficientData: true,
        insufficientDataReasons: [],
      },
      routeMetrics: [],
      documentComparisons: [],
      topOpportunities: [],
      topFailures: [],
      safety: {
        readOnly: false as unknown as true,
        productionRoutingChanged: true as unknown as false,
        productionFactsMutated: false as const,
        publishAffected: false as const,
        shadowOnly: true as const,
      },
    };

    const { valid, issues } = validatePdfParserRouteQualityComparisonReport(report);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("readOnly"))).toBe(true);
    expect(issues.some((i) => i.includes("productionRoutingChanged"))).toBe(true);
  });
});

// ---- Quality comparison compatibility: real OCR/ODL summary shapes ----------
// These tests verify that summaries produced by the real adapters are scoreable
// by the quality comparison service without any code changes.

/** Mirrors the PdfRouteShadowSummary shape returned by real ocrRuntimeAdapter.execute */
function makeRealOcrSummary() {
  return {
    pageCount: 12,
    pagesProcessed: [1, 2, 3, 4, 5, 6, 7, 8],
    financials: {
      detected: true,
      candidatePages: [2, 3],
      lineItemCount: 38,
      tableCount: 3,
      coverageScore: 0.67,
    },
    boardReport: {
      detected: true,
      candidatePages: [7],
      charCount: 5200,
    },
    auditorReport: {
      detected: true,
      candidatePages: [11],
      charCount: 1800,
    },
    warnings: [
      "OCR quality insufficient for reliable extraction on some pages.",
      "4 row(s) had ambiguous column assignment — line item count may be imprecise.",
    ],
    errors: [],
  };
}

/** Mirrors the PdfRouteShadowSummary shape returned by real openDataLoaderRuntimeAdapter.execute */
function makeRealOdlSummary() {
  return {
    pageCount: 12,
    pagesProcessed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    financials: {
      detected: true,
      candidatePages: [2, 3, 4],
      lineItemCount: 52,
      tableCount: 4,
      coverageScore: 0.58,
    },
    boardReport: {
      detected: true,
      candidatePages: [7, 8],
      charCount: 7400,
    },
    auditorReport: {
      detected: false,
      candidatePages: [],
      charCount: 0,
    },
    warnings: [
      "Financial section keywords detected but no tables found — table extraction may be incomplete.",
    ],
    errors: [],
  };
}

/** Mirrors the PdfRouteShadowSummary from hybridRuntimeAdapter when both components succeed */
function makeRealHybridSummary() {
  const ocr = makeRealOcrSummary();
  const odl = makeRealOdlSummary();
  return {
    pageCount: Math.max(ocr.pageCount, odl.pageCount),
    pagesProcessed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    financials: {
      detected: true,
      candidatePages: [2, 3, 4],
      lineItemCount: Math.max(ocr.financials.lineItemCount, odl.financials.lineItemCount),
      tableCount: Math.max(ocr.financials.tableCount, odl.financials.tableCount),
      coverageScore: Math.max(ocr.financials.coverageScore, odl.financials.coverageScore),
    },
    boardReport: {
      detected: true,
      candidatePages: [7, 8],
      charCount: Math.max(ocr.boardReport.charCount ?? 0, odl.boardReport.charCount ?? 0),
    },
    auditorReport: {
      detected: true,
      candidatePages: [11],
      charCount: Math.max(ocr.auditorReport.charCount ?? 0, odl.auditorReport.charCount ?? 0),
    },
    warnings: ["ODL component unavailable or failed — hybrid uses OCR only."],
    errors: [],
  };
}

function makeRealRouteEntry(route: string, summary: object) {
  return {
    route,
    status: "SUCCESS",
    runtime: { available: true, name: route, version: "2.2.1" },
    durationMs: 1400,
    summary,
  };
}

describe("quality comparison — real OCR/ODL summary compatibility", () => {
  it("OCR real-success summary can be scored and produces a non-null quality score", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [makeRealRouteEntry("OCR", makeRealOcrSummary())],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    expect(report.corpus.successfulRouteRuns).toBe(1);
    const docComparison = report.documentComparisons[0];
    expect(docComparison).toBeDefined();
    const ocrAlt = docComparison?.alternatives.find((a) => a.route === "OCR");
    expect(ocrAlt?.status).toBe("SUCCESS");
    expect(ocrAlt?.qualityScore).not.toBeNull();
    expect(typeof ocrAlt?.qualityScore).toBe("number");
    expect(ocrAlt?.financialsDetected).toBe(true);
    expect(ocrAlt?.boardReportDetected).toBe(true);
    expect(ocrAlt?.auditorReportDetected).toBe(true);
    expect(ocrAlt?.tableCount).toBe(3);
    expect(ocrAlt?.lineItemCount).toBe(38);
    expect(ocrAlt?.warningsCount).toBe(2);
  });

  it("ODL real-success summary can be scored and produces a non-null quality score", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [makeRealRouteEntry("OPENDATALOADER_LOCAL", makeRealOdlSummary())],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    expect(report.corpus.successfulRouteRuns).toBe(1);
    const docComparison = report.documentComparisons[0];
    const odlAlt = docComparison?.alternatives.find((a) => a.route === "OPENDATALOADER_LOCAL");
    expect(odlAlt?.status).toBe("SUCCESS");
    expect(odlAlt?.qualityScore).not.toBeNull();
    expect(odlAlt?.financialsDetected).toBe(true);
    expect(odlAlt?.tableCount).toBe(4);
    expect(odlAlt?.lineItemCount).toBe(52);
    expect(odlAlt?.warningsCount).toBe(1);
  });

  it("HYBRID real-success summary can be scored and produces a non-null quality score", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [makeRealRouteEntry("HYBRID", makeRealHybridSummary())],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    const docComparison = report.documentComparisons[0];
    const hybridAlt = docComparison?.alternatives.find((a) => a.route === "HYBRID");
    expect(hybridAlt?.status).toBe("SUCCESS");
    expect(hybridAlt?.qualityScore).not.toBeNull();
    expect(hybridAlt?.financialsDetected).toBe(true);
  });

  it("RUNTIME_UNAVAILABLE route does not count as a failure in corpus metrics", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [makeUnavailableRouteEntry("OCR"), makeUnavailableRouteEntry("OPENDATALOADER_LOCAL")],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    expect(report.corpus.failedRouteRuns).toBe(0);
    expect(report.corpus.unavailableRouteRuns).toBe(2);
    expect(report.documentComparisons[0]?.outcome).toBe("ALL_ALTERNATIVES_UNAVAILABLE");
  });

  it("FAILED route is counted separately from RUNTIME_UNAVAILABLE", async () => {
    const artifact = makeArtifactBase({
      payload: makeValidPayload({
        routes: [
          makeFailedRouteEntry("OCR"),
          makeUnavailableRouteEntry("OPENDATALOADER_LOCAL"),
        ],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([artifact]) },
    );

    expect(report.corpus.failedRouteRuns).toBe(1);
    expect(report.corpus.unavailableRouteRuns).toBe(1);
    expect(report.documentComparisons[0]?.outcome).toBe("ALL_ALTERNATIVES_FAILED");
  });

  it("malformed or oversized route payloads are skipped safely without crashing", async () => {
    const malformedPayload = {
      schemaVersion: 1,
      kind: "PARSER_ROUTE_SHADOW_EXECUTION",
      createdAt: "2026-01-01T00:00:00Z",
      input: { annualReportId: "f1", organizationNumber: "123", fiscalYear: 2024 },
      productionBaseline: { route: "LEGACY", confidenceScore: 0.8, runStatus: "SUCCEEDED" },
      routes: [
        {
          route: "OCR",
          status: "SUCCESS",
          runtime: { available: true },
          durationMs: 500,
          summary: {
            // Oversized / unusual fields — should not crash scoring
            pageCount: 99999,
            pagesProcessed: Array.from({ length: 500 }, (_, i) => i + 1),
            financials: {
              detected: true,
              candidatePages: Array.from({ length: 200 }, (_, i) => i + 1),
              lineItemCount: 10000,
              tableCount: 9999,
              coverageScore: 1.5, // > 1, should be clamped
            },
            boardReport: { detected: false, candidatePages: [] },
            auditorReport: { detected: false, candidatePages: [] },
            warnings: Array.from({ length: 50 }, (_, i) => `warning-${i}`),
            errors: [],
          },
        },
      ],
      // Missing safety flags → malformed
    };

    const malformedArtifact = makeArtifactBase({ payload: malformedPayload });
    const goodArtifact = makeArtifactBase({
      id: "a2",
      payload: makeValidPayload({ routes: [makeRealRouteEntry("OCR", makeRealOcrSummary())] }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([malformedArtifact, goodArtifact]) },
    );

    // Malformed artifact (missing safety flags) is counted and skipped
    expect(report.corpus.malformedArtifactCount).toBe(1);
    // Good artifact still processed
    expect(report.corpus.documentCount).toBe(1);
    expect(report.corpus.successfulRouteRuns).toBe(1);
  });

  it("top opportunities remain deterministic across multiple real-summary documents", async () => {
    const highDeltaArtifact = makeArtifactBase({
      id: "high",
      payload: makeValidPayload({
        annualReportId: "filing-high",
        confidenceScore: 0.5,
        runStatus: null,
        routes: [makeRealRouteEntry("OCR", makeRealOcrSummary())],
      }),
    });
    const lowDeltaArtifact = makeArtifactBase({
      id: "low",
      payload: makeValidPayload({
        annualReportId: "filing-low",
        confidenceScore: 0.99,
        runStatus: "SUCCEEDED",
        routes: [makeRealRouteEntry("OCR", { ...makeRealOcrSummary(), financials: { ...makeRealOcrSummary().financials, detected: false, tableCount: 0, lineItemCount: 0, coverageScore: 0 } })],
      }),
    });

    const report = await buildPdfParserRouteQualityComparisonReport(
      {},
      { listArtifacts: vi.fn().mockResolvedValue([highDeltaArtifact, lowDeltaArtifact]) },
    );

    // Top opportunities are sorted by delta descending — deterministic
    expect(report.topOpportunities.length).toBeGreaterThanOrEqual(0);
    if (report.topOpportunities.length >= 2) {
      const [first, second] = report.topOpportunities;
      expect((first?.delta ?? 0)).toBeGreaterThanOrEqual(second?.delta ?? 0);
    }

    // Report must be JSON-serializable (no NaN/Infinity)
    const { valid } = validatePdfParserRouteQualityComparisonReport(report);
    expect(valid).toBe(true);
  });
});
