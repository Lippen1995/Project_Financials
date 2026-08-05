"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PdfParserRemediationReport } from "@/server/services/pdf-parser-remediation-report-service";

type Filters = {
  limit: string;
  fiscalYear: string;
  orgNumber: string;
  maxExamples: string;
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

function countRows(record?: Record<string, number>) {
  return Object.entries(record ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export default function PdfParserRemediationClient({
  initialFilters,
}: {
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState<PdfParserRemediationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/pdf-parser-remediation?${toSearchParams(appliedFilters).toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load parser remediation report.");
      const payload = (await response.json()) as { data: PdfParserRemediationReport };
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

  const topWorkstream = useMemo(() => countRows(report?.workstreamSummary)[0]?.[0] ?? "-", [report]);
  const p0p1 = (report?.prioritySummary.P0 ?? 0) + (report?.prioritySummary.P1 ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
          Parser Remediation
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Read-only report generated from PDF Decision shadow evaluation and parser failure clusters.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedFilters(filters);
        }}
      >
        {(["limit", "fiscalYear", "orgNumber", "maxExamples"] as const).map((field) => (
          <input
            key={field}
            value={filters[field]}
            onChange={(event) => setFilters((prev) => ({ ...prev, [field]: event.target.value }))}
            className="w-40 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
            placeholder={field}
          />
        ))}
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
          Loading remediation report.
        </div>
      ) : !report ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
          No remediation report available.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <SmallCard label="Documents" value={report.totalDocuments} />
            <SmallCard label="Clusters" value={report.sourceClusterCount} />
            <SmallCard label="Items" value={report.itemCount} />
            <SmallCard label="P0/P1" value={p0p1} />
            <SmallCard label="Top workstream" value={topWorkstream} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SummaryTable title="Workstreams" rows={countRows(report.workstreamSummary)} />
            <SummaryTable title="Priorities" rows={countRows(report.prioritySummary)} />
          </div>

          <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
            <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#162233]">Remediation items</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Workstream</th>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Impact</th>
                  <th className="px-4 py-2">Docs</th>
                  <th className="px-4 py-2">Orgs</th>
                  <th className="px-4 py-2">Years</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Owner</th>
                </tr>
              </thead>
              <tbody>
                {report.items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={9}>
                      No remediation items for the current filter.
                    </td>
                  </tr>
                ) : (
                  report.items.map((item) => (
                    <tr key={item.id} className="border-t border-[rgba(15,23,42,0.06)] align-top">
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.priority}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.workstream}</td>
                      <td className="min-w-72 px-4 py-2 text-slate-700">
                        <div className="font-medium text-[#162233]">{item.title}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.description}</div>
                        <div className="mt-2 text-xs text-slate-500">
                          {item.evidence.map((evidence) => (
                            <div key={evidence.clusterId}>
                              {evidence.label} ({evidence.severity}, {evidence.documentCount}) - examples:{" "}
                              {evidence.exampleFilingIds.join(", ") || "-"}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.expectedImpact}</td>
                      <td className="px-4 py-2 text-slate-700">{item.documentCount}</td>
                      <td className="px-4 py-2 text-slate-700">{item.affectedOrgCount}</td>
                      <td className="px-4 py-2 text-slate-700">{item.affectedFiscalYears.join(", ") || "-"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.recommendedAction}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.suggestedOwner ?? "-"}</td>
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
