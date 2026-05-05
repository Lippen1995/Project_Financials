"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  PdfShadowVsRuleComparisonGateReport,
  PdfShadowVsRuleGateCheck,
  PdfShadowVsRuleComparisonItem,
} from "@/server/services/pdf-shadow-vs-rule-comparison-gate-service";

type Filters = {
  limit: string;
  fiscalYear: string;
  orgNumber: string;
  split: string;
  minRecordCount: string;
};

function toSearchParams(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (String(value).trim()) params.set(key, String(value).trim());
  }
  return params;
}

function statusColor(status: string): string {
  if (status === "PASS") return "text-green-700 bg-green-50 border-green-200";
  if (status === "WARN") return "text-yellow-700 bg-yellow-50 border-yellow-200";
  if (status === "FAIL") return "text-red-700 bg-red-50 border-red-200";
  return "text-slate-500 bg-slate-50 border-slate-200";
}

function severityColor(severity: string): string {
  if (severity === "HIGH") return "text-red-700";
  if (severity === "MEDIUM") return "text-yellow-700";
  return "text-slate-500";
}

function fmt(value?: number | null): string {
  return value == null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${statusColor(status)}`}>
      {status}
    </span>
  );
}

function SmallCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[#162233]">{value}</div>
    </div>
  );
}

function CheckRow({ check }: { check: PdfShadowVsRuleGateCheck }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-4">
        <StatusBadge status={check.status} />
      </td>
      <td className="py-2 pr-4 text-sm font-mono text-slate-700">{check.code}</td>
      <td className="py-2 pr-4 text-sm text-slate-600">{check.message}</td>
      <td className="py-2 pr-4 text-right text-sm text-slate-500">
        {check.observedValue != null ? check.observedValue : "-"}
      </td>
      <td className="py-2 text-right text-sm text-slate-500">
        {check.threshold != null ? check.threshold : "-"}
      </td>
    </tr>
  );
}

function ItemRow({ item }: { item: PdfShadowVsRuleComparisonItem }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-1.5 pr-3 font-mono text-xs text-slate-700">
        {item.filingId.length > 22 ? item.filingId.slice(0, 22) + "…" : item.filingId}
      </td>
      <td className="py-1.5 pr-3 text-xs text-slate-600">{item.shadowRoute}</td>
      <td className="py-1.5 pr-3 text-xs text-slate-500">{item.ruleRoute ?? "-"}</td>
      <td className="py-1.5 pr-3 text-xs text-slate-600">
        {item.shadowManualReviewProbability.toFixed(3)}
      </td>
      <td className="py-1.5 pr-3 text-xs text-slate-600">
        {item.shadowPublishProbability.toFixed(3)}
      </td>
      <td className="py-1.5 pr-3 text-xs text-slate-600">{item.disagreementType}</td>
      <td className={`py-1.5 text-xs font-medium ${severityColor(item.severity)}`}>
        {item.severity}
      </td>
    </tr>
  );
}

export default function PdfShadowVsRuleGateClient({
  initialFilters,
}: {
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState<PdfShadowVsRuleComparisonGateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/pdf-shadow-vs-rule-gate?${toSearchParams(appliedFilters).toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load gate report.");
      const payload = (await response.json()) as { data: PdfShadowVsRuleComparisonGateReport };
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

  const disagreements = report?.items.filter((i) => i.disagreementType !== "NONE") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
          PDF Shadow vs Rule Gate
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Read-only go/no-go gate comparing shadow model predictions against rule-based behavior.
          Does not activate models, change routing, or affect publishing.
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
          placeholder="Min records"
          value={filters.minRecordCount}
          onChange={(e) => setFilters((f) => ({ ...f, minRecordCount: e.target.value }))}
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
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">Gate status:</span>
            <StatusBadge status={report.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
            <SmallCard label="Records" value={report.summary.recordCount} />
            <SmallCard label="Disagreements" value={report.summary.disagreementCount} />
            <SmallCard label="High Severity" value={report.summary.highSeverityDisagreementCount} />
            <SmallCard label="Publish Safety" value={report.summary.publishSafetyConcernCount} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SmallCard label="Route Accuracy" value={fmt(report.metrics.shadowRouteAccuracy)} />
            <SmallCard label="MR Recall" value={fmt(report.metrics.shadowManualReviewRecall)} />
            <SmallCard label="Unread Recall" value={fmt(report.metrics.shadowUnreadableRecall)} />
            <SmallCard label="Publish Precision" value={fmt(report.metrics.shadowPublishPrecision)} />
          </div>

          {/* Gate checks */}
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Gate Checks</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-1 pr-4 text-left text-slate-500">Status</th>
                    <th className="pb-1 pr-4 text-left text-slate-500">Check</th>
                    <th className="pb-1 pr-4 text-left text-slate-500">Message</th>
                    <th className="pb-1 pr-4 text-right text-slate-500">Observed</th>
                    <th className="pb-1 text-right text-slate-500">Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {report.checks.map((check) => (
                    <CheckRow key={check.code} check={check} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Disagreements */}
          {disagreements.length > 0 && (
            <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">
                Disagreements ({disagreements.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="pb-1 pr-3 text-left text-slate-500">Filing</th>
                      <th className="pb-1 pr-3 text-left text-slate-500">Shadow Route</th>
                      <th className="pb-1 pr-3 text-left text-slate-500">Rule Route</th>
                      <th className="pb-1 pr-3 text-right text-slate-500">MR Prob</th>
                      <th className="pb-1 pr-3 text-right text-slate-500">Pub Prob</th>
                      <th className="pb-1 pr-3 text-left text-slate-500">Type</th>
                      <th className="pb-1 text-left text-slate-500">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disagreements.slice(0, 100).map((item) => (
                      <ItemRow key={item.filingId} item={item} />
                    ))}
                  </tbody>
                </table>
                {disagreements.length > 100 && (
                  <p className="mt-2 text-xs text-slate-400">
                    Showing 100 of {disagreements.length} disagreements.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
