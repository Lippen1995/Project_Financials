import type { AnnualReportFiling, FinancialExtractionRun } from "@prisma/client";

import { getAnnualReportFilingWithArtifacts } from "@/server/persistence/annual-report-ingestion-repository";
import {
  createPdfModelArtifactSnapshot,
} from "@/server/persistence/pdf-model-artifact-snapshot-repository";
import {
  DEFAULT_ROUTE_ADAPTERS,
  isValidShadowRoute,
  type PdfParserRouteRuntimeAdapter,
  type PdfRouteRuntimeAvailability,
  type PdfRouteRuntimeExecutionResult,
  type PdfShadowExecutionRoute,
  type PdfShadowExecutionStatus,
  VALID_SHADOW_ROUTES,
} from "@/server/services/pdf-parser-route-runtime-adapter";

export { VALID_SHADOW_ROUTES, isValidShadowRoute };

export type PdfParserRouteShadowExecutionInput = {
  annualReportId: string;
  requestedRoutes: PdfShadowExecutionRoute[];
  requestedBy?: string | null;
  reason?: string | null;
  source?: string | null;
  runId?: string | null;
};

export class PdfParserRouteShadowExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfParserRouteShadowExecutionError";
  }
}

export class PdfParserRouteShadowExecutionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfParserRouteShadowExecutionValidationError";
  }
}

export type PdfParserRouteShadowExecutionRouteResult = {
  route: PdfShadowExecutionRoute;
  status: PdfShadowExecutionStatus;
  runtime: PdfRouteRuntimeAvailability | null;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  summary: PdfRouteRuntimeExecutionResult extends { status: "SUCCESS"; summary: infer S }
    ? S | null
    : null;
};

type ArtifactRouteEntry = {
  route: PdfShadowExecutionRoute;
  status: PdfShadowExecutionStatus;
  runtime: Record<string, unknown>;
  durationMs: number;
  summary: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

type FilingWithCompany = AnnualReportFiling & {
  company: { id: string; orgNumber: string; name: string };
  extractionRuns: FinancialExtractionRun[];
};

function buildProductionBaseline(filing: FilingWithCompany) {
  const latestRun = filing.extractionRuns[0] ?? null;
  const rawSummary =
    latestRun?.rawSummary && typeof latestRun.rawSummary === "object"
      ? (latestRun.rawSummary as Record<string, unknown>)
      : {};
  const docUnderstanding =
    rawSummary.documentUnderstanding && typeof rawSummary.documentUnderstanding === "object"
      ? (rawSummary.documentUnderstanding as Record<string, unknown>)
      : {};

  return {
    route: latestRun?.documentEngine ?? "TEXT_LAYER",
    mode: latestRun?.documentEngineMode ?? null,
    confidenceScore: latestRun?.confidenceScore ?? null,
    validationScore: latestRun?.validationScore ?? null,
    runStatus: latestRun?.status ?? null,
    openDataLoaderRoute: docUnderstanding.openDataLoaderRoute ?? null,
    filingStatus: filing.status,
  };
}

function buildRouteEntry(
  route: PdfShadowExecutionRoute,
  availability: PdfRouteRuntimeAvailability,
  result: PdfRouteRuntimeExecutionResult,
): ArtifactRouteEntry {
  if (result.status === "SUCCESS") {
    return {
      route,
      status: "SUCCESS",
      runtime: availability.available
        ? { available: true, name: availability.name, version: availability.version ?? null }
        : { available: false },
      durationMs: result.durationMs,
      summary: result.summary as unknown as Record<string, unknown>,
    };
  }
  if (result.status === "RUNTIME_UNAVAILABLE") {
    return {
      route,
      status: "RUNTIME_UNAVAILABLE",
      runtime: { available: false, reason: result.runtime.reason },
      durationMs: 0,
      summary: null,
    };
  }
  if (result.status === "FAILED") {
    return {
      route,
      status: "FAILED",
      runtime: availability.available
        ? { available: true, name: availability.name }
        : { available: false },
      durationMs: result.durationMs,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      summary: null,
    };
  }
  return {
    route,
    status: "SKIPPED",
    runtime: { available: false, reason: (result as { reason: string }).reason },
    durationMs: 0,
    summary: null,
  };
}

async function executeRoute(
  adapter: PdfParserRouteRuntimeAdapter,
  input: { filingId: string; orgNumber: string; fiscalYear: number },
): Promise<{ availability: PdfRouteRuntimeAvailability; result: PdfRouteRuntimeExecutionResult }> {
  const availability = await adapter.isAvailable();
  if (!availability.available) {
    return {
      availability,
      result: {
        status: "RUNTIME_UNAVAILABLE",
        durationMs: 0,
        runtime: { available: false, reason: availability.reason },
        summary: null,
      },
    };
  }
  try {
    const result = await adapter.execute(input);
    return { availability, result };
  } catch (err) {
    return {
      availability,
      result: {
        status: "FAILED",
        durationMs: 0,
        errorCode: "EXECUTION_ERROR",
        errorMessage:
          err instanceof Error ? err.message.slice(0, 500) : "Unknown execution error",
        summary: null,
      },
    };
  }
}

export type PdfParserRouteShadowExecutionResult = {
  artifactId: string;
  filingId: string;
  orgNumber: string;
  fiscalYear: number;
  requestedRoutes: PdfShadowExecutionRoute[];
  routeResults: Array<{
    route: PdfShadowExecutionRoute;
    status: PdfShadowExecutionStatus;
    durationMs: number;
  }>;
};

export async function runPdfParserRouteShadowExecution(
  input: PdfParserRouteShadowExecutionInput,
  deps?: {
    getFilingWithArtifacts?: typeof getAnnualReportFilingWithArtifacts;
    createArtifact?: typeof createPdfModelArtifactSnapshot;
    routeAdapters?: Partial<Record<PdfShadowExecutionRoute, PdfParserRouteRuntimeAdapter>>;
  },
): Promise<PdfParserRouteShadowExecutionResult> {
  if (input.requestedRoutes.length === 0) {
    throw new PdfParserRouteShadowExecutionValidationError("At least one route must be requested.");
  }
  for (const route of input.requestedRoutes) {
    if (!isValidShadowRoute(route)) {
      throw new PdfParserRouteShadowExecutionValidationError(
        `Invalid route: ${String(route)}. Valid routes: ${VALID_SHADOW_ROUTES.join(", ")}.`,
      );
    }
  }

  const getFiling = deps?.getFilingWithArtifacts ?? getAnnualReportFilingWithArtifacts;
  const filing = await getFiling(input.annualReportId);
  if (!filing) {
    throw new PdfParserRouteShadowExecutionError(
      `Annual report filing not found: ${input.annualReportId}`,
    );
  }

  const productionBaseline = buildProductionBaseline(filing as FilingWithCompany);
  const routeEntries: ArtifactRouteEntry[] = [];

  for (const route of input.requestedRoutes) {
    const adapter =
      deps?.routeAdapters?.[route] ?? DEFAULT_ROUTE_ADAPTERS[route];
    const { availability, result } = await executeRoute(adapter, {
      filingId: filing.id,
      orgNumber: filing.company.orgNumber,
      fiscalYear: filing.fiscalYear,
    });
    routeEntries.push(buildRouteEntry(route, availability, result));
  }

  const now = new Date().toISOString();
  const artifactPayload = {
    schemaVersion: 1,
    kind: "PARSER_ROUTE_SHADOW_EXECUTION",
    createdAt: now,
    input: {
      annualReportId: filing.id,
      organizationNumber: filing.company.orgNumber,
      fiscalYear: filing.fiscalYear,
      requestedRoutes: input.requestedRoutes,
      source: input.source ?? "UNKNOWN",
      reason: input.reason ?? null,
      runId: input.runId ?? null,
      requestedBy: input.requestedBy ?? null,
    },
    productionBaseline,
    routes: routeEntries,
    safety: {
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
    },
  };

  const summary = {
    annualReportId: filing.id,
    orgNumber: filing.company.orgNumber,
    fiscalYear: filing.fiscalYear,
    requestedRouteCount: input.requestedRoutes.length,
    successCount: routeEntries.filter((r) => r.status === "SUCCESS").length,
    unavailableCount: routeEntries.filter((r) => r.status === "RUNTIME_UNAVAILABLE").length,
    failedCount: routeEntries.filter((r) => r.status === "FAILED").length,
    skippedCount: routeEntries.filter((r) => r.status === "SKIPPED").length,
    shadowOnly: true,
  };

  const createArtifact = deps?.createArtifact ?? createPdfModelArtifactSnapshot;
  const artifact = await createArtifact({
    kind: "PARSER_ROUTE_SHADOW_EXECUTION" as never,
    fiscalYear: filing.fiscalYear,
    orgNumber: filing.company.orgNumber,
    summary,
    payload: artifactPayload,
    sourceCommand: input.source ?? null,
    createdByUserId: input.requestedBy ?? null,
  });

  return {
    artifactId: artifact.id,
    filingId: filing.id,
    orgNumber: filing.company.orgNumber,
    fiscalYear: filing.fiscalYear,
    requestedRoutes: input.requestedRoutes,
    routeResults: routeEntries.map((r) => ({
      route: r.route,
      status: r.status,
      durationMs: r.durationMs,
    })),
  };
}
