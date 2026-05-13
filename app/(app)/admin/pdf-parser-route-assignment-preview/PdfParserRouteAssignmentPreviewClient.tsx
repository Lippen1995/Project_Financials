"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  PdfParserRouteAssignmentPreviewItem,
  PdfParserRouteAssignmentPreviewReport,
  PdfParserRouteAssignmentVerdict,
} from "@/server/services/pdf-parser-route-assignment-preview-service";

type Filters = {
  seed: string;
  from: string;
  to: string;
  fiscalYear: string;
  organizationNumber: string;
  limit: string;
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

function verdictClass(verdict: PdfParserRouteAssignmentVerdict) {
  if (verdict === "WOULD_USE_CANARY_ROUTE") return "border-green-200 bg-green-50 text-green-700";
  if (verdict === "WOULD_USE_TEXT_LAYER") return "border-sky-200 bg-sky-50 text-sky-700";
  if (verdict === "MANUAL_REVIEW") return "border-yellow-200 bg-yellow-50 text-yellow-700";
  if (verdict === "BLOCKED") return "border-red-200 bg-red-50 text-red-700";
  if (verdict === "DISABLED") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function Badge({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${className ?? ""}`}>
      {value}
    </span>
  );
}

export default function PdfParserRouteAssignmentPreviewClient({
  initialFilters,
}: {
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [report, setReport] = useState<PdfParserRouteAssignmentPreviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = toSearchParams(f);
      const res = await fetch(`/api/admin/pdf-parser-route-assignment-preview?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { data: PdfParserRouteAssignmentPreviewReport };
      setReport(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReport(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    void fetchReport(filters);
  }

  const s = report?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#162233]">Parser Route Assignment Preview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Deterministic read-only preview of which route each filing would be assigned to under the
          current canary config. No production routing, fact extraction, or publishing is affected.
        </p>
      </div>

      {/* Filter form */}
      <form
        onSubmit={handleApply}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4"
      >
        {(
          [
            { key: "seed", label: "Seed", placeholder: "preview" },
            { key: "from", label: "From (date)", placeholder: "2024-01-01" },
            { key: "to", label: "To (date)", placeholder: "2024-12-31" },
            { key: "fiscalYear", label: "Fiscal year", placeholder: "2024" },
            { key: "organizationNumber", label: "Org number", placeholder: "123456789" },
            { key: "limit", label: "Limit", placeholder: "100" },
          ] as Array<{ key: keyof Filters; label: string; placeholder: string }>
        ).map(({ key, label, placeholder }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">{label}</label>
            <input
              type="text"
              value={filters[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={placeholder}
              className="w-36 rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-[#162233] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3150] disabled:opacity-50"
        >
          {loading ? "Loading…" : "Apply"}
        </button>
      </form>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {report && (
        <>
          {/* Safety badge */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-green-200 bg-green-50 px-2 py-1 font-semibold text-green-700">
              READ-ONLY
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600">
              canUseForProductionRouting: false
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600">
              seed: {report.seed}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-500">
              {new Date(report.generatedAt).toLocaleString()}
            </span>
          </div>

          {/* Summary cards */}
          {s && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <SmallCard label="Total" value={s.totalDocuments} />
              <SmallCard label="Canary route" value={s.wouldUseCanaryRoute} />
              <SmallCard label="Text layer" value={s.wouldUseTextLayer} />
              <SmallCard label="Manual review" value={s.manualReview} />
              <SmallCard label="Blocked" value={s.blocked} />
              <SmallCard label="Disabled" value={s.disabled} />
            </div>
          )}

          {/* By assigned route */}
          {s && Object.keys(s.byAssignedRoute).length > 0 && (
            <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Canary route breakdown
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(s.byAssignedRoute).map(([route, count]) => (
                  <div key={route} className="flex items-center gap-2">
                    <Badge
                      value={route}
                      className="border-sky-200 bg-sky-50 text-sky-700"
                    />
                    <span className="text-sm font-semibold text-[#162233]">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assignments table */}
          {report.assignments.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(15,23,42,0.08)] text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3">Filing ID</th>
                    <th className="px-4 py-3">Org</th>
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3">Bucket</th>
                    <th className="px-4 py-3">Max%</th>
                    <th className="px-4 py-3">Verdict</th>
                    <th className="px-4 py-3">Canary route</th>
                    <th className="px-4 py-3">Blocked reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {report.assignments.map((a: PdfParserRouteAssignmentPreviewItem) => (
                    <tr
                      key={a.filingId}
                      className="border-b border-[rgba(15,23,42,0.04)] last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{a.filingId}</td>
                      <td className="px-4 py-2 text-slate-600">{a.orgNumber ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{a.fiscalYear ?? "—"}</td>
                      <td className="px-4 py-2 text-center font-mono text-xs text-slate-500">
                        {a.bucket}
                      </td>
                      <td className="px-4 py-2 text-center text-slate-500">{a.maxCanaryPercent}</td>
                      <td className="px-4 py-2">
                        <Badge value={a.verdict} className={verdictClass(a.verdict)} />
                      </td>
                      <td className="px-4 py-2">
                        {a.assignedCanaryRoute ? (
                          <Badge
                            value={a.assignedCanaryRoute}
                            className="border-sky-200 bg-sky-50 text-sky-700"
                          />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {a.blockedReasons.length > 0 ? (
                          <ul className="list-inside list-disc space-y-0.5">
                            {a.blockedReasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !loading && (
              <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white px-6 py-10 text-center text-slate-400">
                No filings found for the selected filters.
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
