import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  default: { mlInferenceUrl: "http://test-inference:8800" },
}));

import {
  pingInferenceService,
  predictFinancialFactMetric,
  predictUnitScale,
} from "@/server/ml/ml-inference-client";

const originalFetch = global.fetch;

describe("ml-inference-client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("predictUnitScale", () => {
    it("returns prediction on a 200 response", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            unit_scale: 1000,
            confidence: 0.92,
            model_version: "2026-05-20",
          }),
          { status: 200 },
        ),
      );

      const result = await predictUnitScale({ rawLabel: "Beløp i NOK 1000" });

      expect(result).toEqual({
        unitScale: 1000,
        confidence: 0.92,
        modelVersion: "2026-05-20",
      });
    });

    it("returns null when the service responds non-OK", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response("server error", { status: 503 }),
      );

      const result = await predictUnitScale({ rawLabel: "Beløp i NOK" });
      expect(result).toBeNull();
    });

    it("returns null when the response shape is unexpected", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response(JSON.stringify({ wrong: "shape" }), { status: 200 }),
      );

      const result = await predictUnitScale({ rawLabel: "Beløp i NOK" });
      expect(result).toBeNull();
    });

    it("returns null when fetch rejects", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("ECONNREFUSED"),
      );

      const result = await predictUnitScale({ rawLabel: "Beløp i NOK" });
      expect(result).toBeNull();
    });
  });

  describe("predictFinancialFactMetric", () => {
    it("returns a metric-key prediction on a 200 response", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            metric_key: "total_equity",
            confidence: 0.81,
            model_version: "2026-06-29",
          }),
          { status: 200 },
        ),
      );

      const result = await predictFinancialFactMetric({
        rowContext: "label=Sum egenkapital | value=21661000000",
        proposedMetricKey: "total_equity",
      });

      expect(result).toEqual({
        metricKey: "total_equity",
        confidence: 0.81,
        modelVersion: "2026-06-29",
      });
    });

    it("returns null when the financial-fact response shape is unexpected", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response(JSON.stringify({ metric: "total_equity" }), { status: 200 }),
      );

      const result = await predictFinancialFactMetric({
        rowContext: "label=Sum egenkapital",
      });

      expect(result).toBeNull();
    });
  });

  describe("pingInferenceService", () => {
    it("reports reachable + models when health endpoint returns OK", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "ok", models_loaded: ["unit_scale"] }),
          { status: 200 },
        ),
      );

      const result = await pingInferenceService();

      expect(result.reachable).toBe(true);
      expect(result.modelsLoaded).toEqual(["unit_scale"]);
    });

    it("reports unreachable when the service is down", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("ECONNREFUSED"),
      );

      const result = await pingInferenceService();

      expect(result.reachable).toBe(false);
      expect(result.modelsLoaded).toEqual([]);
    });
  });
});
