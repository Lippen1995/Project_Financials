/**
 * ML Inference Client
 *
 * Calls the in-house Python inference service (docker/ml-inference) over HTTP.
 * The service may be down, mid-restart, or out of memory at any moment — this
 * client is designed to **fail gracefully**: every call returns either a
 * successful prediction or `null`, never throws. The caller is expected to
 * fall back to the existing regex-based rule when null is returned.
 *
 * Why a hard fallback path: a single PDF batch can extract hundreds of facts.
 * If the inference service is briefly unavailable, the extraction pipeline
 * should keep producing results (worse but valid) rather than failing the
 * whole batch.
 *
 * Configuration: env var ML_INFERENCE_URL (defaults to http://localhost:8800).
 * Timeout per request: 2 seconds — Pi-scale inference must be fast or we
 * skip and use the rule.
 */
import env from "@/lib/env";
import { logRecoverableError } from "@/lib/recoverable-error";

const DEFAULT_URL = "http://localhost:8800";
const REQUEST_TIMEOUT_MS = 2000;

function getInferenceBaseUrl(): string {
  return env.mlInferenceUrl || DEFAULT_URL;
}

export type UnitScalePrediction = {
  unitScale: number;
  confidence: number;
  modelVersion: string | null;
};

export type FinancialFactMetricPrediction = {
  metricKey: string;
  confidence: number;
  modelVersion: string | null;
};

async function postWithTimeout(
  path: string,
  body: unknown,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${getInferenceBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    logRecoverableError("ml-inference-client", error, { path });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks the inference service to predict the unit scale for the given page
 * header text. Returns `null` if the service is unreachable, returned a
 * non-2xx status, or returned an unexpected payload — the caller must then
 * fall back to the existing regex-based detection.
 */
export async function predictUnitScale(input: {
  rawLabel: string;
  proposedUnitScale?: number | null;
}): Promise<UnitScalePrediction | null> {
  const response = await postWithTimeout("/predict/unit-scale", {
    raw_label: input.rawLabel,
    proposed_unit_scale: input.proposedUnitScale ?? null,
  });
  if (!response || !response.ok) return null;

  try {
    const data = (await response.json()) as {
      unit_scale?: unknown;
      confidence?: unknown;
      model_version?: unknown;
    };
    if (typeof data.unit_scale !== "number" || typeof data.confidence !== "number") {
      return null;
    }
    return {
      unitScale: data.unit_scale,
      confidence: data.confidence,
      modelVersion: typeof data.model_version === "string" ? data.model_version : null,
    };
  } catch (error) {
    logRecoverableError("ml-inference-client", error, {
      operation: "predict-unit-scale",
      message: "non-JSON response",
    });
    return null;
  }
}

export async function predictFinancialFactMetric(input: {
  rowContext: string;
  proposedMetricKey?: string | null;
}): Promise<FinancialFactMetricPrediction | null> {
  const response = await postWithTimeout("/predict/financial-fact", {
    row_context: input.rowContext,
    proposed_metric_key: input.proposedMetricKey ?? null,
  });
  if (!response || !response.ok) return null;

  try {
    const data = (await response.json()) as {
      metric_key?: unknown;
      confidence?: unknown;
      model_version?: unknown;
    };
    if (typeof data.metric_key !== "string" || typeof data.confidence !== "number") {
      return null;
    }
    return {
      metricKey: data.metric_key,
      confidence: data.confidence,
      modelVersion: typeof data.model_version === "string" ? data.model_version : null,
    };
  } catch (error) {
    logRecoverableError("ml-inference-client", error, {
      operation: "predict-financial-fact",
      message: "non-JSON response",
    });
    return null;
  }
}

/**
 * Lightweight health check used by the admin dashboard. Returns `false` if
 * the service is unreachable or unhealthy.
 */
export async function pingInferenceService(): Promise<{
  reachable: boolean;
  modelsLoaded: string[];
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${getInferenceBaseUrl()}/healthz`, {
      signal: controller.signal,
    });
    if (!response.ok) return { reachable: false, modelsLoaded: [] };
    const data = (await response.json()) as { models_loaded?: unknown };
    const loaded = Array.isArray(data.models_loaded)
      ? data.models_loaded.filter((v): v is string => typeof v === "string")
      : [];
    return { reachable: true, modelsLoaded: loaded };
  } catch {
    return { reachable: false, modelsLoaded: [] };
  } finally {
    clearTimeout(timer);
  }
}
