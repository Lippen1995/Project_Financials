"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PdfRouteRecommendationExperimentReport } from "@/server/services/pdf-route-recommendation-experiment-service";

type Filters = {
  limit: string;
  fiscalYear: string;
  orgNumber: string;
  includeLowPriority: boolean;
};

function toSearchParams(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.limit.trim()) params.set("limit", filters.limit.trim());
  if (filters.fiscalYear.trim()) params.set("fiscalYear", filters.fiscalYear.trim());
  if (filters.orgNumber.trim()) params.set("orgNumber", filters.orgNumber.trim());
  if (filters.includeLowPriority) params.set("includeLowPriority", "true");
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

function countRows(record?: Record<string, number>) {
  return Object.entries(record ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export default function PdfRouteExperimentClient({
  initialFilters,
}: {
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState<PdfRouteRecommendationExperimentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/pdf-route-experiment?${toSearchParams(appliedFilters).toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load route experiment report.");
      const payload = (await response.json()) as { data: PdfRouteRecommendationExperimentReport };
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

  const likelyOrPossible = useMemo(
    () =>
      (report?.outcomeBandDistribution.LIKELY_IMPROVEMENT ?? 0) +
      (report?.outcomeBandDistribution.POSSIBLE_IMPROVEMENT ?? 0),
    [report],
  );
  const safeCount = report?.items.filter((item) => item.safeToExperiment).length ?? 0;
  const manualCount = report?.recommendationDistribution.MANUAL_REVIEW_REQUIRED ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
          PDF Route Experiment
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Read-only shadow experiment report. Does not change production routing.
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
        <label className="flex items-center gap-2 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={filters.includeLowPriority}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, includeLowPriority: event.target.checked }))
            }
          />
          Include low priority
        </label>
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
          Loading route experiment report.
        </div>
      ) : !report ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
          No route experiment report available.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <SmallCard label="Documents" value={report.totalDocuments} />
            <SmallCard label="Candidates" value={report.experimentCandidateCount} />
            <SmallCard label="Improvements" value={likelyOrPossible} />
            <SmallCard label="Safe shadow" value={safeCount} />
            <SmallCard label="Manual review" value={manualCount} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SummaryTable title="Recommendations" rows={countRows(report.recommendationDistribution)} />
            <SummaryTable title="Outcome bands" rows={countRows(report.outcomeBandDistribution)} />
            <SummaryTable title="Suggested experiments" rows={countRows(report.suggestedExperimentDistribution)} />
          </div>

          <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
            <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#162233]">Experiment items</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2">Org</th>
                  <th className="px-4 py-2">Year</th>
                  <th className="px-4 py-2">Current</th>
                  <th className="px-4 py-2">Recommended</th>
                  <th className="px-4 py-2">Recommendation</th>
                  <th className="px-4 py-2">Outcome</th>
                  <th className="px-4 py-2">Strength</th>
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Safe</th>
                  <th className="px-4 py-2">Experiment</th>
                </tr>
              </thead>
              <tbody>
                {report.items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={10}>
                      No route experiment items for the current filter.
                    </td>
                  </tr>
                ) : (
                  report.items.map((item) => (
                    <tr key={item.filingId} className="border-t border-[rgba(15,23,42,0.06)] align-top">
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.orgNumber ?? "-"}</td>
                      <td className="px-4 py-2 text-slate-700">{item.fiscalYear ?? "-"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.currentRoute ?? "-"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.evaluatedRecommendedRoute}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.experimentRecommendation}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.outcomeBand}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.recommendationStrength}</td>
                      <td className="px-4 py-2 text-slate-700">{item.samplePriority}</td>
                      <td className="px-4 py-2 text-slate-700">{item.safeToExperiment ? "Yes" : "No"}</td>
                      <td className="min-w-80 px-4 py-2">
                        <div className="font-mono text-xs text-slate-600">{item.suggestedExperiment}</div>
                        <div className="mt-2 text-xs text-slate-500">
                          <div className="font-medium text-slate-600">Evidence</div>
                          {item.evidence.map((evidence) => (
                            <div key={evidence}>{evidence}</div>
                          ))}
                          <div className="mt-2 font-medium text-slate-600">Risks</div>
                          {item.risks.map((risk) => (
                            <div key={risk}>{risk}</div>
                          ))}
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
