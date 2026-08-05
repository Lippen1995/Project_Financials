"use client";

import { useCallback, useEffect, useState } from "react";

import type { PdfDecisionShadowModelEvaluation } from "@/server/services/pdf-decision-shadow-model-service";

type Filters = {
  limit: string;
  fiscalYear: string;
  orgNumber: string;
  split: string;
};

function toSearchParams(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) params.set(key, value.trim());
  }
  return params;
}

function SmallCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[#162233]">{value}</div>
    </div>
  );
}

function formatMetric(value?: number | null) {
  return value == null ? "-" : `${Math.round(value * 100)}%`;
}

function countRows(record?: Record<string, number>) {
  return Object.entries(record ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export default function PdfShadowModelClient({ initialFilters }: { initialFilters: Filters }) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [evaluation, setEvaluation] = useState<PdfDecisionShadowModelEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/pdf-shadow-model?${toSearchParams(appliedFilters).toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load shadow model evaluation.");
      const payload = (await response.json()) as { data: PdfDecisionShadowModelEvaluation };
      setEvaluation(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
          PDF Shadow Model
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Read-only baseline model prototype. Does not affect routing, review, or publishing.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedFilters(filters);
        }}
      >
        {(["limit", "fiscalYear", "orgNumber"] as const).map((field) => (
          <input
            key={field}
            value={filters[field]}
            onChange={(event) => setFilters((prev) => ({ ...prev, [field]: event.target.value }))}
            className="w-40 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
            placeholder={field}
          />
        ))}
        <select
          value={filters.split}
          onChange={(event) => setFilters((prev) => ({ ...prev, split: event.target.value }))}
          className="w-40 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="all">all</option>
          <option value="train">train</option>
          <option value="validation">validation</option>
          <option value="test">test</option>
        </select>
        <button
          type="submit"
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Apply
        </button>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
          Loading shadow model evaluation.
        </div>
      ) : !evaluation ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
          No shadow model evaluation available.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <SmallCard label="Records" value={evaluation.recordCount} />
            <SmallCard label="Route accuracy" value={formatMetric(evaluation.metrics.routeAccuracy)} />
            <SmallCard label="Review accuracy" value={formatMetric(evaluation.metrics.manualReviewAccuracy)} />
            <SmallCard label="Unreadable Brier" value={evaluation.metrics.unreadableBrierApprox ?? "-"} />
            <SmallCard label="Publish Brier" value={evaluation.metrics.publishBrierApprox ?? "-"} />
          </div>

          <SummaryTable title="Prediction distribution" rows={countRows(evaluation.routePredictionDistribution)} />

          <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
            <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#162233]">Predictions</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2">Org</th>
                  <th className="px-4 py-2">Year</th>
                  <th className="px-4 py-2">Route</th>
                  <th className="px-4 py-2">Review</th>
                  <th className="px-4 py-2">Correction</th>
                  <th className="px-4 py-2">Unreadable</th>
                  <th className="px-4 py-2">Publish</th>
                  <th className="px-4 py-2">Route match</th>
                  <th className="px-4 py-2">Review match</th>
                  <th className="px-4 py-2">Explanations</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.predictions.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={10}>
                      No predictions for the current filter.
                    </td>
                  </tr>
                ) : (
                  evaluation.predictions.map((prediction) => (
                    <tr key={prediction.filingId} className="border-t border-[rgba(15,23,42,0.06)] align-top">
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{prediction.orgNumber ?? "-"}</td>
                      <td className="px-4 py-2 text-slate-700">{prediction.fiscalYear ?? "-"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{prediction.predictions.routeRecommendation}</td>
                      <td className="px-4 py-2 text-slate-700">{formatMetric(prediction.predictions.manualReviewProbability)}</td>
                      <td className="px-4 py-2 text-slate-700">{formatMetric(prediction.predictions.correctionProbability)}</td>
                      <td className="px-4 py-2 text-slate-700">{formatMetric(prediction.predictions.unreadableProbability)}</td>
                      <td className="px-4 py-2 text-slate-700">{formatMetric(prediction.predictions.publishProbability)}</td>
                      <td className="px-4 py-2 text-slate-700">{prediction.comparison?.routeMatch == null ? "-" : prediction.comparison.routeMatch ? "Yes" : "No"}</td>
                      <td className="px-4 py-2 text-slate-700">{prediction.comparison?.manualReviewMatch == null ? "-" : prediction.comparison.manualReviewMatch ? "Yes" : "No"}</td>
                      <td className="min-w-80 px-4 py-2 text-xs text-slate-500">
                        {prediction.explanations.map((explanation) => (
                          <div key={explanation}>{explanation}</div>
                        ))}
                        <div className="mt-2 text-slate-400">
                          actual route: {prediction.comparison?.actualRouteLabel ?? "-"}; actual review:{" "}
                          {prediction.comparison?.actualManualReviewRequired ?? "-"}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryTable({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3 text-sm font-semibold text-[#162233]">
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([name, count]) => (
            <tr key={name} className="border-t border-[rgba(15,23,42,0.06)]">
              <td className="px-4 py-2 font-mono text-xs text-slate-600">{name}</td>
              <td className="px-4 py-2 text-right text-slate-700">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
