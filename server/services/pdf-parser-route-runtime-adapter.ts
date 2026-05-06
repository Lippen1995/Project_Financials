import {
  extractOcrPagesWithDiagnostics,
} from "@/integrations/brreg/annual-report-financials/ocr";
import type {
  AnnualReportOcrDiagnostics,
  AnnualReportParsedPage,
} from "@/integrations/brreg/annual-report-financials/types";

export type PdfShadowExecutionRoute = "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID";

export type PdfShadowExecutionStatus = "SUCCESS" | "RUNTIME_UNAVAILABLE" | "FAILED" | "SKIPPED";

export type PdfRouteRuntimeAvailability =
  | { available: true; name: string; version?: string | undefined }
  | { available: false; reason: string };

export type PdfRouteRuntimeExecutionInput = {
  filingId: string;
  orgNumber: string;
  fiscalYear: number;
  /** Raw PDF bytes. Null when not available — adapters that require it must return FAILED. */
  pdfBuffer: Buffer | null;
};

export type PdfRouteShadowSectionSummary = {
  detected: boolean;
  candidatePages: number[];
  charCount?: number | undefined;
};

export type PdfRouteShadowFinancialSummary = {
  detected: boolean;
  candidatePages: number[];
  lineItemCount: number;
  tableCount: number;
  coverageScore: number;
};

export type PdfRouteShadowSummary = {
  pageCount: number;
  pagesProcessed: number[];
  financials: PdfRouteShadowFinancialSummary;
  boardReport: PdfRouteShadowSectionSummary;
  auditorReport: PdfRouteShadowSectionSummary;
  warnings: string[];
  errors: string[];
};

export type PdfRouteRuntimeExecutionResult =
  | {
      status: "SUCCESS";
      durationMs: number;
      summary: PdfRouteShadowSummary;
    }
  | {
      status: "RUNTIME_UNAVAILABLE";
      durationMs: 0;
      runtime: { available: false; reason: string };
      summary: null;
    }
  | {
      status: "FAILED";
      durationMs: number;
      errorCode: string;
      errorMessage: string;
      summary: null;
    }
  | {
      status: "SKIPPED";
      durationMs: 0;
      reason: string;
      summary: null;
    };

export interface PdfParserRouteRuntimeAdapter {
  route: PdfShadowExecutionRoute;
  isAvailable(): Promise<PdfRouteRuntimeAvailability>;
  execute(input: PdfRouteRuntimeExecutionInput): Promise<PdfRouteRuntimeExecutionResult>;
}

// ---- OCR shadow summary builder ---------------------------------------------

const FINANCIAL_SECTION_PATTERN =
  /resultatregnskap|balanseoppsett|balanse|egenkapital og gjeld|egenkapital|inntekter|driftsinntekt|driftsresultat/i;
const BOARD_REPORT_PATTERN =
  /styrets\s{0,4}(årsberetning|arsberetning|beretning)|styremelding/i;
const AUDITOR_REPORT_PATTERN =
  /uavhengig\s{0,4}revisors?\s{0,4}(beretning|rapport)|revisors\s{0,4}beretning/i;

function buildOcrShadowSummary(
  pages: AnnualReportParsedPage[],
  diagnostics: AnnualReportOcrDiagnostics,
): PdfRouteShadowSummary {
  const financialPages: number[] = [];
  const boardPages: number[] = [];
  const auditorPages: number[] = [];

  for (const page of pages) {
    const text = page.normalizedText ?? page.text;
    if (FINANCIAL_SECTION_PATTERN.test(text)) financialPages.push(page.pageNumber);
    if (BOARD_REPORT_PATTERN.test(text)) boardPages.push(page.pageNumber);
    if (AUDITOR_REPORT_PATTERN.test(text)) auditorPages.push(page.pageNumber);
  }

  // Supplement financial page detection with OCR diagnostics
  const hasStatementLikePages = diagnostics.statementLikePageCount > 0;
  if (hasStatementLikePages && financialPages.length === 0) {
    for (const page of pages) {
      if (page.tables.length > 0 && !financialPages.includes(page.pageNumber)) {
        financialPages.push(page.pageNumber);
      }
    }
  }

  const financialsDetected = financialPages.length > 0 || hasStatementLikePages;
  const totalTables = pages.reduce((sum, p) => sum + (p.tables?.length ?? 0), 0);
  const totalLineItems = diagnostics.rowCandidateCount;
  const coverageScore =
    diagnostics.pageCount > 0
      ? Math.min(1, diagnostics.usableOcrRegionCount / diagnostics.pageCount)
      : 0;

  const warnings: string[] = [];
  if (diagnostics.manualReviewDueToOcrQualityCount > 0) {
    warnings.push("OCR quality insufficient for reliable extraction on some pages.");
  }
  if (diagnostics.ambiguousRowCount > 0) {
    warnings.push(
      `${diagnostics.ambiguousRowCount} row(s) had ambiguous column assignment — line item count may be imprecise.`,
    );
  }

  const errors: string[] = diagnostics.regionFailures
    .filter((f) => f.category === "ocr_failure")
    .map((f) => f.message)
    .slice(0, 5);

  if (diagnostics.ocrFailureCount > 0 && errors.length === 0) {
    errors.push(`OCR recognition failed on ${diagnostics.ocrFailureCount} attempt(s).`);
  }

  const boardCharCount = boardPages.reduce((sum, pNum) => {
    const page = pages.find((p) => p.pageNumber === pNum);
    return sum + (page?.text.length ?? 0);
  }, 0);
  const auditorCharCount = auditorPages.reduce((sum, pNum) => {
    const page = pages.find((p) => p.pageNumber === pNum);
    return sum + (page?.text.length ?? 0);
  }, 0);

  return {
    pageCount: diagnostics.pageCount,
    pagesProcessed: pages.map((p) => p.pageNumber),
    financials: {
      detected: financialsDetected,
      candidatePages: financialPages,
      lineItemCount: totalLineItems,
      tableCount: totalTables,
      coverageScore,
    },
    boardReport: {
      detected: boardPages.length > 0,
      candidatePages: boardPages,
      charCount: boardCharCount,
    },
    auditorReport: {
      detected: auditorPages.length > 0,
      candidatePages: auditorPages,
      charCount: auditorCharCount,
    },
    warnings,
    errors,
  };
}

// ---- OCR adapter ------------------------------------------------------------

/**
 * OCR runtime adapter.
 *
 * Env gate: PDF_OCR_SHADOW_ENABLED=true
 *
 * When disabled  → RUNTIME_UNAVAILABLE (reason: binary_not_configured)
 * When enabled but no PDF buffer → FAILED (reason: PDF_BUFFER_UNAVAILABLE)
 * When OCR fails at runtime → FAILED (captured; not a pipeline crash)
 *
 * Example (dry-run, gate off):
 *   PDF_OCR_SHADOW_ENABLED=false npm run run:pdf-parser-route-shadow \
 *     -- --annual-report-id=<id> --routes=OCR --reason=dry-run
 *
 * Example (live OCR shadow):
 *   PDF_OCR_SHADOW_ENABLED=true npm run run:pdf-parser-route-shadow \
 *     -- --annual-report-id=<id> --routes=OCR --reason=sampling
 */
export const ocrRuntimeAdapter: PdfParserRouteRuntimeAdapter = {
  route: "OCR",
  async isAvailable() {
    if (process.env.PDF_OCR_SHADOW_ENABLED === "true") {
      return {
        available: true,
        name: "tesseract",
        version: process.env.PDF_OCR_VERSION ?? "unknown",
      };
    }
    return { available: false, reason: "binary_not_configured" };
  },
  async execute(input) {
    const availability = await ocrRuntimeAdapter.isAvailable();
    if (!availability.available) {
      return {
        status: "RUNTIME_UNAVAILABLE",
        durationMs: 0,
        runtime: availability,
        summary: null,
      };
    }

    if (!input.pdfBuffer) {
      return {
        status: "FAILED",
        durationMs: 0,
        errorCode: "PDF_BUFFER_UNAVAILABLE",
        errorMessage:
          "No PDF buffer was provided to the OCR adapter. Ensure the filing has a PDF artifact and readPdfBuffer is configured.",
        summary: null,
      };
    }

    const start = Date.now();
    try {
      const { pages, diagnostics } = await extractOcrPagesWithDiagnostics(input.pdfBuffer);
      const summary = buildOcrShadowSummary(pages, diagnostics);
      return {
        status: "SUCCESS",
        durationMs: Date.now() - start,
        summary,
      };
    } catch (err) {
      return {
        status: "FAILED",
        durationMs: Date.now() - start,
        errorCode: "OCR_RUNTIME_ERROR",
        errorMessage:
          err instanceof Error ? err.message.slice(0, 500) : "Unknown OCR runtime error",
        summary: null,
      };
    }
  },
};

// ---- OpenDataLoader adapter -------------------------------------------------

/**
 * OpenDataLoader local runtime adapter.
 *
 * Env gate: PDF_ODL_SHADOW_ENABLED=true
 *
 * When disabled              → RUNTIME_UNAVAILABLE (reason: binary_not_configured)
 * When Java/package missing  → RUNTIME_UNAVAILABLE (reason describes gap)
 * When no PDF buffer         → FAILED (reason: PDF_BUFFER_UNAVAILABLE)
 * When ODL parse fails       → FAILED (captured; not a pipeline crash)
 *
 * Example (dry-run, gate off):
 *   PDF_ODL_SHADOW_ENABLED=false npm run run:pdf-parser-route-shadow \
 *     -- --annual-report-id=<id> --routes=OPENDATALOADER_LOCAL --reason=dry-run
 *
 * Example (live ODL shadow):
 *   PDF_ODL_SHADOW_ENABLED=true npm run run:pdf-parser-route-shadow \
 *     -- --annual-report-id=<id> --routes=OPENDATALOADER_LOCAL --reason=sampling
 */
export const openDataLoaderRuntimeAdapter: PdfParserRouteRuntimeAdapter = {
  route: "OPENDATALOADER_LOCAL",
  async isAvailable() {
    if (process.env.PDF_ODL_SHADOW_ENABLED !== "true") {
      return { available: false, reason: "binary_not_configured" };
    }
    // Lazily import runtime inspection to avoid loading Java detection on cold start
    const { readOpenDataLoaderPackageVersion, inspectJavaRuntime } = await import(
      "@/server/document-understanding/opendataloader-runtime"
    );
    const [packageVersion, java] = await Promise.all([
      readOpenDataLoaderPackageVersion(),
      inspectJavaRuntime(),
    ]);
    if (!packageVersion) {
      return { available: false, reason: "@opendataloader/pdf package not installed" };
    }
    if (!java.available) {
      return {
        available: false,
        reason: `Java runtime not found on PATH; OpenDataLoader local mode requires Java 11+`,
      };
    }
    if ((java.majorVersion ?? 0) < 11) {
      return {
        available: false,
        reason: `Java ${java.rawVersion ?? "unknown"} detected; OpenDataLoader local mode requires Java 11+`,
      };
    }
    return {
      available: true,
      name: "opendataloader-local",
      version: packageVersion,
    };
  },
  async execute(input) {
    const availability = await openDataLoaderRuntimeAdapter.isAvailable();
    if (!availability.available) {
      return {
        status: "RUNTIME_UNAVAILABLE",
        durationMs: 0,
        runtime: availability,
        summary: null,
      };
    }

    if (!input.pdfBuffer) {
      return {
        status: "FAILED",
        durationMs: 0,
        errorCode: "PDF_BUFFER_UNAVAILABLE",
        errorMessage:
          "No PDF buffer was provided to the OpenDataLoader adapter. Ensure readPdfBuffer is configured.",
        summary: null,
      };
    }

    const start = Date.now();
    try {
      const { parseAnnualReportPdfWithOpenDataLoader } = await import(
        "@/server/document-understanding/opendataloader-client"
      );
      const parseResult = await parseAnnualReportPdfWithOpenDataLoader({
        pdfBuffer: input.pdfBuffer,
        sourceFilename: `${input.orgNumber}_${input.fiscalYear}_shadow.pdf`,
        // Minimal synthetic preflight — ODL determines structure itself.
        // We override route to "local" so preflight reliability flags are advisory only.
        preflight: {
          pageCount: 0,
          hasTextLayer: false,
          hasReliableTextLayer: false,
          parsedPages: [],
        },
        routeOverride: {
          enabled: true,
          executionMode: "local",
          requiresOcr: false,
          useStructTree: true,
          hybridMode: null,
          reasonCode: "FORCED_LOCAL",
          reason: "Shadow execution forced to local mode by PDF_ODL_SHADOW_ENABLED=true",
        },
      });

      const summary = buildOdlShadowSummary(parseResult);
      return {
        status: "SUCCESS",
        durationMs: Date.now() - start,
        summary,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message.slice(0, 500) : "Unknown OpenDataLoader error";
      // Distinguish Java/package availability failures from parse failures
      const isAvailabilityError =
        errorMessage.includes("@opendataloader/pdf") ||
        errorMessage.includes("Java") ||
        errorMessage.includes("OpenDataLoader runtime is not ready");
      if (isAvailabilityError) {
        return {
          status: "RUNTIME_UNAVAILABLE",
          durationMs: Date.now() - start,
          runtime: { available: false, reason: errorMessage.slice(0, 200) },
          summary: null,
        };
      }
      return {
        status: "FAILED",
        durationMs: Date.now() - start,
        errorCode: "ODL_PARSE_FAILED",
        errorMessage,
        summary: null,
      };
    }
  },
};

// ---- ODL shadow summary builder ---------------------------------------------

type OdlParseResult = Awaited<
  ReturnType<typeof import("@/server/document-understanding/opendataloader-client")["parseAnnualReportPdfWithOpenDataLoader"]>
>;

function buildOdlShadowSummary(parseResult: OdlParseResult): PdfRouteShadowSummary {
  const doc = parseResult.normalizedDocument;
  const pages = doc.pages;
  const metrics = parseResult.metrics;

  const financialPages: number[] = [];
  const boardPages: number[] = [];
  const auditorPages: number[] = [];
  let totalLineItems = 0;

  for (const page of pages) {
    const text = page.text ?? "";
    const normalized = text.toLowerCase();

    if (FINANCIAL_SECTION_PATTERN.test(normalized)) {
      financialPages.push(page.pageNumber);
    }
    if (BOARD_REPORT_PATTERN.test(normalized)) {
      boardPages.push(page.pageNumber);
    }
    if (AUDITOR_REPORT_PATTERN.test(normalized)) {
      auditorPages.push(page.pageNumber);
    }

    for (const table of page.tables ?? []) {
      // Count data rows (exclude header row from line item count)
      const dataRows = (table.rows ?? []).filter(
        (r) => !r.cells?.some((c) => c.role === "year_header"),
      );
      totalLineItems += dataRows.length;
    }
  }

  const financialsDetected = financialPages.length > 0;
  const totalTables = metrics.tableBlockCount;
  const pageCount = metrics.pageCount;
  const coverageScore =
    pageCount > 0
      ? Math.min(1, (financialPages.length + boardPages.length + auditorPages.length) / pageCount)
      : 0;

  const warnings: string[] = [];
  if (metrics.blockCount === 0) {
    warnings.push("OpenDataLoader returned no blocks — document may be image-only or malformed.");
  }
  if (totalTables === 0 && financialsDetected) {
    warnings.push(
      "Financial section keywords detected but no tables found — table extraction may be incomplete.",
    );
  }

  const boardCharCount = boardPages.reduce((sum, pNum) => {
    const page = pages.find((p) => p.pageNumber === pNum);
    return sum + (page?.text?.length ?? 0);
  }, 0);
  const auditorCharCount = auditorPages.reduce((sum, pNum) => {
    const page = pages.find((p) => p.pageNumber === pNum);
    return sum + (page?.text?.length ?? 0);
  }, 0);

  return {
    pageCount,
    pagesProcessed: pages.map((p) => p.pageNumber),
    financials: {
      detected: financialsDetected,
      candidatePages: financialPages,
      lineItemCount: totalLineItems,
      tableCount: totalTables,
      coverageScore,
    },
    boardReport: {
      detected: boardPages.length > 0,
      candidatePages: boardPages,
      charCount: boardCharCount,
    },
    auditorReport: {
      detected: auditorPages.length > 0,
      candidatePages: auditorPages,
      charCount: auditorCharCount,
    },
    warnings,
    errors: [],
  };
}

// ---- HYBRID adapter ---------------------------------------------------------

/**
 * HYBRID adapter — combines lightweight signals from OCR and ODL.
 *
 * Conservative: only produces a combined summary when at least one component
 * route succeeds. Does NOT create a new production parser path.
 *
 * When both OCR and ODL are unavailable → SKIPPED
 * When either produces a SUCCESS summary, the summaries are merged.
 *
 * Example (both gates open):
 *   PDF_OCR_SHADOW_ENABLED=true PDF_ODL_SHADOW_ENABLED=true \
 *   npm run run:pdf-parser-route-shadow \
 *     -- --annual-report-id=<id> --routes=HYBRID --reason=hybrid-sampling
 */
export const hybridRuntimeAdapter: PdfParserRouteRuntimeAdapter = {
  route: "HYBRID",
  async isAvailable() {
    const [ocr, odl] = await Promise.all([
      ocrRuntimeAdapter.isAvailable(),
      openDataLoaderRuntimeAdapter.isAvailable(),
    ]);
    if (ocr.available || odl.available) {
      return { available: true, name: "hybrid", version: "composite" };
    }
    return { available: false, reason: "no_component_runtime_configured" };
  },
  async execute(input) {
    const availability = await hybridRuntimeAdapter.isAvailable();
    if (!availability.available) {
      return {
        status: "SKIPPED",
        durationMs: 0,
        reason: "no_component_runtime_configured",
        summary: null,
      };
    }

    const start = Date.now();
    const [ocrResult, odlResult] = await Promise.all([
      ocrRuntimeAdapter.execute(input),
      openDataLoaderRuntimeAdapter.execute(input),
    ]);

    const ocrSummary = ocrResult.status === "SUCCESS" ? ocrResult.summary : null;
    const odlSummary = odlResult.status === "SUCCESS" ? odlResult.summary : null;

    if (!ocrSummary && !odlSummary) {
      return {
        status: "SKIPPED",
        durationMs: Date.now() - start,
        reason: "all_component_routes_unavailable_or_failed",
        summary: null,
      };
    }

    // Merge summaries: prefer ODL for structure, OCR as fallback
    const primary = odlSummary ?? ocrSummary!;
    const secondary = odlSummary ? ocrSummary : null;

    const mergedWarnings: string[] = [
      ...(ocrSummary ? [] : ["OCR component unavailable or failed — hybrid uses ODL only."]),
      ...(odlSummary ? [] : ["ODL component unavailable or failed — hybrid uses OCR only."]),
      ...primary.warnings,
      ...(secondary?.warnings ?? []),
    ];

    const mergedSummary: PdfRouteShadowSummary = {
      pageCount: Math.max(primary.pageCount, secondary?.pageCount ?? 0),
      pagesProcessed: Array.from(
        new Set([...primary.pagesProcessed, ...(secondary?.pagesProcessed ?? [])]),
      ).sort((a, b) => a - b),
      financials: {
        detected: primary.financials.detected || (secondary?.financials.detected ?? false),
        candidatePages: Array.from(
          new Set([
            ...primary.financials.candidatePages,
            ...(secondary?.financials.candidatePages ?? []),
          ]),
        ).sort((a, b) => a - b),
        lineItemCount: Math.max(
          primary.financials.lineItemCount,
          secondary?.financials.lineItemCount ?? 0,
        ),
        tableCount: Math.max(primary.financials.tableCount, secondary?.financials.tableCount ?? 0),
        coverageScore: Math.max(
          primary.financials.coverageScore,
          secondary?.financials.coverageScore ?? 0,
        ),
      },
      boardReport: {
        detected:
          primary.boardReport.detected || (secondary?.boardReport.detected ?? false),
        candidatePages: Array.from(
          new Set([
            ...primary.boardReport.candidatePages,
            ...(secondary?.boardReport.candidatePages ?? []),
          ]),
        ).sort((a, b) => a - b),
        charCount: Math.max(
          primary.boardReport.charCount ?? 0,
          secondary?.boardReport.charCount ?? 0,
        ),
      },
      auditorReport: {
        detected:
          primary.auditorReport.detected || (secondary?.auditorReport.detected ?? false),
        candidatePages: Array.from(
          new Set([
            ...primary.auditorReport.candidatePages,
            ...(secondary?.auditorReport.candidatePages ?? []),
          ]),
        ).sort((a, b) => a - b),
        charCount: Math.max(
          primary.auditorReport.charCount ?? 0,
          secondary?.auditorReport.charCount ?? 0,
        ),
      },
      warnings: mergedWarnings,
      errors: [
        ...(ocrResult.status === "FAILED" ? [`OCR: ${ocrResult.errorMessage}`] : []),
        ...(odlResult.status === "FAILED" ? [`ODL: ${odlResult.errorMessage}`] : []),
      ],
    };

    return {
      status: "SUCCESS",
      durationMs: Date.now() - start,
      summary: mergedSummary,
    };
  },
};

// ---- Exports ----------------------------------------------------------------

export const DEFAULT_ROUTE_ADAPTERS: Record<PdfShadowExecutionRoute, PdfParserRouteRuntimeAdapter> =
  {
    OCR: ocrRuntimeAdapter,
    OPENDATALOADER_LOCAL: openDataLoaderRuntimeAdapter,
    HYBRID: hybridRuntimeAdapter,
  };

export const VALID_SHADOW_ROUTES: readonly PdfShadowExecutionRoute[] = [
  "OCR",
  "OPENDATALOADER_LOCAL",
  "HYBRID",
];

export function isValidShadowRoute(value: string): value is PdfShadowExecutionRoute {
  return VALID_SHADOW_ROUTES.includes(value as PdfShadowExecutionRoute);
}
