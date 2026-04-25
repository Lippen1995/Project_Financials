import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import { parseAnnualReportPdfWithOpenDataLoader } from "@/server/document-understanding/opendataloader-client";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";
import { inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import {
  OpenDataLoaderNormalizedOutputSummary,
  OpenDataLoaderRawOutputSummary,
  OpenDataLoaderResolvedConfig,
} from "@/server/document-understanding/opendataloader-types";
import { buildOpenDataLoaderHybridCompatibilityProbePdfBuffer } from "@/server/document-understanding/opendataloader-smoke";

export type OpenDataLoaderHybridErrorType =
  | "missing_url"
  | "unreachable"
  | "timeout"
  | "invalid_response"
  | "compatibility_probe_failed"
  | null;

export type OpenDataLoaderHybridHttpProbe = {
  attempted: boolean;
  endpoint: string | null;
  ok: boolean;
  reachable: boolean;
  status: number | null;
  contentType: string | null;
  bodyPreview: string | null;
  latencyMs: number | null;
  reason: string;
};

export type OpenDataLoaderHybridCompatibilityProbe = {
  attempted: boolean;
  success: boolean;
  latencyMs: number | null;
  probeDocument: {
    name: string;
    kind: "synthetic-annual-report-structure";
    source: "repo-generated";
    byteLength: number;
    pageCount: number;
  } | null;
  invocation: {
    executionMode: "hybrid";
    hybridMode: "auto" | "full";
    requiresOcr: boolean;
    reasonCode: string;
    reason: string;
  } | null;
  annualReportPageCount: number | null;
  blockCount: number | null;
  rawOutput: OpenDataLoaderRawOutputSummary | null;
  normalizedOutput: OpenDataLoaderNormalizedOutputSummary | null;
  failureStage: string | null;
  reason: string;
};

export type OpenDataLoaderHybridHealthSummary = {
  configured: boolean;
  url: string | null;
  backend: string;
  timeoutMs: number;
  runtimeReady: boolean;
  runtimeReason: string;
  liveHybridBenchmarkReady: boolean;
  errorType: OpenDataLoaderHybridErrorType;
  reason: string;
  httpProbe: OpenDataLoaderHybridHttpProbe;
  compatibilityProbe: OpenDataLoaderHybridCompatibilityProbe;
};

function buildAbortTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout);
    },
  };
}

function trimBodyPreview(value: string | null, limit = 240) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 3)}...`;
}

function classifyHybridError(error: unknown): OpenDataLoaderHybridErrorType {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("timed out") || message.includes("timeout")) {
    return "timeout";
  }
  if (
    message.includes("econnrefused") ||
    message.includes("fetch failed") ||
    message.includes("could not connect") ||
    message.includes("networkerror") ||
    message.includes("unreachable")
  ) {
    return "unreachable";
  }
  return "compatibility_probe_failed";
}

async function probeHybridHealthEndpoint(input: {
  url: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): Promise<OpenDataLoaderHybridHttpProbe> {
  const endpoint = `${input.url.replace(/\/+$/, "")}/health`;
  const startedAt = Date.now();
  const timeout = buildAbortTimeout(input.timeoutMs);
  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      signal: timeout.signal,
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.1",
      },
    });
    const body = trimBodyPreview(await response.text());
    return {
      attempted: true,
      endpoint,
      ok: response.ok,
      reachable: true,
      status: response.status,
      contentType: response.headers.get("content-type"),
      bodyPreview: body,
      latencyMs: Date.now() - startedAt,
      reason: response.ok
        ? "Hybrid health endpoint responded successfully."
        : `Hybrid health endpoint responded with HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      attempted: true,
      endpoint,
      ok: false,
      reachable: false,
      status: null,
      contentType: null,
      bodyPreview: null,
      latencyMs: Date.now() - startedAt,
      reason:
        error instanceof Error ? error.message : "Hybrid health endpoint request failed.",
    };
  } finally {
    timeout.clear();
  }
}

export async function inspectOpenDataLoaderHybridHealth(input?: {
  config?: OpenDataLoaderResolvedConfig;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}) {
  const config = input?.config ?? resolveOpenDataLoaderConfig();
  const runtime = await inspectOpenDataLoaderRuntime(config);
  const probeTimeoutMs = input?.timeoutMs ?? Math.min(config.timeoutMs, 20_000);

  if (!config.hybridUrl) {
    return {
      configured: false,
      url: null,
      backend: config.hybridBackend,
      timeoutMs: probeTimeoutMs,
      runtimeReady: runtime.packageInstalled,
      runtimeReason: runtime.hybridModeReason,
      liveHybridBenchmarkReady: false,
      errorType: "missing_url",
      reason: "OPENDATALOADER_HYBRID_URL is not configured.",
      httpProbe: {
        attempted: false,
        endpoint: null,
        ok: false,
        reachable: false,
        status: null,
        contentType: null,
        bodyPreview: null,
        latencyMs: null,
        reason: "Hybrid URL is not configured.",
      },
      compatibilityProbe: {
        attempted: false,
        success: false,
        latencyMs: null,
        probeDocument: null,
        invocation: null,
        annualReportPageCount: null,
        blockCount: null,
        rawOutput: null,
        normalizedOutput: null,
        failureStage: null,
        reason: "Hybrid compatibility probe skipped because URL is missing.",
      },
    } satisfies OpenDataLoaderHybridHealthSummary;
  }

  const httpProbe = await probeHybridHealthEndpoint({
    url: config.hybridUrl,
    timeoutMs: Math.min(probeTimeoutMs, 5_000),
    fetchImpl: input?.fetchImpl,
  });

  const compatibilityStartedAt = Date.now();
  const pdfBuffer = buildOpenDataLoaderHybridCompatibilityProbePdfBuffer();
  const preflight = await preflightAnnualReportDocument(pdfBuffer);
  const routeOverride = {
    enabled: true,
    executionMode: "hybrid" as const,
    hybridMode: "auto" as const,
    useStructTree: false,
    requiresOcr: false,
    reasonCode: "FORCED_HYBRID" as const,
    reason:
      "Hybrid compatibility probe forces hybrid auto mode against a synthetic annual-report structure probe to validate transport, client invocation, and normalization compatibility.",
  };

  try {
    const result = await parseAnnualReportPdfWithOpenDataLoader({
      pdfBuffer,
      sourceFilename: "opendataloader-hybrid-healthcheck.pdf",
      preflight,
      config: {
        ...config,
        enabled: true,
        mode: "hybrid",
        timeoutMs: probeTimeoutMs,
        fallbackToLegacy: false,
        storeAnnotatedPdf: false,
        forceOcr: false,
      },
      routeOverride,
    });

    return {
      configured: true,
      url: config.hybridUrl,
      backend: config.hybridBackend,
      timeoutMs: probeTimeoutMs,
      runtimeReady: runtime.packageInstalled,
      runtimeReason: runtime.hybridModeReason,
      liveHybridBenchmarkReady: true,
      errorType: null,
      reason: "Hybrid backend is reachable and compatible with the repo's OpenDataLoader client path.",
      httpProbe,
      compatibilityProbe: {
        attempted: true,
        success: true,
        latencyMs: Date.now() - compatibilityStartedAt,
        probeDocument: {
          name: "opendataloader-hybrid-healthcheck.pdf",
          kind: "synthetic-annual-report-structure",
          source: "repo-generated",
          byteLength: pdfBuffer.byteLength,
          pageCount: preflight.pageCount,
        },
        invocation: {
          executionMode: "hybrid",
          hybridMode: routeOverride.hybridMode,
          requiresOcr: routeOverride.requiresOcr,
          reasonCode: routeOverride.reasonCode,
          reason: routeOverride.reason,
        },
        annualReportPageCount: result.annualReportPages.length,
        blockCount: result.metrics.blockCount,
        rawOutput: result.diagnostics.rawOutput ?? null,
        normalizedOutput: result.diagnostics.normalizedOutput ?? null,
        failureStage: null,
        reason: "Hybrid compatibility probe completed successfully.",
      },
    } satisfies OpenDataLoaderHybridHealthSummary;
  } catch (error) {
    const diagnostics =
      error && typeof error === "object" && "diagnostics" in error
        ? (error as {
            diagnostics?: {
              rawOutput?: OpenDataLoaderRawOutputSummary;
              normalizedOutput?: OpenDataLoaderNormalizedOutputSummary;
              annualReportPageCount?: number;
              failureStage?: string;
              failureReason?: string;
            };
          }).diagnostics
        : null;

    return {
      configured: true,
      url: config.hybridUrl,
      backend: config.hybridBackend,
      timeoutMs: probeTimeoutMs,
      runtimeReady: runtime.packageInstalled,
      runtimeReason: runtime.hybridModeReason,
      liveHybridBenchmarkReady: false,
      errorType: classifyHybridError(error),
      reason:
        diagnostics?.failureReason ??
        (error instanceof Error ? error.message : "Hybrid compatibility probe failed."),
      httpProbe,
      compatibilityProbe: {
        attempted: true,
        success: false,
        latencyMs: Date.now() - compatibilityStartedAt,
        probeDocument: {
          name: "opendataloader-hybrid-healthcheck.pdf",
          kind: "synthetic-annual-report-structure",
          source: "repo-generated",
          byteLength: pdfBuffer.byteLength,
          pageCount: preflight.pageCount,
        },
        invocation: {
          executionMode: "hybrid",
          hybridMode: routeOverride.hybridMode,
          requiresOcr: routeOverride.requiresOcr,
          reasonCode: routeOverride.reasonCode,
          reason: routeOverride.reason,
        },
        annualReportPageCount: diagnostics?.annualReportPageCount ?? null,
        blockCount: diagnostics?.normalizedOutput?.blockCount ?? null,
        rawOutput: diagnostics?.rawOutput ?? null,
        normalizedOutput: diagnostics?.normalizedOutput ?? null,
        failureStage: diagnostics?.failureStage ?? null,
        reason:
          diagnostics?.failureReason ??
          (error instanceof Error ? error.message : "Hybrid compatibility probe failed."),
      },
    } satisfies OpenDataLoaderHybridHealthSummary;
  }
}
