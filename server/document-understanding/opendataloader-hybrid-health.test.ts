import { afterEach, describe, expect, it, vi } from "vitest";

describe("opendataloader-hybrid-health", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports a missing hybrid URL explicitly", async () => {
    vi.doMock("@/server/document-understanding/opendataloader-runtime", () => ({
      inspectOpenDataLoaderRuntime: vi.fn(async () => ({
        packageInstalled: true,
        packageVersion: "2.2.1",
        java: {
          rawVersion: "17.0.18",
          majorVersion: 17,
          available: true,
        },
        localModeReady: true,
        hybridConfigured: false,
        localModeReason: "ready",
        hybridModeReason: "OPENDATALOADER_HYBRID_URL is not configured.",
        liveLocalBenchmarkReady: true,
        liveLocalBenchmarkReason: "ready",
        liveHybridBenchmarkReady: false,
        liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
      })),
    }));

    const module = await import("@/server/document-understanding/opendataloader-hybrid-health");
    const summary = await module.inspectOpenDataLoaderHybridHealth({
      config: {
        enabled: true,
        mode: "hybrid",
        hybridBackend: "docling-fast",
        hybridUrl: null,
        forceOcr: false,
        useStructTree: false,
        timeoutMs: 10_000,
        dualRun: true,
        storeAnnotatedPdf: false,
        fallbackToLegacy: true,
      },
    });

    expect(summary.liveHybridBenchmarkReady).toBe(false);
    expect(summary.errorType).toBe("missing_url");
    expect(summary.compatibilityProbe.attempted).toBe(false);
    expect(summary.compatibilityProbe.probeDocument).toBeNull();
  });

  it("reports an unreachable backend clearly", async () => {
    vi.doMock("@/server/document-understanding/opendataloader-runtime", () => ({
      inspectOpenDataLoaderRuntime: vi.fn(async () => ({
        packageInstalled: true,
        packageVersion: "2.2.1",
        java: {
          rawVersion: "17.0.18",
          majorVersion: 17,
          available: true,
        },
        localModeReady: true,
        hybridConfigured: true,
        localModeReason: "ready",
        hybridModeReason: "configured",
        liveLocalBenchmarkReady: true,
        liveLocalBenchmarkReason: "ready",
        liveHybridBenchmarkReady: true,
        liveHybridBenchmarkReason: "configured",
      })),
    }));
    vi.doMock("@/integrations/brreg/annual-report-financials/preflight", () => ({
      preflightAnnualReportDocument: vi.fn(async () => ({
        pageCount: 2,
        hasTextLayer: true,
        hasReliableTextLayer: true,
        parsedPages: [],
      })),
    }));
    vi.doMock("@/server/document-understanding/opendataloader-client", () => ({
      parseAnnualReportPdfWithOpenDataLoader: vi.fn(async () => {
        throw new Error("Could not connect to hybrid backend at http://localhost:5002");
      }),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    );

    const module = await import("@/server/document-understanding/opendataloader-hybrid-health");
    const summary = await module.inspectOpenDataLoaderHybridHealth({
      config: {
        enabled: true,
        mode: "hybrid",
        hybridBackend: "docling-fast",
        hybridUrl: "http://localhost:5002",
        forceOcr: false,
        useStructTree: false,
        timeoutMs: 10_000,
        dualRun: true,
        storeAnnotatedPdf: false,
        fallbackToLegacy: true,
      },
    });

    expect(summary.liveHybridBenchmarkReady).toBe(false);
    expect(summary.errorType).toBe("unreachable");
    expect(summary.httpProbe.reachable).toBe(false);
    expect(summary.compatibilityProbe.attempted).toBe(true);
    expect(summary.compatibilityProbe.invocation).toMatchObject({
      executionMode: "hybrid",
      hybridMode: "auto",
      requiresOcr: false,
    });
  });

  it("reports hybrid readiness when the backend health probe and compatibility parse succeed", async () => {
    vi.doMock("@/server/document-understanding/opendataloader-runtime", () => ({
      inspectOpenDataLoaderRuntime: vi.fn(async () => ({
        packageInstalled: true,
        packageVersion: "2.2.1",
        java: {
          rawVersion: "17.0.18",
          majorVersion: 17,
          available: true,
        },
        localModeReady: true,
        hybridConfigured: true,
        localModeReason: "ready",
        hybridModeReason: "configured",
        liveLocalBenchmarkReady: true,
        liveLocalBenchmarkReason: "ready",
        liveHybridBenchmarkReady: true,
        liveHybridBenchmarkReason: "configured",
      })),
    }));
    vi.doMock("@/integrations/brreg/annual-report-financials/preflight", () => ({
      preflightAnnualReportDocument: vi.fn(async () => ({
        pageCount: 2,
        hasTextLayer: true,
        hasReliableTextLayer: true,
        parsedPages: [],
      })),
    }));
    vi.doMock("@/server/document-understanding/opendataloader-client", () => ({
      parseAnnualReportPdfWithOpenDataLoader: vi.fn(async () => ({
        annualReportPages: [{ pageNumber: 1 }, { pageNumber: 2 }],
        metrics: {
          blockCount: 12,
        },
        diagnostics: {
          rawOutput: null,
          normalizedOutput: null,
        },
      })),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    );

    const module = await import("@/server/document-understanding/opendataloader-hybrid-health");
    const summary = await module.inspectOpenDataLoaderHybridHealth({
      config: {
        enabled: true,
        mode: "hybrid",
        hybridBackend: "docling-fast",
        hybridUrl: "http://localhost:5002",
        forceOcr: false,
        useStructTree: false,
        timeoutMs: 10_000,
        dualRun: true,
        storeAnnotatedPdf: false,
        fallbackToLegacy: true,
      },
    });

    expect(summary.liveHybridBenchmarkReady).toBe(true);
    expect(summary.errorType).toBeNull();
    expect(summary.httpProbe.ok).toBe(true);
    expect(summary.compatibilityProbe.success).toBe(true);
    expect(summary.compatibilityProbe.annualReportPageCount).toBe(2);
    expect(summary.compatibilityProbe.invocation).toMatchObject({
      executionMode: "hybrid",
      hybridMode: "auto",
      requiresOcr: false,
    });
  });

  it("surfaces structured zero-page diagnostics when the compatibility probe returns no usable pages", async () => {
    vi.doMock("@/server/document-understanding/opendataloader-runtime", () => ({
      inspectOpenDataLoaderRuntime: vi.fn(async () => ({
        packageInstalled: true,
        packageVersion: "2.2.1",
        java: {
          rawVersion: "17.0.18",
          majorVersion: 17,
          available: true,
        },
        localModeReady: true,
        hybridConfigured: true,
        localModeReason: "ready",
        hybridModeReason: "configured",
        liveLocalBenchmarkReady: true,
        liveLocalBenchmarkReason: "ready",
        liveHybridBenchmarkReady: true,
        liveHybridBenchmarkReason: "configured",
      })),
    }));
    vi.doMock("@/integrations/brreg/annual-report-financials/preflight", () => ({
      preflightAnnualReportDocument: vi.fn(async () => ({
        pageCount: 5,
        hasTextLayer: true,
        hasReliableTextLayer: false,
        parsedPages: [],
      })),
    }));
    vi.doMock("@/server/document-understanding/opendataloader-client", () => ({
      parseAnnualReportPdfWithOpenDataLoader: vi.fn(async () => {
        const error = new Error("no normalized pages");
        (error as Error & { diagnostics?: unknown }).diagnostics = {
          failureStage: "annual-report-page-conversion",
          failureReason: "OpenDataLoader returned no normalized pages for this filing.",
          annualReportPageCount: 0,
          rawOutput: {
            topLevelType: "object",
            topLevelKeys: ["kids", "number of pages"],
            elementCount: 0,
            pageCount: 0,
            tableCount: 0,
            textElementCount: 0,
            elementTypeCounts: {},
            elementContainerPaths: [],
            pageNumbers: [],
            sampleElementKeys: [],
            sampleElementTypes: [],
            topLevelContainerDiagnostics: [
              {
                key: "kids",
                valueType: "array",
                length: 0,
                sampleItemType: null,
                sampleItemKeys: [],
              },
            ],
          },
          normalizedOutput: {
            pageCount: 0,
            blockCount: 0,
            tableCount: 0,
            blockKindCounts: {},
            rawTypeCounts: {},
            pages: [],
          },
        };
        throw error;
      }),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    );

    const module = await import("@/server/document-understanding/opendataloader-hybrid-health");
    const summary = await module.inspectOpenDataLoaderHybridHealth({
      config: {
        enabled: true,
        mode: "hybrid",
        hybridBackend: "docling-fast",
        hybridUrl: "http://localhost:5002",
        forceOcr: false,
        useStructTree: false,
        timeoutMs: 10_000,
        dualRun: true,
        storeAnnotatedPdf: false,
        fallbackToLegacy: false,
      },
    });

    expect(summary.liveHybridBenchmarkReady).toBe(false);
    expect(summary.errorType).toBe("compatibility_probe_failed");
    expect(summary.reason).toBe("OpenDataLoader returned no normalized pages for this filing.");
    expect(summary.compatibilityProbe.failureStage).toBe("annual-report-page-conversion");
    expect(summary.compatibilityProbe.rawOutput).toMatchObject({
      elementCount: 0,
      topLevelContainerDiagnostics: [
        expect.objectContaining({
          key: "kids",
          length: 0,
        }),
      ],
    });
  });
});
