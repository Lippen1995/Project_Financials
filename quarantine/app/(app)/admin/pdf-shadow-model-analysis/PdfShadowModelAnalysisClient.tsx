"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  PdfShadowModelAnalysisReport,
  PdfShadowModelBinaryMetrics,
  PdfShadowModelCalibrationBucket,
  PdfShadowModelErrorExample,
  PdfShadowModelSliceMetrics,
} from "@/server/services/pdf-decision-shadow-model-analysis-service";

type Filters = {
  limit: string;
  fiscalYear: string;
  orgNumber: string;
  split: string;
  threshold: string;
  maxExamples: string;
};

function toSearchParams(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (String(value).trim()) params.set(key, String(value).trim());
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

function fmt(value?: number | null): string {
  return value == null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function fmtNum(value?: number | null): string {
  return value == null ? "-" : value.toFixed(4);
}

function MetricsRow({ label, metrics }: { label: string; metrics: PdfShadowModelBinaryMetrics }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-4 text-sm font-medium text-slate-700">{label}</td>
      <td className="py-2 pr-4 text-sm text-slate-600">{metrics.eligibleCount}</td>
      <td className="py-2 pr-4 text-sm text-slate-600">{fmt(metrics.precision)}</td>
      <td className="py-2 pr-4 text-sm text-slate-600">{fmt(metrics.recall)}</td>
      <td className="py-2 pr-4 text-sm text-slate-600">{fmt(metrics.f1)}</td>
      <td className="py-2 pr-4 text-sm text-slate-600">{fmt(metrics.accuracy)}</td>
      <td className="py-2 pr-4 text-sm text-slate-600">{metrics.truePositive}</td>
      <td className="py-2 pr-4 text-sm text-slate-600">{metrics.falsePositive}</td>
      <td className="py-2 pr-4 text-sm text-slate-600">{metrics.trueNegative}</td>
      <td className="py-2 text-sm text-slate-600">{metrics.falseNegative}</td>
    </tr>
  );
}

function CalibrationTable({
  label,
  buckets,
}: {
  label: string;
  buckets: PdfShadowModelCalibrationBucket[];
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-slate-700">{label}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="pb-1 pr-3 text-left font-medium text-slate-500">Bucket</th>
              <th className="pb-1 pr-3 text-right font-medium text-slate-500">Count</th>
              <th className="pb-1 pr-3 text-right font-medium text-slate-500">Avg Pred</th>
              <th className="pb-1 pr-3 text-right font-medium text-slate-500">Obs Rate</th>
              <th className="pb-1 text-right font-medium text-slate-500">|Error|</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.bucket} className="border-b border-slate-50">
                <td className="py-1 pr-3 text-slate-600">{b.bucket}</td>
                <td className="py-1 pr-3 text-right text-slate-600">{b.count}</td>
                <td className="py-1 pr-3 text-right text-slate-600">
                  {b.averagePredictedProbability == null ? "-" : b.averagePredictedProbability.toFixed(3)}
                </td>
                <td className="py-1 pr-3 text-right text-slate-600">
                  {b.observedRate == null ? "-" : b.observedRate.toFixed(3)}
                </td>
                <td className="py-1 text-right text-slate-600">
                  {b.absoluteCalibrationError == null ? "-" : b.absoluteCalibrationError.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SlicesTable({ slices }: { slices: PdfShadowModelSliceMetrics[] }) {
  if (slices.length === 0) return <p className="text-sm text-slate-500">No slices available.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="pb-1 pr-3 text-left font-medium text-slate-500">Key</th>
            <th className="pb-1 pr-3 text-left font-medium text-slate-500">Value</th>
            <th className="pb-1 pr-3 text-right font-medium text-slate-500">Count</th>
            <th className="pb-1 pr-3 text-right font-medium text-slate-500">Route Acc</th>
            <th className="pb-1 pr-3 text-right font-medium text-slate-500">MR Prec</th>
            <th className="pb-1 pr-3 text-right font-medium text-slate-500">MR Rec</th>
            <th className="pb-1 pr-3 text-right font-medium text-slate-500">MR F1</th>
            <th className="pb-1 pr-3 text-right font-medium text-slate-500">Corr Brier</th>
            <th className="pb-1 text-right font-medium text-slate-500">Unread Brier</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s, i) => (
            <tr key={i} className="border-b border-slate-50">
              <td className="py-1 pr-3 text-slate-500">{s.key}</td>
              <td className="py-1 pr-3 font-medium text-slate-700">{s.value}</td>
              <td className="py-1 pr-3 text-right text-slate-600">{s.count}</td>
              <td className="py-1 pr-3 text-right text-slate-600">{fmt(s.routeAccuracy)}</td>
              <td className="py-1 pr-3 text-right text-slate-600">{fmt(s.manualReviewMetrics.precision)}</td>
              <td className="py-1 pr-3 text-right text-slate-600">{fmt(s.manualReviewMetrics.recall)}</td>
              <td className="py-1 pr-3 text-right text-slate-600">{fmt(s.manualReviewMetrics.f1)}</td>
              <td className="py-1 pr-3 text-right text-slate-600">{fmtNum(s.correctionBrierApprox)}</td>
              <td className="py-1 text-right text-slate-600">{fmtNum(s.unreadableBrierApprox)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorTable({
  title,
  examples,
}: {
  title: string;
  examples: PdfShadowModelErrorExample[];
}) {
  if (examples.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-slate-700">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="pb-1 pr-3 text-left font-medium text-slate-500">Filing</th>
              <th className="pb-1 pr-3 text-left font-medium text-slate-500">Error Type</th>
              <th className="pb-1 pr-3 text-left font-medium text-slate-500">Predicted</th>
              <th className="pb-1 pr-3 text-left font-medium text-slate-500">Actual</th>
              <th className="pb-1 pr-3 text-right font-medium text-slate-500">Conf</th>
              <th className="pb-1 text-right font-medium text-slate-500">MR Prob</th>
            </tr>
          </thead>
          <tbody>
            {examples.map((e, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-1 pr-3 font-mono text-slate-700">
                  {e.filingId.length > 20 ? e.filingId.slice(0, 20) + "…" : e.filingId}
                </td>
                <td className="py-1 pr-3 text-slate-600">{e.errorType}</td>
                <td className="py-1 pr-3 text-slate-600">{e.predictedRoute}</td>
                <td className="py-1 pr-3 text-slate-600">{e.actualRoute ?? "-"}</td>
                <td className="py-1 pr-3 text-right text-slate-600">{e.confidenceOverall.toFixed(3)}</td>
                <td className="py-1 text-right text-slate-600">{e.manualReviewProbability.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PdfShadowModelAnalysisClient({
  initialFilters,
}: {
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState<PdfShadowModelAnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/pdf-shadow-model-analysis?${toSearchParams(appliedFilters).toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load analysis report.");
      const payload = (await response.json()) as { data: PdfShadowModelAnalysisReport };
      setReport(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setAppliedFilters(filters);
  }

  const mr = report?.manualReviewMetrics;
  const worstCalibration = report
    ? Math.max(
        ...[
          ...report.calibration.manualReviewProbability,
          ...report.calibration.correctionProbability,
          ...report.calibration.unreadableProbability,
          ...report.calibration.publishProbability,
        ]
          .filter((b) => b.absoluteCalibrationError != null)
          .map((b) => b.absoluteCalibrationError!),
        0,
      )
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
          PDF Shadow Model Analysis
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Read-only calibration and error analysis. Does not train or affect production behavior.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-3" onSubmit={handleApply}>
        <input
          type="number"
          placeholder="Limit"
          value={filters.limit}
          onChange={(e) => setFilters((f) => ({ ...f, limit: e.target.value }))}
          className="w-24 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <input
          type="number"
          placeholder="Fiscal year"
          value={filters.fiscalYear}
          onChange={(e) => setFilters((f) => ({ ...f, fiscalYear: e.target.value }))}
          className="w-28 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <input
          type="text"
          placeholder="Org number"
          value={filters.orgNumber}
          onChange={(e) => setFilters((f) => ({ ...f, orgNumber: e.target.value }))}
          className="w-32 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <select
          value={filters.split}
          onChange={(e) => setFilters((f) => ({ ...f, split: e.target.value }))}
          className="rounded border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="all">All splits</option>
          <option value="train">Train</option>
          <option value="validation">Validation</option>
          <option value="test">Test</option>
        </select>
        <input
          type="number"
          step="0.05"
          min="0"
          max="1"
          placeholder="Threshold"
          value={filters.threshold}
          onChange={(e) => setFilters((f) => ({ ...f, threshold: e.target.value }))}
          className="w-24 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <input
          type="number"
          placeholder="Max examples"
          value={filters.maxExamples}
          onChange={(e) => setFilters((f) => ({ ...f, maxExamples: e.target.value }))}
          className="w-28 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-[#162233] px-4 py-1 text-sm text-white hover:bg-[#1e2f45]"
        >
          Apply
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Loading…</p>}

      {report && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SmallCard label="Records" value={report.recordCount} />
            <SmallCard label="Route-eligible" value={report.eligibleRouteCount} />
            <SmallCard label="MR Precision" value={fmt(mr?.precision)} />
            <SmallCard label="MR Recall" value={fmt(mr?.recall)} />
            <SmallCard label="MR F1" value={fmt(mr?.f1)} />
            <SmallCard
              label="Worst Cal. Error"
              value={worstCalibration != null ? worstCalibration.toFixed(3) : "-"}
            />
          </div>

          {/* Route confusion matrix */}
          {report.routeConfusionMatrix.labels.length > 0 && (
            <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Route Confusion Matrix</h2>
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr>
                      <th className="pb-1 pr-3 text-left text-slate-500">Actual \ Predicted</th>
                      {report.routeConfusionMatrix.labels.map((l) => (
                        <th key={l} className="pb-1 pr-3 text-right text-slate-500">
                          {l}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.routeConfusionMatrix.labels.map((actual) => (
                      <tr key={actual} className="border-t border-slate-100">
                        <td className="py-1 pr-3 font-medium text-slate-700">{actual}</td>
                        {report.routeConfusionMatrix.labels.map((predicted) => (
                          <td key={predicted} className="py-1 pr-3 text-right text-slate-600">
                            {report.routeConfusionMatrix.matrix[actual]?.[predicted] ?? 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Binary metrics */}
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Binary Classification Metrics</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-1 pr-4 text-left text-slate-500">Task</th>
                    <th className="pb-1 pr-4 text-right text-slate-500">N</th>
                    <th className="pb-1 pr-4 text-right text-slate-500">Precision</th>
                    <th className="pb-1 pr-4 text-right text-slate-500">Recall</th>
                    <th className="pb-1 pr-4 text-right text-slate-500">F1</th>
                    <th className="pb-1 pr-4 text-right text-slate-500">Accuracy</th>
                    <th className="pb-1 pr-4 text-right text-slate-500">TP</th>
                    <th className="pb-1 pr-4 text-right text-slate-500">FP</th>
                    <th className="pb-1 pr-4 text-right text-slate-500">TN</th>
                    <th className="pb-1 text-right text-slate-500">FN</th>
                  </tr>
                </thead>
                <tbody>
                  <MetricsRow label="Manual Review" metrics={report.manualReviewMetrics} />
                  <MetricsRow label="Correction" metrics={report.correctionMetrics} />
                  <MetricsRow label="Unreadable" metrics={report.unreadableMetrics} />
                </tbody>
              </table>
            </div>
          </div>

          {/* Calibration */}
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Calibration Buckets</h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <CalibrationTable
                label="Manual Review Probability"
                buckets={report.calibration.manualReviewProbability}
              />
              <CalibrationTable
                label="Correction Probability"
                buckets={report.calibration.correctionProbability}
              />
              <CalibrationTable
                label="Unreadable Probability"
                buckets={report.calibration.unreadableProbability}
              />
              <CalibrationTable
                label="Publish Probability"
                buckets={report.calibration.publishProbability}
              />
            </div>
          </div>

          {/* Sliced metrics */}
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Sliced Metrics ({report.slices.length} slices)
            </h2>
            <SlicesTable slices={report.slices} />
          </div>

          {/* Errors and uncertain */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
              <ErrorTable title={`Top Errors (${report.topErrors.length})`} examples={report.topErrors} />
            </div>
            <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
              <ErrorTable
                title={`Most Uncertain (${report.topUncertain.length})`}
                examples={report.topUncertain}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
