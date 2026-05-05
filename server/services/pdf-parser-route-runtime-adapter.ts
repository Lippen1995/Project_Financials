export type PdfShadowExecutionRoute = "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID";

export type PdfShadowExecutionStatus = "SUCCESS" | "RUNTIME_UNAVAILABLE" | "FAILED" | "SKIPPED";

export type PdfRouteRuntimeAvailability =
  | { available: true; name: string; version?: string | undefined }
  | { available: false; reason: string };

export type PdfRouteRuntimeExecutionInput = {
  filingId: string;
  orgNumber: string;
  fiscalYear: number;
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

// OCR adapter — checks PDF_OCR_SHADOW_ENABLED env var; returns RUNTIME_UNAVAILABLE if unset.
export const ocrRuntimeAdapter: PdfParserRouteRuntimeAdapter = {
  route: "OCR",
  async isAvailable() {
    if (process.env.PDF_OCR_SHADOW_ENABLED === "true") {
      return { available: true, name: "tesseract", version: process.env.PDF_OCR_VERSION ?? "unknown" };
    }
    return { available: false, reason: "binary_not_configured" };
  },
  async execute(input) {
    const availability = await ocrRuntimeAdapter.isAvailable();
    if (!availability.available) {
      return { status: "RUNTIME_UNAVAILABLE", durationMs: 0, runtime: availability, summary: null };
    }
    // OCR execution not wired in this PR — adapter skeleton only.
    const start = Date.now();
    void input;
    return {
      status: "RUNTIME_UNAVAILABLE",
      durationMs: 0,
      runtime: { available: false, reason: "execution_not_implemented" },
      summary: null,
    };
    void start;
  },
};

// OpenDataLoader adapter — checks PDF_ODL_SHADOW_ENABLED env var; returns RUNTIME_UNAVAILABLE if unset.
export const openDataLoaderRuntimeAdapter: PdfParserRouteRuntimeAdapter = {
  route: "OPENDATALOADER_LOCAL",
  async isAvailable() {
    if (process.env.PDF_ODL_SHADOW_ENABLED === "true") {
      return {
        available: true,
        name: "opendataloader-local",
        version: process.env.PDF_ODL_VERSION ?? "unknown",
      };
    }
    return { available: false, reason: "binary_not_configured" };
  },
  async execute(input) {
    const availability = await openDataLoaderRuntimeAdapter.isAvailable();
    if (!availability.available) {
      return { status: "RUNTIME_UNAVAILABLE", durationMs: 0, runtime: availability, summary: null };
    }
    void input;
    return {
      status: "RUNTIME_UNAVAILABLE",
      durationMs: 0,
      runtime: { available: false, reason: "execution_not_implemented" },
      summary: null,
    };
  },
};

// HYBRID adapter — requires both OCR and ODL; returns SKIPPED if neither is configured.
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
    void input;
    return {
      status: "SKIPPED",
      durationMs: 0,
      reason: "hybrid_execution_not_implemented",
      summary: null,
    };
  },
};

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
