"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  PdfParserRouteCanaryFilingEligibility,
  PdfParserRouteCanaryPreviewReport,
} from "@/server/services/pdf-parser-route-canary-config-service";

type Filters = {
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

function verdictClass(verdict: string) {
  if (verdict === "ELIGIBLE") return "border-green-200 bg-green-50 text-green-700";
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

export default function PdfParserRouteCanaryPreviewClient({
  initialFilters,
}: {
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState<PdfParserRouteCanaryPreviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/pdf-parser-route-canary-preview?${toSearchParams(appliedFilters).toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load canary preview report.");
      const payload = (await response.json()) as {
        data: PdfParserRouteCanaryPreviewReport;
      };
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
          Canary Routing Preview
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Read-only preview of which filings would be eligible for canary routing under the
          current config. Production routing is{" "}
          <span className="font-medium text-orange-600">not changed</span> —
          canUseForProductionRouting is always false.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedFilters(filters);
        }}
      >
        {(["from", "to", "fiscalYear", "organizationNumber", "limit"] as const).map((field) => (
          <input
            key={field}
            value={filters[field]}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, [field]: event.target.value }))
            }
            className="w-44 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
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
          Loading canary preview report.
        </div>
      ) : !report ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
          No canary preview data available.
        </div>
      ) : (
        <>
          {/* Config status */}
          <div
            className={`rounded-lg border p-4 text-sm ${
              report.configValid
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-orange-200 bg-orange-50 text-orange-800"
            }`}
          >
            <div className="font-medium">
              Config:{" "}
              <span className="font-mono">{report.config.mode}</span>{" "}
              · maxCanaryPercent={report.config.maxCanaryPercent}%
              {report.configValid ? " ✓ valid" : " ✗ invalid"}
            </div>
            {!report.configValid ? (
              <ul className="mt-2 list-disc pl-5">
                {report.configIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {report.config.mode === "DISABLED" || report.config.maxCanaryPercent === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Canary routing is currently <strong>disabled</strong> (mode={report.config.mode},
              maxCanaryPercent={report.config.maxCanaryPercent}). All filings show as DISABLED.
              No production routing changes are made.
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <SmallCard label="Documents" value={report.summary.totalDocuments} />
            <SmallCard label="Eligible" value={report.summary.eligible} />
            <SmallCard label="Blocked" value={report.summary.blocked} />
            <SmallCard label="Disabled" value={report.summary.disabled} />
          </div>

          {Object.keys(report.summary.eligibleByRoute).length > 0 ? (
            <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Eligible by route
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(report.summary.eligibleByRoute).map(([route, count]) => (
                  <div key={route} className="text-sm text-slate-700">
                    <span className="font-mono">{route}</span>: {count}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <CanaryFilingsTable filings={report.filings} />
        </>
      )}
    </div>
  );
}

function CanaryFilingsTable({
  filings,
}: {
  filings: PdfParserRouteCanaryFilingEligibility[];
}) {
  return (
    <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#162233]">Filing Eligibility</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
            <th className="px-4 py-2">Filing</th>
            <th className="px-4 py-2">Org / Year</th>
            <th className="px-4 py-2">Verdict</th>
            <th className="px-4 py-2">Canary route</th>
            <th className="px-4 py-2">Blocked reasons</th>
          </tr>
        </thead>
        <tbody>
          {filings.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-slate-400" colSpan={5}>
                No filings for the current filters.
              </td>
            </tr>
          ) : (
            filings.slice(0, 100).map((f) => (
              <tr
                key={f.filingId}
                className="border-t border-[rgba(15,23,42,0.06)] align-top"
              >
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{f.filingId}</td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {f.orgNumber ?? "-"} / {f.fiscalYear ?? "-"}
                </td>
                <td className="px-4 py-2">
                  <Badge value={f.verdict} className={verdictClass(f.verdict)} />
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-700">
                  {f.canaryRoute ?? "-"}
                </td>
                <td className="min-w-72 px-4 py-2 text-xs text-slate-500">
                  {f.blockedReasons.length === 0 ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <ul className="list-disc pl-4">
                      {f.blockedReasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {filings.length > 100 ? (
        <div className="border-t border-[rgba(15,23,42,0.06)] px-4 py-3 text-xs text-slate-400">
          Showing 100 of {filings.length} filings.
        </div>
      ) : null}
    </section>
  );
}
