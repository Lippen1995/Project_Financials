"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DocumentComparison,
  PdfParserRouteQualityComparisonReport,
  RouteMetrics,
  TopOpportunity,
} from "@/server/services/pdf-parser-route-quality-comparison-service";

type Filters = {
  from: string;
  to: string;
  fiscalYear: string;
  organizationNumber: string;
  routes: string;
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

function fmtNumber(value: number | null | undefined, digits = 1): string {
  return value == null ? "-" : value.toFixed(digits);
}

function statusClass(status: string) {
  if (status === "SUCCESS" || status === "ALTERNATIVE_BETTER") {
    return "border-green-200 bg-green-50 text-green-700";
  }
  if (status === "RUNTIME_UNAVAILABLE" || status === "INSUFFICIENT_DATA") {
    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }
  if (status === "FAILED" || status === "ALL_ALTERNATIVES_FAILED") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Badge({ value }: { value: string }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${statusClass(value)}`}>
      {value}
    </span>
  );
}

export default function PdfParserRouteQualityClient({
  initialFilters,
}: {
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState<PdfParserRouteQualityComparisonReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/pdf-parser-route-quality-comparison?${toSearchParams(appliedFilters).toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load parser route quality report.");
      const payload = (await response.json()) as {
        data: PdfParserRouteQualityComparisonReport;
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

  const alternativeBetterCount = useMemo(
    () => report?.documentComparisons.filter((item) => item.outcome === "ALTERNATIVE_BETTER").length ?? 0,
    [report],
  );
  const runtimeUnavailableCount = report?.corpus.unavailableRouteRuns ?? 0;
  const bestOpportunityDelta = report?.topOpportunities[0]?.delta ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
          Parser Route Quality
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Read-only comparison of persisted parser route shadow execution artifacts. This does not
          change production routing, review, reprocessing, or publishing.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedFilters(filters);
        }}
      >
        {(["from", "to", "fiscalYear", "organizationNumber", "routes", "limit"] as const).map(
          (field) => (
            <input
              key={field}
              value={filters[field]}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, [field]: event.target.value }))
              }
              className="w-44 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
              placeholder={field}
            />
          ),
        )}
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
          Loading parser route quality report.
        </div>
      ) : !report ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
          No parser route quality report available.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <SmallCard label="Artifacts" value={report.corpus.artifactCount} />
            <SmallCard label="Documents" value={report.corpus.documentCount} />
            <SmallCard label="Alt better" value={alternativeBetterCount} />
            <SmallCard label="Unavailable" value={runtimeUnavailableCount} />
            <SmallCard label="Top delta" value={fmtNumber(bestOpportunityDelta)} />
          </div>

          {report.corpus.insufficientData ? (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              <div className="font-medium">Insufficient data</div>
              <ul className="mt-2 list-disc pl-5">
                {report.corpus.insufficientDataReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <RouteMetricsTable metrics={report.routeMetrics} />

          <div className="grid gap-4 xl:grid-cols-2">
            <TopOpportunitiesTable opportunities={report.topOpportunities} />
            <TopFailuresTable failures={report.topFailures} />
          </div>

          <DocumentComparisonTable comparisons={report.documentComparisons} />
        </>
      )}
    </div>
  );
}

function RouteMetricsTable({ metrics }: { metrics: RouteMetrics[] }) {
  return (
    <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#162233]">Route Metrics</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
            <th className="px-4 py-2">Route</th>
            <th className="px-4 py-2">Docs</th>
            <th className="px-4 py-2">Success</th>
            <th className="px-4 py-2">Unavailable</th>
            <th className="px-4 py-2">Failed</th>
            <th className="px-4 py-2">Avg score</th>
            <th className="px-4 py-2">Avg coverage</th>
            <th className="px-4 py-2">Tables</th>
            <th className="px-4 py-2">Line items</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.route} className="border-t border-[rgba(15,23,42,0.06)]">
              <td className="px-4 py-2 font-mono text-xs text-slate-700">{metric.route}</td>
              <td className="px-4 py-2 text-slate-700">{metric.documentsCompared}</td>
              <td className="px-4 py-2 text-slate-700">{metric.successCount}</td>
              <td className="px-4 py-2 text-slate-700">{metric.runtimeUnavailableCount}</td>
              <td className="px-4 py-2 text-slate-700">{metric.failedCount}</td>
              <td className="px-4 py-2 text-slate-700">{fmtNumber(metric.averageQualityScore)}</td>
              <td className="px-4 py-2 text-slate-700">
                {fmtNumber(metric.averageFinancialCoverageScore, 2)}
              </td>
              <td className="px-4 py-2 text-slate-700">{fmtNumber(metric.averageTableCount)}</td>
              <td className="px-4 py-2 text-slate-700">
                {fmtNumber(metric.averageLineItemCount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TopOpportunitiesTable({ opportunities }: { opportunities: TopOpportunity[] }) {
  return (
    <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#162233]">Top Opportunities</h2>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {opportunities.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-slate-400">No alternative route opportunities.</td>
            </tr>
          ) : (
            opportunities.slice(0, 10).map((item) => (
              <tr key={item.annualReportId} className="border-t border-[rgba(15,23,42,0.06)]">
                <td className="px-4 py-2">
                  <div className="font-mono text-xs text-slate-700">{item.annualReportId}</div>
                  <div className="text-xs text-slate-500">
                    {item.organizationNumber ?? "-"} / {item.fiscalYear ?? "-"}
                  </div>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-700">
                  {item.suggestedRoute}
                </td>
                <td className="px-4 py-2 text-slate-700">+{item.delta.toFixed(1)}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{item.reasons.join(", ") || "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function TopFailuresTable({
  failures,
}: {
  failures: PdfParserRouteQualityComparisonReport["topFailures"];
}) {
  return (
    <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#162233]">Top Failures</h2>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {failures.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-slate-400">No route failures in current report.</td>
            </tr>
          ) : (
            failures.slice(0, 10).map((item) => (
              <tr
                key={`${item.annualReportId}-${item.route}-${item.reason}`}
                className="border-t border-[rgba(15,23,42,0.06)]"
              >
                <td className="px-4 py-2 font-mono text-xs text-slate-700">
                  {item.annualReportId}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{item.route}</td>
                <td className="px-4 py-2">
                  <Badge value={item.status} />
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{item.reason}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function DocumentComparisonTable({ comparisons }: { comparisons: DocumentComparison[] }) {
  return (
    <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#162233]">Document Comparisons</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
            <th className="px-4 py-2">Annual report</th>
            <th className="px-4 py-2">Org/year</th>
            <th className="px-4 py-2">Outcome</th>
            <th className="px-4 py-2">Best route</th>
            <th className="px-4 py-2">Delta</th>
            <th className="px-4 py-2">Baseline</th>
            <th className="px-4 py-2">Alternatives</th>
            <th className="px-4 py-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-slate-400" colSpan={8}>
                No document comparisons for the current filters.
              </td>
            </tr>
          ) : (
            comparisons.slice(0, 100).map((item) => (
              <tr key={item.artifactId} className="border-t border-[rgba(15,23,42,0.06)] align-top">
                <td className="px-4 py-2 font-mono text-xs text-slate-700">
                  {item.annualReportId}
                </td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {item.organizationNumber ?? "-"} / {item.fiscalYear ?? "-"}
                </td>
                <td className="px-4 py-2">
                  <Badge value={item.outcome} />
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-700">
                  {item.bestRoute ?? "-"}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {item.comparisonScoreDelta == null
                    ? "-"
                    : item.comparisonScoreDelta.toFixed(1)}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {fmtNumber(item.baseline.qualityScore)}
                </td>
                <td className="px-4 py-2">
                  <div className="space-y-1">
                    {item.alternatives.map((alt) => (
                      <div key={alt.route} className="text-xs text-slate-600">
                        <span className="font-mono">{alt.route}</span>: {alt.status}
                        {alt.qualityScore != null ? ` / ${alt.qualityScore.toFixed(1)}` : ""}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="min-w-80 px-4 py-2 text-xs text-slate-500">
                  <div>{item.bestRouteReason}</div>
                  {item.warnings.map((warning) => (
                    <div key={warning} className="mt-1 text-yellow-700">
                      {warning}
                    </div>
                  ))}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {comparisons.length > 100 ? (
        <div className="border-t border-[rgba(15,23,42,0.06)] px-4 py-3 text-xs text-slate-400">
          Showing 100 of {comparisons.length} document comparisons.
        </div>
      ) : null}
    </section>
  );
}
