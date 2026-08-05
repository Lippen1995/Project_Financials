"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  PdfParserRouteRecommendationV2Decision,
  PdfParserRouteRecommendationV2Report,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";

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

function confidenceClass(confidence: string) {
  if (confidence === "HIGH") return "border-green-200 bg-green-50 text-green-700";
  if (confidence === "MEDIUM") return "border-blue-200 bg-blue-50 text-blue-700";
  if (confidence === "LOW") return "border-yellow-200 bg-yellow-50 text-yellow-700";
  return "border-slate-200 bg-slate-100 text-slate-500";
}

function riskClass(risk: string) {
  if (risk === "LOW") return "border-green-200 bg-green-50 text-green-700";
  if (risk === "MEDIUM") return "border-yellow-200 bg-yellow-50 text-yellow-700";
  if (risk === "HIGH") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-100 text-slate-500";
}

function routeClass(route: string) {
  if (route === "TEXT_LAYER") return "border-slate-200 bg-slate-50 text-slate-600";
  if (route === "OCR") return "border-purple-200 bg-purple-50 text-purple-700";
  if (route === "OPENDATALOADER_LOCAL") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (route === "HYBRID") return "border-teal-200 bg-teal-50 text-teal-700";
  if (route === "MANUAL_REVIEW") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function Badge({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${className ?? ""}`}>
      {value}
    </span>
  );
}

function fmtScore(score: number | null | undefined): string {
  return score == null ? "-" : score.toFixed(1);
}

export default function PdfParserRouteRecommendationV2Client({
  initialFilters,
}: {
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState<PdfParserRouteRecommendationV2Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/pdf-parser-route-recommendation-v2?${toSearchParams(appliedFilters).toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load route recommendation report.");
      const payload = (await response.json()) as {
        data: PdfParserRouteRecommendationV2Report;
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
          Parser Route Recommendation v2
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Read-only route recommendations derived from shadow execution artifacts. Production
          routing, fact extraction, and publishing are not affected.{" "}
          <span className="font-medium text-orange-600">
            canUseForProductionRouting is always false.
          </span>
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
          Loading route recommendation report.
        </div>
      ) : !report ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
          No route recommendation report available.
        </div>
      ) : (
        <>
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

          <div className="grid gap-3 md:grid-cols-6">
            <SmallCard label="Documents" value={report.summary.totalDocuments} />
            <SmallCard label="TEXT_LAYER" value={report.summary.textLayerRecommended} />
            <SmallCard label="OCR" value={report.summary.ocrRecommended} />
            <SmallCard label="ODL" value={report.summary.odlRecommended} />
            <SmallCard label="HYBRID" value={report.summary.hybridRecommended} />
            <SmallCard label="Manual review" value={report.summary.manualReviewRequired} />
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <SmallCard label="High confidence" value={report.summary.highConfidence} />
            <SmallCard label="Medium confidence" value={report.summary.mediumConfidence} />
            <SmallCard label="Low confidence" value={report.summary.lowConfidence} />
            <SmallCard label="High risk" value={report.summary.highRisk} />
          </div>

          <DecisionsTable decisions={report.decisions} />
        </>
      )}
    </div>
  );
}

function DecisionsTable({
  decisions,
}: {
  decisions: PdfParserRouteRecommendationV2Decision[];
}) {
  return (
    <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#162233]">Route Decisions</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
            <th className="px-4 py-2">Filing</th>
            <th className="px-4 py-2">Org / Year</th>
            <th className="px-4 py-2">Recommended</th>
            <th className="px-4 py-2">Fallback</th>
            <th className="px-4 py-2">Confidence</th>
            <th className="px-4 py-2">Risk</th>
            <th className="px-4 py-2">Scores</th>
            <th className="px-4 py-2">Coverage</th>
            <th className="px-4 py-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          {decisions.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-slate-400" colSpan={9}>
                No decisions for the current filters.
              </td>
            </tr>
          ) : (
            decisions.slice(0, 100).map((d) => (
              <tr
                key={d.filingId}
                className="border-t border-[rgba(15,23,42,0.06)] align-top"
              >
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{d.filingId}</td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {d.orgNumber ?? "-"} / {d.fiscalYear ?? "-"}
                </td>
                <td className="px-4 py-2">
                  <Badge value={d.recommendedRoute} className={routeClass(d.recommendedRoute)} />
                </td>
                <td className="px-4 py-2">
                  <Badge value={d.fallbackRoute} className={routeClass(d.fallbackRoute)} />
                </td>
                <td className="px-4 py-2">
                  <Badge value={d.confidence} className={confidenceClass(d.confidence)} />
                </td>
                <td className="px-4 py-2">
                  <Badge value={d.risk} className={riskClass(d.risk)} />
                </td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  <div>TL: {fmtScore(d.evidence.textLayerQualityScore)}</div>
                  {d.evidence.ocrQualityScore !== null ? (
                    <div>OCR: {fmtScore(d.evidence.ocrQualityScore)}</div>
                  ) : null}
                  {d.evidence.odlQualityScore !== null ? (
                    <div>ODL: {fmtScore(d.evidence.odlQualityScore)}</div>
                  ) : null}
                  {d.evidence.hybridQualityScore !== null ? (
                    <div>HYB: {fmtScore(d.evidence.hybridQualityScore)}</div>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  <div className="flex flex-wrap gap-1">
                    {d.evidence.hasFinancialCoverage ? (
                      <span className="text-green-600">fin✓</span>
                    ) : (
                      <span className="text-slate-300">fin✗</span>
                    )}
                    {d.evidence.hasBoardReportCoverage ? (
                      <span className="text-green-600">brd✓</span>
                    ) : (
                      <span className="text-slate-300">brd✗</span>
                    )}
                    {d.evidence.hasAuditorReportCoverage ? (
                      <span className="text-green-600">aud✓</span>
                    ) : (
                      <span className="text-slate-300">aud✗</span>
                    )}
                  </div>
                  {d.evidence.warningCount > 0 ? (
                    <div className="text-yellow-600">{d.evidence.warningCount} warn</div>
                  ) : null}
                  {d.evidence.errorCount > 0 ? (
                    <div className="text-red-600">{d.evidence.errorCount} err</div>
                  ) : null}
                </td>
                <td className="min-w-72 px-4 py-2 text-xs text-slate-500">
                  {d.reasons.map((r) => (
                    <div key={r}>{r}</div>
                  ))}
                  {d.guardrails.blockedReasons.map((r) => (
                    <div key={r} className="mt-1 text-orange-600">
                      ⚠ {r}
                    </div>
                  ))}
                  {d.guardrails.requiresMoreShadowEvidence ? (
                    <div className="mt-1 text-slate-400">Needs more shadow evidence.</div>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {decisions.length > 100 ? (
        <div className="border-t border-[rgba(15,23,42,0.06)] px-4 py-3 text-xs text-slate-400">
          Showing 100 of {decisions.length} decisions.
        </div>
      ) : null}
    </section>
  );
}
