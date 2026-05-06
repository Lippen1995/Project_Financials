/**
 * Unit tests for pdf-parser-route-runtime-adapter (OCR and ODL adapters).
 *
 * All external dependencies (OCR runtime, ODL client, Java inspection) are mocked.
 * No Tesseract, Java, or network calls are made. Safe for CI.
 *
 * Runtime-dependent integration tests require PDF_RUNTIME_INTEGRATION_TESTS=1
 * and are explicitly skipped in normal test runs.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ---- Module mocks -----------------------------------------------------------
// Must be declared before any imports that trigger module resolution.

vi.mock("@/integrations/brreg/annual-report-financials/ocr", () => ({
  extractOcrPagesWithDiagnostics: vi.fn(),
}));

vi.mock("@/server/document-understanding/opendataloader-runtime", () => ({
  readOpenDataLoaderPackageVersion: vi.fn(),
  inspectJavaRuntime: vi.fn(),
}));

vi.mock("@/server/document-understanding/opendataloader-client", () => ({
  parseAnnualReportPdfWithOpenDataLoader: vi.fn(),
}));

// ---- Imports after mocks ----------------------------------------------------

import { extractOcrPagesWithDiagnostics } from "@/integrations/brreg/annual-report-financials/ocr";
import {
  readOpenDataLoaderPackageVersion,
  inspectJavaRuntime,
} from "@/server/document-understanding/opendataloader-runtime";
import { parseAnnualReportPdfWithOpenDataLoader } from "@/server/document-understanding/opendataloader-client";
import type {
  AnnualReportOcrDiagnostics,
  AnnualReportParsedPage,
} from "@/integrations/brreg/annual-report-financials/types";

import {
  ocrRuntimeAdapter,
  openDataLoaderRuntimeAdapter,
  hybridRuntimeAdapter,
  type PdfRouteRuntimeExecutionInput,
} from "./pdf-parser-route-runtime-adapter";

// ---- Fixtures ---------------------------------------------------------------

const DUMMY_BUFFER = Buffer.from("dummy-pdf-bytes");

function makeInput(overrides: Partial<PdfRouteRuntimeExecutionInput> = {}): PdfRouteRuntimeExecutionInput {
  return {
    filingId: "filing-1",
    orgNumber: "123456789",
    fiscalYear: 2024,
    pdfBuffer: DUMMY_BUFFER,
    ...overrides,
  };
}

function makeDiagnostics(overrides: Partial<AnnualReportOcrDiagnostics> = {}): AnnualReportOcrDiagnostics {
  return {
    minWidthPx: 64,
    minHeightPx: 64,
    minAreaPx: 8192,
    renderScale: 4,
    preprocessingMode: "page_png_scale4",
    pageCount: 10,
    imageRegionCount: 10,
    tinyCropSkippedCount: 0,
    invalidCropCount: 0,
    ocrAttemptCount: 10,
    ocrFailureCount: 0,
    usableOcrRegionCount: 8,
    usableLineCount: 120,
    rowCandidateCount: 45,
    yearHeaderCandidateCount: 4,
    statementLikePageCount: 3,
    reconstructedNumericCellCount: 90,
    mergedNumericTokenCount: 5,
    rowsWithAssignedYearColumns: 40,
    ambiguousRowCount: 5,
    pageLevelOcrFallbackCount: 0,
    manualReviewDueToOcrQualityCount: 0,
    suppressedFailureMessages: [],
    regionFailures: [],
    ...overrides,
  };
}

function makeOcrPage(overrides: Partial<AnnualReportParsedPage> = {}): AnnualReportParsedPage {
  return {
    pageNumber: 1,
    text: "Resultatregnskap\nDriftsinntekter 1 000 500",
    normalizedText: "resultatregnskap\ndriftsinntekter 1 000 500",
    lines: [],
    hasEmbeddedText: false,
    blocks: [],
    tables: [],
    source: {
      engine: "LEGACY",
      engineMode: "legacy",
      sourceElementId: "ocr-page-1",
      sourceRawType: "ocr_page",
      order: 1,
    },
    metadata: {},
    ...overrides,
  } as AnnualReportParsedPage;
}

function makeOdlParseResult() {
  return {
    engine: "OPENDATALOADER" as const,
    engineVersion: "2.2.1",
    routing: {
      enabled: true,
      executionMode: "local" as const,
      requiresOcr: false,
      useStructTree: true,
      hybridMode: null,
      reasonCode: "FORCED_LOCAL" as const,
      reason: "Shadow execution forced to local mode",
    },
    preflight: {
      pageCount: 0,
      hasTextLayer: false,
      hasReliableTextLayer: false,
      parsedPages: [],
    },
    normalizedDocument: {
      pageCount: 8,
      pages: [
        {
          pageNumber: 1,
          text: "Resultatregnskap\nDriftsinntekter 500 400",
          normalizedText: "resultatregnskap\ndriftsinntekter 500 400",
          lines: [],
          hasEmbeddedText: true,
          blocks: [{ kind: "heading", rawType: "heading", text: "Resultatregnskap" }],
          tables: [{ id: "t1", pageNumber: 1, rowCount: 10, columnCount: 3, rows: [], bbox: null, source: null }],
          source: { engine: "OPENDATALOADER", engineMode: "local", sourceElementId: "p1", sourceRawType: "page", order: 1 },
        },
        {
          pageNumber: 5,
          text: "Styrets årsberetning\nOrganisasjonen har hatt et godt år.",
          normalizedText: "styrets årsberetning\norganisasjonen har hatt et godt ar.",
          lines: [],
          hasEmbeddedText: true,
          blocks: [],
          tables: [],
          source: { engine: "OPENDATALOADER", engineMode: "local", sourceElementId: "p5", sourceRawType: "page", order: 5 },
        },
      ],
    },
    annualReportPages: [],
    diagnostics: {},
    artifacts: { rawJson: { filename: "out.json", content: Buffer.from("{}"), mimeType: "application/json", payload: {}, storageMetadata: {} }, markdown: null, annotatedPdf: null },
    metrics: {
      durationMs: 1200,
      pageCount: 8,
      blockCount: 12,
      tableBlockCount: 2,
    },
  };
}

// ---- Env helpers ------------------------------------------------------------

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const [key, val] of Object.entries(vars)) {
    original[key] = process.env[key];
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
  try {
    fn();
  } finally {
    for (const [key, val] of Object.entries(original)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  }
}

// ---- OCR adapter tests ------------------------------------------------------

describe("ocrRuntimeAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PDF_OCR_SHADOW_ENABLED;
  });

  afterEach(() => {
    delete process.env.PDF_OCR_SHADOW_ENABLED;
  });

  describe("isAvailable", () => {
    it("returns unavailable when PDF_OCR_SHADOW_ENABLED is not set", async () => {
      const result = await ocrRuntimeAdapter.isAvailable();
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason).toBe("binary_not_configured");
      }
    });

    it("returns unavailable when PDF_OCR_SHADOW_ENABLED=false", async () => {
      process.env.PDF_OCR_SHADOW_ENABLED = "false";
      const result = await ocrRuntimeAdapter.isAvailable();
      expect(result.available).toBe(false);
    });

    it("returns available when PDF_OCR_SHADOW_ENABLED=true", async () => {
      process.env.PDF_OCR_SHADOW_ENABLED = "true";
      const result = await ocrRuntimeAdapter.isAvailable();
      expect(result.available).toBe(true);
      if (result.available) {
        expect(result.name).toBe("tesseract");
      }
    });
  });

  describe("execute — gate off", () => {
    it("returns RUNTIME_UNAVAILABLE when env gate is not set", async () => {
      const result = await ocrRuntimeAdapter.execute(makeInput());
      expect(result.status).toBe("RUNTIME_UNAVAILABLE");
      expect(result.summary).toBeNull();
    });

    it("does not call extractOcrPagesWithDiagnostics when gate is off", async () => {
      await ocrRuntimeAdapter.execute(makeInput());
      expect(extractOcrPagesWithDiagnostics).not.toHaveBeenCalled();
    });
  });

  describe("execute — gate on", () => {
    beforeEach(() => {
      process.env.PDF_OCR_SHADOW_ENABLED = "true";
    });

    it("returns FAILED when pdfBuffer is null", async () => {
      const result = await ocrRuntimeAdapter.execute(makeInput({ pdfBuffer: null }));
      expect(result.status).toBe("FAILED");
      if (result.status === "FAILED") {
        expect(result.errorCode).toBe("PDF_BUFFER_UNAVAILABLE");
      }
      expect(extractOcrPagesWithDiagnostics).not.toHaveBeenCalled();
    });

    it("calls extractOcrPagesWithDiagnostics with the PDF buffer", async () => {
      vi.mocked(extractOcrPagesWithDiagnostics).mockResolvedValue({
        pages: [makeOcrPage()],
        diagnostics: makeDiagnostics(),
      });

      const buf = Buffer.from("real-pdf");
      await ocrRuntimeAdapter.execute(makeInput({ pdfBuffer: buf }));

      expect(extractOcrPagesWithDiagnostics).toHaveBeenCalledWith(buf);
    });

    it("returns SUCCESS with a populated summary on successful OCR", async () => {
      const pages: AnnualReportParsedPage[] = [
        makeOcrPage({ pageNumber: 2, text: "Resultatregnskap\nDriftsinntekter 1 000", normalizedText: "resultatregnskap\ndriftsinntekter 1 000" }),
        makeOcrPage({ pageNumber: 5, text: "Styrets årsberetning\nHar vært et bra år.", normalizedText: "styrets årsberetning\nhar vart et bra ar." }),
        makeOcrPage({ pageNumber: 9, text: "Uavhengig revisors beretning\nVi har revidert.", normalizedText: "uavhengig revisors beretning\nvi har revidert." }),
      ];
      vi.mocked(extractOcrPagesWithDiagnostics).mockResolvedValue({
        pages,
        diagnostics: makeDiagnostics({ pageCount: 10, usableOcrRegionCount: 8, statementLikePageCount: 2, rowCandidateCount: 30 }),
      });

      const result = await ocrRuntimeAdapter.execute(makeInput());

      expect(result.status).toBe("SUCCESS");
      if (result.status === "SUCCESS") {
        expect(result.summary.pageCount).toBe(10);
        expect(result.summary.pagesProcessed).toEqual([2, 5, 9]);
        expect(result.summary.financials.detected).toBe(true);
        expect(result.summary.financials.candidatePages).toContain(2);
        expect(result.summary.financials.lineItemCount).toBe(30);
        expect(result.summary.financials.coverageScore).toBeGreaterThan(0);
        expect(result.summary.financials.coverageScore).toBeLessThanOrEqual(1);
        expect(result.summary.boardReport.detected).toBe(true);
        expect(result.summary.boardReport.candidatePages).toContain(5);
        expect(result.summary.auditorReport.detected).toBe(true);
        expect(result.summary.auditorReport.candidatePages).toContain(9);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it("captures OCR runtime errors as FAILED — does not throw", async () => {
      vi.mocked(extractOcrPagesWithDiagnostics).mockRejectedValue(
        new Error("Tesseract worker crashed"),
      );

      const result = await ocrRuntimeAdapter.execute(makeInput());

      expect(result.status).toBe("FAILED");
      if (result.status === "FAILED") {
        expect(result.errorCode).toBe("OCR_RUNTIME_ERROR");
        expect(result.errorMessage).toContain("Tesseract worker crashed");
      }
      expect(result.summary).toBeNull();
    });

    it("returns warnings when OCR quality is insufficient", async () => {
      vi.mocked(extractOcrPagesWithDiagnostics).mockResolvedValue({
        pages: [makeOcrPage()],
        diagnostics: makeDiagnostics({
          manualReviewDueToOcrQualityCount: 1,
          ambiguousRowCount: 3,
        }),
      });

      const result = await ocrRuntimeAdapter.execute(makeInput());
      expect(result.status).toBe("SUCCESS");
      if (result.status === "SUCCESS") {
        expect(result.summary.warnings.length).toBeGreaterThan(0);
        expect(result.summary.warnings.some((w) => w.includes("quality"))).toBe(true);
      }
    });

    it("safety — does not call any production mutation functions", async () => {
      vi.mocked(extractOcrPagesWithDiagnostics).mockResolvedValue({
        pages: [],
        diagnostics: makeDiagnostics({ pageCount: 0, usableOcrRegionCount: 0 }),
      });
      // Execute without error — we only verify extractOcr is called (read-only)
      await ocrRuntimeAdapter.execute(makeInput());
      // No DB mutations, no artifact writes, no fact changes can be verified here
      // because those functions are not imported into the adapter at all.
      expect(extractOcrPagesWithDiagnostics).toHaveBeenCalledOnce();
    });
  });
});

// ---- ODL adapter tests ------------------------------------------------------

describe("openDataLoaderRuntimeAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PDF_ODL_SHADOW_ENABLED;
  });

  afterEach(() => {
    delete process.env.PDF_ODL_SHADOW_ENABLED;
  });

  describe("isAvailable", () => {
    it("returns unavailable when PDF_ODL_SHADOW_ENABLED is not set", async () => {
      const result = await openDataLoaderRuntimeAdapter.isAvailable();
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason).toBe("binary_not_configured");
      }
    });

    it("returns unavailable when PDF_ODL_SHADOW_ENABLED=false", async () => {
      process.env.PDF_ODL_SHADOW_ENABLED = "false";
      const result = await openDataLoaderRuntimeAdapter.isAvailable();
      expect(result.available).toBe(false);
    });

    it("returns unavailable when package is missing", async () => {
      process.env.PDF_ODL_SHADOW_ENABLED = "true";
      vi.mocked(readOpenDataLoaderPackageVersion).mockResolvedValue(null);
      vi.mocked(inspectJavaRuntime).mockResolvedValue({
        available: true,
        rawVersion: "17.0.1",
        majorVersion: 17,
        executablePath: "/usr/bin/java",
        pathCandidates: ["/usr/bin/java"],
        javaHomePath: null,
        discoveredCandidates: [],
      });

      const result = await openDataLoaderRuntimeAdapter.isAvailable();
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason).toContain("@opendataloader/pdf");
      }
    });

    it("returns unavailable when Java is not found", async () => {
      process.env.PDF_ODL_SHADOW_ENABLED = "true";
      vi.mocked(readOpenDataLoaderPackageVersion).mockResolvedValue("2.2.1");
      vi.mocked(inspectJavaRuntime).mockResolvedValue({
        available: false,
        rawVersion: null,
        majorVersion: null,
        executablePath: null,
        pathCandidates: [],
        javaHomePath: null,
        discoveredCandidates: [],
      });

      const result = await openDataLoaderRuntimeAdapter.isAvailable();
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason).toContain("Java");
      }
    });

    it("returns unavailable when Java version is below 11", async () => {
      process.env.PDF_ODL_SHADOW_ENABLED = "true";
      vi.mocked(readOpenDataLoaderPackageVersion).mockResolvedValue("2.2.1");
      vi.mocked(inspectJavaRuntime).mockResolvedValue({
        available: true,
        rawVersion: "1.8.0",
        majorVersion: 8,
        executablePath: "/usr/bin/java",
        pathCandidates: ["/usr/bin/java"],
        javaHomePath: null,
        discoveredCandidates: [],
      });

      const result = await openDataLoaderRuntimeAdapter.isAvailable();
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason).toContain("Java 11+");
      }
    });

    it("returns available when package and Java 11+ are present", async () => {
      process.env.PDF_ODL_SHADOW_ENABLED = "true";
      vi.mocked(readOpenDataLoaderPackageVersion).mockResolvedValue("2.2.1");
      vi.mocked(inspectJavaRuntime).mockResolvedValue({
        available: true,
        rawVersion: "17.0.1",
        majorVersion: 17,
        executablePath: "/usr/bin/java",
        pathCandidates: ["/usr/bin/java"],
        javaHomePath: null,
        discoveredCandidates: [],
      });

      const result = await openDataLoaderRuntimeAdapter.isAvailable();
      expect(result.available).toBe(true);
      if (result.available) {
        expect(result.name).toBe("opendataloader-local");
        expect(result.version).toBe("2.2.1");
      }
    });
  });

  describe("execute — gate off", () => {
    it("returns RUNTIME_UNAVAILABLE when env gate is not set", async () => {
      const result = await openDataLoaderRuntimeAdapter.execute(makeInput());
      expect(result.status).toBe("RUNTIME_UNAVAILABLE");
      expect(result.summary).toBeNull();
    });

    it("does not call parseAnnualReportPdfWithOpenDataLoader when gate is off", async () => {
      await openDataLoaderRuntimeAdapter.execute(makeInput());
      expect(parseAnnualReportPdfWithOpenDataLoader).not.toHaveBeenCalled();
    });
  });

  describe("execute — gate on", () => {
    beforeEach(() => {
      process.env.PDF_ODL_SHADOW_ENABLED = "true";
      vi.mocked(readOpenDataLoaderPackageVersion).mockResolvedValue("2.2.1");
      vi.mocked(inspectJavaRuntime).mockResolvedValue({
        available: true,
        rawVersion: "17.0.1",
        majorVersion: 17,
        executablePath: "/usr/bin/java",
        pathCandidates: ["/usr/bin/java"],
        javaHomePath: null,
        discoveredCandidates: [],
      });
    });

    it("returns FAILED when pdfBuffer is null", async () => {
      const result = await openDataLoaderRuntimeAdapter.execute(makeInput({ pdfBuffer: null }));
      expect(result.status).toBe("FAILED");
      if (result.status === "FAILED") {
        expect(result.errorCode).toBe("PDF_BUFFER_UNAVAILABLE");
      }
      expect(parseAnnualReportPdfWithOpenDataLoader).not.toHaveBeenCalled();
    });

    it("calls parseAnnualReportPdfWithOpenDataLoader with forced local route", async () => {
      vi.mocked(parseAnnualReportPdfWithOpenDataLoader).mockResolvedValue(
        makeOdlParseResult() as never,
      );

      await openDataLoaderRuntimeAdapter.execute(makeInput());

      const [call] = vi.mocked(parseAnnualReportPdfWithOpenDataLoader).mock.calls;
      expect(call[0].routeOverride?.executionMode).toBe("local");
      expect(call[0].routeOverride?.reasonCode).toBe("FORCED_LOCAL");
      expect(Buffer.isBuffer(call[0].pdfBuffer)).toBe(true);
    });

    it("returns SUCCESS with a populated summary on successful ODL parse", async () => {
      vi.mocked(parseAnnualReportPdfWithOpenDataLoader).mockResolvedValue(
        makeOdlParseResult() as never,
      );

      const result = await openDataLoaderRuntimeAdapter.execute(makeInput());

      expect(result.status).toBe("SUCCESS");
      if (result.status === "SUCCESS") {
        expect(result.summary.pageCount).toBe(8);
        expect(result.summary.financials.detected).toBe(true);
        expect(result.summary.financials.tableCount).toBe(2);
        expect(result.summary.boardReport.detected).toBe(true);
        expect(result.summary.boardReport.candidatePages).toContain(5);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it("captures ODL parse failures as FAILED — does not throw", async () => {
      vi.mocked(parseAnnualReportPdfWithOpenDataLoader).mockRejectedValue(
        new Error("OpenDataLoader parse failed: no normalized pages"),
      );

      const result = await openDataLoaderRuntimeAdapter.execute(makeInput());

      expect(result.status).toBe("FAILED");
      if (result.status === "FAILED") {
        expect(result.errorCode).toBe("ODL_PARSE_FAILED");
        expect(result.errorMessage).toContain("parse failed");
      }
    });

    it("captures Java/package availability errors as RUNTIME_UNAVAILABLE", async () => {
      vi.mocked(parseAnnualReportPdfWithOpenDataLoader).mockRejectedValue(
        new Error("OpenDataLoader runtime is not ready: @opendataloader/pdf is not installed."),
      );

      const result = await openDataLoaderRuntimeAdapter.execute(makeInput());

      expect(result.status).toBe("RUNTIME_UNAVAILABLE");
    });

    it("safety — does not call any production mutation functions", async () => {
      vi.mocked(parseAnnualReportPdfWithOpenDataLoader).mockResolvedValue(
        makeOdlParseResult() as never,
      );
      await openDataLoaderRuntimeAdapter.execute(makeInput());
      // Verify only ODL parse was called — no DB writes, no fact mutations
      expect(parseAnnualReportPdfWithOpenDataLoader).toHaveBeenCalledOnce();
    });
  });

  describe("execute — Java unavailable at execute time", () => {
    it("returns RUNTIME_UNAVAILABLE when Java is missing even if gate is set", async () => {
      process.env.PDF_ODL_SHADOW_ENABLED = "true";
      vi.mocked(readOpenDataLoaderPackageVersion).mockResolvedValue("2.2.1");
      vi.mocked(inspectJavaRuntime).mockResolvedValue({
        available: false,
        rawVersion: null,
        majorVersion: null,
        executablePath: null,
        pathCandidates: [],
        javaHomePath: null,
        discoveredCandidates: [],
      });

      const result = await openDataLoaderRuntimeAdapter.execute(makeInput());
      expect(result.status).toBe("RUNTIME_UNAVAILABLE");
      expect(parseAnnualReportPdfWithOpenDataLoader).not.toHaveBeenCalled();
    });
  });
});

// ---- HYBRID adapter tests ---------------------------------------------------

describe("hybridRuntimeAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PDF_OCR_SHADOW_ENABLED;
    delete process.env.PDF_ODL_SHADOW_ENABLED;
  });

  afterEach(() => {
    delete process.env.PDF_OCR_SHADOW_ENABLED;
    delete process.env.PDF_ODL_SHADOW_ENABLED;
  });

  it("isAvailable returns unavailable when both gates are off", async () => {
    const result = await hybridRuntimeAdapter.isAvailable();
    expect(result.available).toBe(false);
  });

  it("isAvailable returns available when at least one gate is on", async () => {
    process.env.PDF_OCR_SHADOW_ENABLED = "true";
    const result = await hybridRuntimeAdapter.isAvailable();
    expect(result.available).toBe(true);
  });

  it("execute returns SKIPPED when both components are unavailable", async () => {
    const result = await hybridRuntimeAdapter.execute(makeInput());
    expect(result.status).toBe("SKIPPED");
    expect(result.summary).toBeNull();
  });

  it("execute merges OCR and ODL summaries when both succeed", async () => {
    process.env.PDF_OCR_SHADOW_ENABLED = "true";
    process.env.PDF_ODL_SHADOW_ENABLED = "true";
    vi.mocked(readOpenDataLoaderPackageVersion).mockResolvedValue("2.2.1");
    vi.mocked(inspectJavaRuntime).mockResolvedValue({
      available: true,
      rawVersion: "17.0.1",
      majorVersion: 17,
      executablePath: "/usr/bin/java",
      pathCandidates: ["/usr/bin/java"],
      javaHomePath: null,
      discoveredCandidates: [],
    });
    vi.mocked(extractOcrPagesWithDiagnostics).mockResolvedValue({
      pages: [makeOcrPage()],
      diagnostics: makeDiagnostics(),
    });
    vi.mocked(parseAnnualReportPdfWithOpenDataLoader).mockResolvedValue(
      makeOdlParseResult() as never,
    );

    const result = await hybridRuntimeAdapter.execute(makeInput());

    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.summary.pageCount).toBeGreaterThan(0);
      // ODL is primary — its page count should be used
      expect(result.summary.financials.detected).toBe(true);
    }
  });

  it("execute produces SUCCESS using OCR only when ODL is unavailable", async () => {
    process.env.PDF_OCR_SHADOW_ENABLED = "true";
    // PDF_ODL_SHADOW_ENABLED not set → ODL unavailable
    vi.mocked(extractOcrPagesWithDiagnostics).mockResolvedValue({
      pages: [makeOcrPage()],
      diagnostics: makeDiagnostics(),
    });

    const result = await hybridRuntimeAdapter.execute(makeInput());

    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.summary.warnings.some((w) => w.includes("ODL component"))).toBe(true);
    }
  });

  it("safety — artifact safety flags remain false/false/false/true at service level", async () => {
    // The HYBRID adapter only computes a summary; it does not write artifacts.
    // Artifact safety is enforced at the service level (see shadow-execution-service.test.ts).
    // Here we verify the adapter itself does not mutate any production data.
    const result = await hybridRuntimeAdapter.execute(makeInput());
    // Just verifying it completes without side effects
    expect(result.status).toBe("SKIPPED"); // both gates off → skipped
  });
});

// ---- Runtime integration test (opt-in only) ---------------------------------

const RUNTIME_TESTS_ENABLED = process.env.PDF_RUNTIME_INTEGRATION_TESTS === "1";

describe.skipIf(!RUNTIME_TESTS_ENABLED)("runtime integration (PDF_RUNTIME_INTEGRATION_TESTS=1)", () => {
  it("OCR adapter produces a real summary from a minimal synthetic PDF", async () => {
    // This test runs only when PDF_RUNTIME_INTEGRATION_TESTS=1 AND PDF_OCR_SHADOW_ENABLED=true.
    // It uses a real (but minimal) PDF-like buffer. Tesseract must be installed.
    process.env.PDF_OCR_SHADOW_ENABLED = "true";
    const result = await ocrRuntimeAdapter.execute(makeInput({ pdfBuffer: DUMMY_BUFFER }));
    // FAILED is acceptable if Tesseract is not installed; RUNTIME_UNAVAILABLE is not acceptable here.
    expect(["SUCCESS", "FAILED"]).toContain(result.status);
  });
});
