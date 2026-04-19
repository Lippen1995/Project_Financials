import env from "@/lib/env";
import { PreflightResult } from "@/integrations/brreg/annual-report-financials/types";
import {
  OpenDataLoaderResolvedConfig,
  OpenDataLoaderRouteDecision,
} from "@/server/document-understanding/opendataloader-types";

function readBoolean(
  value: string | undefined,
  defaultValue = false,
) {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function readMode(
  value: string | undefined,
): OpenDataLoaderResolvedConfig["mode"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "local" || normalized === "hybrid" || normalized === "auto") {
    return normalized;
  }
  return "local";
}

export function resolveOpenDataLoaderConfig(source: NodeJS.ProcessEnv | typeof env = process.env) {
  const enabled =
    "opendataloaderEnabled" in source
      ? Boolean((source as typeof env).opendataloaderEnabled)
      : readBoolean(source.OPENDATALOADER_ENABLED, false);

  const mode =
    "opendataloaderMode" in source
      ? ((source as typeof env).opendataloaderMode as OpenDataLoaderResolvedConfig["mode"])
      : readMode(source.OPENDATALOADER_MODE);

  const hybridBackend =
    "opendataloaderHybridBackend" in source
      ? (source as typeof env).opendataloaderHybridBackend
      : source.OPENDATALOADER_HYBRID_BACKEND ?? "docling-fast";

  const hybridUrl =
    "opendataloaderHybridUrl" in source
      ? (source as typeof env).opendataloaderHybridUrl
      : source.OPENDATALOADER_HYBRID_URL ?? null;

  const forceOcr =
    "opendataloaderForceOcr" in source
      ? Boolean((source as typeof env).opendataloaderForceOcr)
      : readBoolean(source.OPENDATALOADER_FORCE_OCR, false);

  const useStructTree =
    "opendataloaderUseStructTree" in source
      ? Boolean((source as typeof env).opendataloaderUseStructTree)
      : readBoolean(source.OPENDATALOADER_USE_STRUCT_TREE, false);

  const dualRun =
    "opendataloaderDualRun" in source
      ? Boolean((source as typeof env).opendataloaderDualRun)
      : readBoolean(source.OPENDATALOADER_DUAL_RUN, false);

  const storeAnnotatedPdf =
    "opendataloaderStoreAnnotatedPdf" in source
      ? Boolean((source as typeof env).opendataloaderStoreAnnotatedPdf)
      : readBoolean(source.OPENDATALOADER_STORE_ANNOTATED_PDF, true);

  const fallbackToLegacy =
    "opendataloaderFallbackToLegacy" in source
      ? Boolean((source as typeof env).opendataloaderFallbackToLegacy)
      : readBoolean(source.OPENDATALOADER_FALLBACK_TO_LEGACY, true);

  const timeoutRaw =
    "opendataloaderTimeoutMs" in source
      ? (source as typeof env).opendataloaderTimeoutMs
      : Number(source.OPENDATALOADER_TIMEOUT_MS ?? "120000");
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 120_000;

  return {
    enabled,
    mode,
    hybridBackend,
    hybridUrl,
    forceOcr,
    useStructTree,
    timeoutMs,
    dualRun,
    storeAnnotatedPdf,
    fallbackToLegacy,
  } satisfies OpenDataLoaderResolvedConfig;
}

export function chooseOpenDataLoaderRoute(input: {
  config?: OpenDataLoaderResolvedConfig;
  preflight: PreflightResult;
}): OpenDataLoaderRouteDecision {
  const config = input.config ?? resolveOpenDataLoaderConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      executionMode: "local",
      hybridMode: null,
      useStructTree: false,
      requiresOcr: false,
      reasonCode: "DISABLED",
      reason: "OpenDataLoader integration is disabled by configuration.",
    };
  }

  const useStructTree = config.useStructTree && input.preflight.hasTextLayer;

  if (config.forceOcr) {
    return {
      enabled: true,
      executionMode: "hybrid",
      hybridMode: "full",
      useStructTree: false,
      requiresOcr: true,
      reasonCode: "FORCED_OCR",
      reason: "Configured to force OCR-capable hybrid parsing for this filing.",
    };
  }

  if (config.mode === "local") {
    return {
      enabled: true,
      executionMode: "local",
      hybridMode: null,
      useStructTree,
      requiresOcr: false,
      reasonCode: useStructTree ? "STRUCT_TREE_PREFERRED" : "FORCED_LOCAL",
      reason: useStructTree
        ? "Local mode selected with structure-tree extraction enabled."
        : "Local mode selected explicitly by configuration.",
    };
  }

  if (config.mode === "hybrid") {
    return {
      enabled: true,
      executionMode: "hybrid",
      hybridMode: input.preflight.hasReliableTextLayer ? "auto" : "full",
      useStructTree: false,
      requiresOcr: !input.preflight.hasReliableTextLayer,
      reasonCode: "FORCED_HYBRID",
      reason: "Hybrid mode selected explicitly by configuration.",
    };
  }

  if (!input.preflight.hasReliableTextLayer) {
    return {
      enabled: true,
      executionMode: "hybrid",
      hybridMode: "full",
      useStructTree: false,
      requiresOcr: true,
      reasonCode: "SCANNED_PDF",
      reason: "Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.",
    };
  }

  return {
    enabled: true,
    executionMode: "local",
    hybridMode: null,
    useStructTree,
    requiresOcr: false,
    reasonCode: useStructTree ? "STRUCT_TREE_PREFERRED" : "RELIABLE_TEXT_LAYER",
    reason: useStructTree
      ? "Reliable text layer detected and structure-tree extraction was requested."
      : "Reliable text layer detected, so local deterministic parsing was selected.",
  };
}
