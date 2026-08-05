import type { AnnualReportFiling, FinancialExtractionRun, PdfModelArtifactSnapshot } from "@prisma/client";
import { PdfModelArtifactKind, PdfModelArtifactStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { PdfParserRouteRuntimeAdapter } from "./pdf-parser-route-runtime-adapter";
import {
  PdfParserRouteShadowExecutionError,
  PdfParserRouteShadowExecutionValidationError,
  runPdfParserRouteShadowExecution,
} from "./pdf-parser-route-shadow-execution-service";

// --- Fixtures ----------------------------------------------------------------

type FilingRowOverrides = Partial<AnnualReportFiling> & {
  company?: { id: string; orgNumber: string; name: string };
  extractionRuns?: FinancialExtractionRun[];
  artifacts?: [];
  reviews?: [];
};

function makeFilingRow(overrides: FilingRowOverrides = {}): AnnualReportFiling & {
  company: { id: string; orgNumber: string; name: string };
  extractionRuns: FinancialExtractionRun[];
  artifacts: [];
  reviews: [];
} {
  return {
    id: "filing-1",
    companyId: "company-1",
    fiscalYear: 2024,
    sourceSystem: "BRREG",
    sourceUrl: "https://example.com/report.pdf",
    sourceDiscoveryKey: "discovery-key",
    sourceIdempotencyKey: "idempotency-key",
    sourceDocumentHash: null,
    sourceDocumentType: "annual_report",
    discoveredAt: new Date("2025-01-01"),
    downloadedAt: new Date("2025-01-01"),
    processingStartedAt: null,
    preflightedAt: null,
    extractedAt: null,
    validatedAt: null,
    publishedSnapshotAt: null,
    manualReviewAt: null,
    failedAt: null,
    status: "EXTRACTED",
    unitHints: null,
    metadata: null,
    parserVersionLastTried: null,
    lastError: null,
    isLatestForFiscalYear: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    company: { id: "company-1", orgNumber: "123456789", name: "Test AS" },
    extractionRuns: [],
    artifacts: [],
    reviews: [],
    ...overrides,
  };
}

function makeExtractionRun(overrides: Partial<FinancialExtractionRun> = {}): FinancialExtractionRun {
  return {
    id: "run-1",
    filingId: "filing-1",
    companyId: "company-1",
    parserVersion: "v1",
    documentEngine: "LEGACY",
    documentEngineVersion: null,
    documentEngineMode: null,
    ocrEngine: null,
    ocrLanguage: null,
    status: "SUCCEEDED",
    startedAt: new Date("2025-01-01"),
    finishedAt: new Date("2025-01-01"),
    confidenceScore: 0.85,
    validationScore: 0.9,
    metricsCoverage: null,
    errorMessage: null,
    rawSummary: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeArtifactSnapshot(overrides: Partial<PdfModelArtifactSnapshot> = {}): PdfModelArtifactSnapshot {
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
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function makeUnavailableAdapter(route: "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID"): PdfParserRouteRuntimeAdapter {
  return {
    route,
    isAvailable: vi.fn().mockResolvedValue({ available: false, reason: "binary_not_configured" }),
    execute: vi.fn().mockResolvedValue({
      status: "RUNTIME_UNAVAILABLE",
      durationMs: 0,
      runtime: { available: false, reason: "binary_not_configured" },
      summary: null,
    }),
  };
}

function makeSuccessAdapter(route: "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID"): PdfParserRouteRuntimeAdapter {
  return {
    route,
    isAvailable: vi.fn().mockResolvedValue({ available: true, name: route, version: "1.0" }),
    execute: vi.fn().mockResolvedValue({
      status: "SUCCESS",
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
    }),
  };
}

function makeFailingAdapter(route: "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID"): PdfParserRouteRuntimeAdapter {
  return {
    route,
    isAvailable: vi.fn().mockResolvedValue({ available: true, name: route, version: "1.0" }),
    execute: vi.fn().mockResolvedValue({
      status: "FAILED",
      durationMs: 50,
      errorCode: "PARSE_ERROR",
      errorMessage: "Could not parse document",
      summary: null,
    }),
  };
}

// --- Test helpers ------------------------------------------------------------

function makeBaseDeps(filingOverride = makeFilingRow(), artifactOverride = makeArtifactSnapshot()) {
  return {
    getFilingWithArtifacts: vi.fn().mockResolvedValue(filingOverride),
    createArtifact: vi.fn().mockResolvedValue(artifactOverride),
  };
}

// --- Tests -------------------------------------------------------------------

describe("runPdfParserRouteShadowExecution", () => {
  it("persists an artifact for a successful OCR shadow execution", async () => {
    const filing = makeFilingRow({ extractionRuns: [makeExtractionRun()] });
    const artifact = makeArtifactSnapshot();
    const deps = makeBaseDeps(filing, artifact);
    deps.createArtifact = vi.fn().mockResolvedValue(artifact);

    const result = await runPdfParserRouteShadowExecution(
      {
        annualReportId: "filing-1",
        requestedRoutes: ["OCR"],
        reason: "manual-sampling",
        source: "CLI",
      },
      {
        ...deps,
        routeAdapters: { OCR: makeSuccessAdapter("OCR") },
      },
    );

    expect(result.artifactId).toBe("artifact-1");
    expect(result.filingId).toBe("filing-1");
    expect(result.fiscalYear).toBe(2024);
    expect(result.routeResults).toHaveLength(1);
    expect(result.routeResults[0].route).toBe("OCR");
    expect(result.routeResults[0].status).toBe("SUCCESS");

    expect(deps.createArtifact).toHaveBeenCalledOnce();
    const [createCall] = deps.createArtifact.mock.calls;
    const payload = createCall[0].payload as Record<string, unknown>;
    expect(payload.schemaVersion).toBe(1);
    expect(payload.kind).toBe("PARSER_ROUTE_SHADOW_EXECUTION");
    expect(Array.isArray(payload.routes)).toBe(true);
  });

  it("stores RUNTIME_UNAVAILABLE for unconfigured runtime — does not throw", async () => {
    const filing = makeFilingRow();
    const artifact = makeArtifactSnapshot();
    const deps = makeBaseDeps(filing, artifact);

    const result = await runPdfParserRouteShadowExecution(
      { annualReportId: "filing-1", requestedRoutes: ["OPENDATALOADER_LOCAL"] },
      {
        ...deps,
        routeAdapters: { OPENDATALOADER_LOCAL: makeUnavailableAdapter("OPENDATALOADER_LOCAL") },
      },
    );

    expect(result.routeResults[0].status).toBe("RUNTIME_UNAVAILABLE");
    expect(deps.createArtifact).toHaveBeenCalledOnce();

    const [createCall] = deps.createArtifact.mock.calls;
    const routes = (createCall[0].payload as Record<string, unknown>).routes as Array<Record<string, unknown>>;
    expect(routes[0].status).toBe("RUNTIME_UNAVAILABLE");
    expect(routes[0].summary).toBeNull();
  });

  it("one route can fail while the other still completes", async () => {
    const filing = makeFilingRow();
    const artifact = makeArtifactSnapshot();
    const deps = makeBaseDeps(filing, artifact);

    const result = await runPdfParserRouteShadowExecution(
      { annualReportId: "filing-1", requestedRoutes: ["OCR", "OPENDATALOADER_LOCAL"] },
      {
        ...deps,
        routeAdapters: {
          OCR: makeFailingAdapter("OCR"),
          OPENDATALOADER_LOCAL: makeUnavailableAdapter("OPENDATALOADER_LOCAL"),
        },
      },
    );

    expect(result.routeResults).toHaveLength(2);
    const ocrResult = result.routeResults.find((r) => r.route === "OCR");
    const odlResult = result.routeResults.find((r) => r.route === "OPENDATALOADER_LOCAL");
    expect(ocrResult?.status).toBe("FAILED");
    expect(odlResult?.status).toBe("RUNTIME_UNAVAILABLE");
    // Artifact must still be persisted
    expect(deps.createArtifact).toHaveBeenCalledOnce();
  });

  it("safety flags are always correct in persisted artifact", async () => {
    const filing = makeFilingRow();
    const artifact = makeArtifactSnapshot();
    const deps = makeBaseDeps(filing, artifact);

    await runPdfParserRouteShadowExecution(
      { annualReportId: "filing-1", requestedRoutes: ["OCR"] },
      {
        ...deps,
        routeAdapters: { OCR: makeSuccessAdapter("OCR") },
      },
    );

    const [createCall] = deps.createArtifact.mock.calls;
    const payload = createCall[0].payload as Record<string, unknown>;
    const safety = payload.safety as Record<string, unknown>;
    expect(safety.productionRoutingChanged).toBe(false);
    expect(safety.productionFactsMutated).toBe(false);
    expect(safety.publishAffected).toBe(false);
    expect(safety.shadowOnly).toBe(true);
  });

  it("rejects an empty routes array", async () => {
    const deps = makeBaseDeps();
    await expect(
      runPdfParserRouteShadowExecution({ annualReportId: "filing-1", requestedRoutes: [] }, deps),
    ).rejects.toBeInstanceOf(PdfParserRouteShadowExecutionValidationError);
  });

  it("rejects an invalid route value", async () => {
    const deps = makeBaseDeps();
    await expect(
      runPdfParserRouteShadowExecution(
        { annualReportId: "filing-1", requestedRoutes: ["INVALID_ROUTE" as never] },
        deps,
      ),
    ).rejects.toBeInstanceOf(PdfParserRouteShadowExecutionValidationError);
  });

  it("throws when the filing is not found", async () => {
    const deps = {
      getFilingWithArtifacts: vi.fn().mockResolvedValue(null),
      createArtifact: vi.fn(),
    };
    await expect(
      runPdfParserRouteShadowExecution(
        { annualReportId: "nonexistent", requestedRoutes: ["OCR"] },
        deps,
      ),
    ).rejects.toBeInstanceOf(PdfParserRouteShadowExecutionError);
    expect(deps.createArtifact).not.toHaveBeenCalled();
  });

  it("does not call any production update/mutation methods", async () => {
    const filing = makeFilingRow();
    const artifact = makeArtifactSnapshot();
    const deps = makeBaseDeps(filing, artifact);

    await runPdfParserRouteShadowExecution(
      { annualReportId: "filing-1", requestedRoutes: ["OCR"] },
      {
        ...deps,
        routeAdapters: { OCR: makeSuccessAdapter("OCR") },
      },
    );

    // Only the artifact create is called; no update/mutation to filing or facts
    expect(deps.createArtifact).toHaveBeenCalledOnce();
    expect(deps.getFilingWithArtifacts).toHaveBeenCalledOnce();
    // createArtifact call must not set fields that alter production data
    const [createCall] = deps.createArtifact.mock.calls;
    expect(createCall[0].kind).toBe("PARSER_ROUTE_SHADOW_EXECUTION");
    const payload = createCall[0].payload as Record<string, unknown>;
    const safety = payload.safety as Record<string, unknown>;
    expect(safety.productionFactsMutated).toBe(false);
  });

  it("includes a structured production baseline from the latest extraction run", async () => {
    const run = makeExtractionRun({ documentEngine: "LEGACY", confidenceScore: 0.9 });
    const filing = makeFilingRow({ extractionRuns: [run] });
    const artifact = makeArtifactSnapshot();
    const deps = makeBaseDeps(filing, artifact);

    await runPdfParserRouteShadowExecution(
      { annualReportId: "filing-1", requestedRoutes: ["OCR"] },
      {
        ...deps,
        routeAdapters: { OCR: makeUnavailableAdapter("OCR") },
      },
    );

    const [createCall] = deps.createArtifact.mock.calls;
    const payload = createCall[0].payload as Record<string, unknown>;
    const baseline = payload.productionBaseline as Record<string, unknown>;
    expect(baseline.route).toBe("LEGACY");
    expect(baseline.confidenceScore).toBe(0.9);
  });
});
