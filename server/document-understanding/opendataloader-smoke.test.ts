import { afterEach, describe, expect, it, vi } from "vitest";

describe("opendataloader-smoke", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("fails clearly when local OpenDataLoader runtime is not ready", async () => {
    vi.doMock("@/server/document-understanding/opendataloader-config", () => ({
      resolveOpenDataLoaderConfig: vi.fn(() => ({
        enabled: true,
        mode: "local",
        hybridBackend: "docling-fast",
        hybridUrl: null,
        forceOcr: false,
        useStructTree: false,
        timeoutMs: 120_000,
        dualRun: false,
        storeAnnotatedPdf: true,
        fallbackToLegacy: true,
      })),
    }));
    vi.doMock("@/server/document-understanding/opendataloader-runtime", () => ({
      inspectOpenDataLoaderRuntime: vi.fn(async () => ({
        packageInstalled: true,
        packageVersion: "2.2.1",
        java: {
          rawVersion: "1.8.0_241",
          majorVersion: 8,
          available: true,
        },
        localModeReady: false,
        hybridConfigured: false,
        localModeReason: "Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.",
        hybridModeReason: "OPENDATALOADER_HYBRID_URL is not configured.",
        liveLocalBenchmarkReady: false,
        liveLocalBenchmarkReason:
          "Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.",
        liveHybridBenchmarkReady: false,
        liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
      })),
    }));

    const smokeModule = await import("@/server/document-understanding/opendataloader-smoke");

    await expect(smokeModule.runOpenDataLoaderSmokeTest()).rejects.toThrow(
      "Java 11+ is required",
    );
  });

  it("returns a structured smoke summary when runtime and parse succeed", async () => {
    const parseMock = vi.fn(async () => ({
      routing: {
        enabled: true,
        executionMode: "local",
        hybridMode: null,
        useStructTree: true,
        requiresOcr: false,
        reasonCode: "STRUCT_TREE_PREFERRED",
        reason: "Reliable text layer detected and structure-tree extraction was requested.",
      },
      metrics: {
        durationMs: 210,
        pageCount: 2,
        blockCount: 7,
        tableBlockCount: 1,
      },
      annualReportPages: [
        {
          pageNumber: 1,
          text: "Arsregnskap 2024",
          normalizedText: "arsregnskap 2024",
          hasEmbeddedText: true,
          lines: [],
          blocks: [{ id: "block-1", kind: "heading", rawType: "heading", text: "Arsregnskap 2024", normalizedText: "arsregnskap 2024", bbox: null, source: { engine: "OPENDATALOADER", engineMode: "local", sourceElementId: "block-1", sourceRawType: "heading", order: 0 } }],
          tables: [],
          source: { engine: "OPENDATALOADER", engineMode: "local", sourceElementId: "page-1", sourceRawType: "page", order: 1 },
        },
        {
          pageNumber: 2,
          text: "Resultatregnskap",
          normalizedText: "resultatregnskap",
          hasEmbeddedText: true,
          lines: [],
          blocks: [{ id: "block-2", kind: "table", rawType: "table", text: "Resultatregnskap", normalizedText: "resultatregnskap", bbox: null, table: null, source: { engine: "OPENDATALOADER", engineMode: "local", sourceElementId: "block-2", sourceRawType: "table", order: 1 } }],
          tables: [{ id: "table-2", pageNumber: 2, bbox: null, rowCount: 2, columnCount: 3, rows: [], source: { engine: "OPENDATALOADER", engineMode: "local", sourceElementId: "table-2", sourceRawType: "table", order: 0 } }],
          source: { engine: "OPENDATALOADER", engineMode: "local", sourceElementId: "page-2", sourceRawType: "page", order: 2 },
        },
      ],
    }));

    vi.doMock("@/server/document-understanding/opendataloader-config", () => ({
      resolveOpenDataLoaderConfig: vi.fn(() => ({
        enabled: true,
        mode: "local",
        hybridBackend: "docling-fast",
        hybridUrl: null,
        forceOcr: false,
        useStructTree: true,
        timeoutMs: 120_000,
        dualRun: false,
        storeAnnotatedPdf: true,
        fallbackToLegacy: true,
      })),
    }));
    vi.doMock("@/server/document-understanding/opendataloader-runtime", () => ({
      inspectOpenDataLoaderRuntime: vi.fn(async () => ({
        packageInstalled: true,
        packageVersion: "2.2.1",
        java: {
          rawVersion: "17.0.9",
          majorVersion: 17,
          available: true,
        },
        localModeReady: true,
        hybridConfigured: false,
        localModeReason: "Java 17.0.9 is compatible with local OpenDataLoader execution.",
        hybridModeReason: "OPENDATALOADER_HYBRID_URL is not configured.",
        liveLocalBenchmarkReady: true,
        liveLocalBenchmarkReason:
          "Environment is ready for live local OpenDataLoader benchmark cases.",
        liveHybridBenchmarkReady: false,
        liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
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
      parseAnnualReportPdfWithOpenDataLoader: parseMock,
    }));

    const smokeModule = await import("@/server/document-understanding/opendataloader-smoke");
    const summary = await smokeModule.runOpenDataLoaderSmokeTest();

    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(summary.metrics.pageCount).toBe(2);
    expect(summary.pages).toEqual([
      { pageNumber: 1, blockCount: 1, tableCount: 0, lineCount: 0 },
      { pageNumber: 2, blockCount: 1, tableCount: 1, lineCount: 0 },
    ]);
  });
});
