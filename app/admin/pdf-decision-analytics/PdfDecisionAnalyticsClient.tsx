"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  PdfDecisionShadowEvaluationResult,
  PdfDecisionShadowMetrics,
} from "@/server/services/annual-report-pdf-decision-shadow-evaluation";
import type {
  PdfDecisionActiveLearningQueueItem,
  PdfDecisionActiveLearningQueueResult,
} from "@/server/services/pdf-decision-active-learning-service";
import type { PdfDecisionGoldSetBenchmarkResult } from "@/server/services/pdf-decision-gold-set-benchmark-service";
import type { JsonSafePdfDecisionGoldSetItem } from "@/server/services/pdf-decision-gold-set-service";

type Filters = {
  limit: string;
  fiscalYear: string;
  orgNumber: string;
};

type Candidate = PdfDecisionShadowMetrics["candidateGoldSet"][number];
type CuratableItem = Candidate | JsonSafePdfDecisionGoldSetItem | PdfDecisionActiveLearningQueueItem;
type GoldReason =
  | "LOW_RISK_FAILED"
  | "HIGH_RISK_SUCCEEDED"
  | "MANUAL_CORRECTION"
  | "UNREADABLE"
  | "REPROCESS_REQUESTED"
  | "BALANCE_MISMATCH"
  | "ROUTE_MISMATCH"
  | "OCR_RISK"
  | "REPRESENTATIVE_SAMPLE"
  | "OTHER";

function compactId(value?: string | null) {
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("nb-NO");
}

function isActiveLearningItem(item: CuratableItem): item is PdfDecisionActiveLearningQueueItem {
  return "suggestedAction" in item;
}

function inferReason(candidate: Candidate | PdfDecisionActiveLearningQueueItem): GoldReason {
  if (isActiveLearningItem(candidate) && candidate.suggestedGoldSetReason) {
    return candidate.suggestedGoldSetReason as GoldReason;
  }
  const reason = "reason" in candidate ? candidate.reason : candidate.reasons.join(" ");
  const text = `${reason} ${candidate.outcome} ${candidate.decisionRoute ?? ""}`.toUpperCase();
  if (text.includes("UNREADABLE")) return "UNREADABLE";
  if (text.includes("REPROCESS")) return "REPROCESS_REQUESTED";
  if (text.includes("BALANCE")) return "BALANCE_MISMATCH";
  if (text.includes("LOW RISK")) return "LOW_RISK_FAILED";
  if (text.includes("HIGH RISK")) return "HIGH_RISK_SUCCEEDED";
  if (text.includes("CORRECT")) return "MANUAL_CORRECTION";
  if (text.includes("OCR") || text.includes("OPENDATALOADER")) return "OCR_RISK";
  return "REPRESENTATIVE_SAMPLE";
}

function toSearchParams(filters: Filters) {
  const params = new URLSearchParams();
  const limit = Number.parseInt(filters.limit, 10);
  if (Number.isFinite(limit)) params.set("limit", String(limit));
  const fiscalYear = Number.parseInt(filters.fiscalYear, 10);
  if (Number.isFinite(fiscalYear)) params.set("fiscalYear", String(fiscalYear));
  if (filters.orgNumber.trim()) params.set("orgNumber", filters.orgNumber.trim());
  return params;
}

function SmallCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[#162233]">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function MetricTable({
  title,
  rows,
  valueLabel = "Count",
  formatter,
}: {
  title: string;
  rows: Array<[string, number]>;
  valueLabel?: string;
  formatter?: (value: number) => string;
}) {
  return (
    <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3 text-sm font-semibold text-[#162233]">
        {title}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2 text-right">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-slate-400" colSpan={2}>
                No data.
              </td>
            </tr>
          ) : (
            rows.map(([name, value]) => (
              <tr key={name} className="border-t border-[rgba(15,23,42,0.06)]">
                <td className="px-4 py-2 font-mono text-xs text-slate-600">{name}</td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {formatter ? formatter(value) : value}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function PdfDecisionAnalyticsClient({
  activeRuleConfigVersion,
  initialFilters,
}: {
  activeRuleConfigVersion: string;
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [analytics, setAnalytics] = useState<PdfDecisionShadowEvaluationResult | null>(null);
  const [benchmark, setBenchmark] = useState<PdfDecisionGoldSetBenchmarkResult | null>(null);
  const [activeLearning, setActiveLearning] =
    useState<PdfDecisionActiveLearningQueueResult | null>(null);
  const [goldSet, setGoldSet] = useState<JsonSafePdfDecisionGoldSetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const [savingFilingId, setSavingFilingId] = useState<string | null>(null);

  const refreshAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSecondaryError(null);
    try {
      const params = toSearchParams(appliedFilters);
      const [analyticsResponse, goldSetResponse] = await Promise.all([
        fetch(`/api/admin/pdf-decision-analytics?${params.toString()}`, { cache: "no-store" }),
        fetch(`/api/admin/pdf-decision-gold-set?${params.toString()}`, { cache: "no-store" }),
      ]);
      if (!analyticsResponse.ok) throw new Error("Could not load PDF Decision Analytics.");
      if (!goldSetResponse.ok) throw new Error("Could not load curated gold set.");
      const analyticsPayload = (await analyticsResponse.json()) as {
        data: PdfDecisionShadowEvaluationResult;
      };
      const goldSetPayload = (await goldSetResponse.json()) as {
        data: JsonSafePdfDecisionGoldSetItem[];
      };
      setAnalytics(analyticsPayload.data);
      setGoldSet(goldSetPayload.data);

      const [benchmarkResult, activeLearningResult] = await Promise.allSettled([
        fetch(`/api/admin/pdf-decision-gold-set/benchmark?${params.toString()}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/pdf-decision-active-learning?${params.toString()}`, {
          cache: "no-store",
        }),
      ]);

      const secondaryFailures: string[] = [];
      if (benchmarkResult.status === "fulfilled" && benchmarkResult.value.ok) {
        const payload = (await benchmarkResult.value.json()) as {
          data: PdfDecisionGoldSetBenchmarkResult;
        };
        setBenchmark(payload.data);
      } else {
        setBenchmark(null);
        secondaryFailures.push("gold-set benchmark");
      }
      if (activeLearningResult.status === "fulfilled" && activeLearningResult.value.ok) {
        const payload = (await activeLearningResult.value.json()) as {
          data: PdfDecisionActiveLearningQueueResult;
        };
        setActiveLearning(payload.data);
      } else {
        setActiveLearning(null);
        secondaryFailures.push("active-learning queue");
      }
      if (secondaryFailures.length > 0) {
        setSecondaryError(`Could not load ${secondaryFailures.join(" and ")}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    void refreshAnalytics();
  }, [refreshAnalytics]);

  const metrics = analytics?.metrics;
  const rows = useMemo(() => {
    const entries = (record?: Record<string, number>) =>
      Object.entries(record ?? {}).sort((a, b) => b[1] - a[1]);
    return {
      routes: entries(metrics?.routeDistribution),
      risks: entries(metrics?.riskDistribution),
      outcomes: entries(metrics?.outcomeDistribution),
      manualReviewByRisk: entries(metrics?.manualReviewRateByRisk),
      correctionByRisk: entries(metrics?.correctionRateByRisk),
      publishByRisk: entries(metrics?.publishRateByRisk),
      unreadableByRoute: entries(metrics?.unreadableRateByRoute),
      confidenceByRisk: entries(metrics?.averageConfidenceByRisk),
      goldSet: entries(metrics?.goldSetDistribution),
      benchmarkReason: entries(benchmark?.metrics.mismatchesByReason),
      benchmarkRoute: entries(benchmark?.metrics.mismatchesByRoute),
      benchmarkRisk: entries(benchmark?.metrics.mismatchesByRisk),
    };
  }, [benchmark, metrics]);

  async function upsertGoldSet(
    item: CuratableItem,
    status: "CANDIDATE" | "APPROVED" | "EXCLUDED",
  ) {
    setSavingFilingId(item.filingId);
    setError(null);
    try {
      const isCandidate = !("createdAt" in item);
      const note =
        isActiveLearningItem(item)
          ? item.reasonDetails.join(" ")
          : isCandidate
            ? (item as Candidate).reason
            : item.note;
      const response = await fetch("/api/admin/pdf-decision-gold-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filingId: item.filingId,
          extractionRunId: item.extractionRunId ?? null,
          orgNumber: item.orgNumber ?? null,
          fiscalYear: item.fiscalYear ?? null,
          status,
          reason: isCandidate ? inferReason(item as Candidate | PdfDecisionActiveLearningQueueItem) : item.reason,
          note,
          decisionRoute: item.decisionRoute ?? null,
          riskLevel: item.riskLevel ?? null,
          confidenceScore: item.confidenceScore ?? null,
          outcome: item.outcome ?? null,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not save gold-set item.");
      }
      await refreshAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected save error.");
    } finally {
      setSavingFilingId(null);
    }
  }

  async function removeGoldSet(filingId: string) {
    setSavingFilingId(filingId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/pdf-decision-gold-set/${encodeURIComponent(filingId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not remove gold-set item.");
      }
      await refreshAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected delete error.");
    } finally {
      setSavingFilingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
            PDF Decision Analytics
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Read-only shadow evaluation over persisted decision artifacts, review outcomes,
            and explicit gold-set curation metadata.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Current engine rules: {activeRuleConfigVersion}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Rule simulations: npm run simulate:pdf-decision-rules. Simulations do not change production rules.
          </p>
        </div>
        {analytics ? (
          <div className="text-xs text-slate-400">Generated {formatDate(analytics.generatedAt)}</div>
        ) : null}
      </div>

      <form
        className="mb-6 flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedFilters(filters);
        }}
      >
        <input
          value={filters.limit}
          onChange={(event) => setFilters((f) => ({ ...f, limit: event.target.value }))}
          className="w-28 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
          inputMode="numeric"
          placeholder="Limit"
        />
        <input
          value={filters.fiscalYear}
          onChange={(event) => setFilters((f) => ({ ...f, fiscalYear: event.target.value }))}
          className="w-36 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
          inputMode="numeric"
          placeholder="Fiscal year"
        />
        <input
          value={filters.orgNumber}
          onChange={(event) => setFilters((f) => ({ ...f, orgNumber: event.target.value }))}
          className="w-44 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
          placeholder="Org number"
        />
        <button
          type="submit"
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Apply
        </button>
      </form>

      {error ? (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {secondaryError ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {secondaryError}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
          Loading analytics.
        </div>
      ) : !metrics ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
          No analytics data available.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <SmallCard label="Documents" value={metrics.totalDocuments} />
            <SmallCard
              label="Published rate"
              value={formatPercent(
                metrics.totalDocuments > 0
                  ? (metrics.outcomeDistribution.PUBLISHED ?? 0) / metrics.totalDocuments
                  : 0,
              )}
            />
            <SmallCard
              label="Manual review"
              value={formatPercent(
                metrics.totalDocuments > 0
                  ? Object.entries(metrics.outcomeDistribution)
                      .filter(([key]) => key.startsWith("MANUAL_REVIEW"))
                      .reduce((sum, [, count]) => sum + count, 0) / metrics.totalDocuments
                  : 0,
              )}
            />
            <SmallCard
              label="Correction rate"
              value={formatPercent(
                metrics.totalDocuments > 0
                  ? (metrics.outcomeDistribution.MANUAL_REVIEW_CORRECTED ?? 0) /
                      metrics.totalDocuments
                  : 0,
              )}
            />
            <SmallCard label="Approved gold" value={metrics.approvedGoldSetCount} />
            <SmallCard label="Candidate gold" value={metrics.candidateGoldSetCount} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <MetricTable title="Route distribution" rows={rows.routes} />
            <MetricTable title="Risk distribution" rows={rows.risks} />
            <MetricTable title="Outcome distribution" rows={rows.outcomes} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <MetricTable title="Manual review rate by risk" rows={rows.manualReviewByRisk} valueLabel="Rate" formatter={formatPercent} />
            <MetricTable title="Correction rate by risk" rows={rows.correctionByRisk} valueLabel="Rate" formatter={formatPercent} />
            <MetricTable title="Publish rate by risk" rows={rows.publishByRisk} valueLabel="Rate" formatter={formatPercent} />
            <MetricTable title="Unreadable rate by route" rows={rows.unreadableByRoute} valueLabel="Rate" formatter={formatPercent} />
            <MetricTable title="Average confidence by risk" rows={rows.confidenceByRisk} valueLabel="Average" formatter={formatPercent} />
            <MetricTable title="Gold-set distribution" rows={rows.goldSet} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <MetricTable title="Top manual review reasons" rows={metrics.topManualReviewReasons.map((r) => [r.reason, r.count])} />
            <MetricTable title="Top blocking rule codes" rows={metrics.topBlockingRuleCodes.map((r) => [r.ruleCode, r.count])} />
            <MetricTable title="Top parser risk reasons" rows={metrics.topParserRiskReasons.map((r) => [r.reason, r.count])} />
          </div>

          {benchmark ? (
            <section className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
                <SmallCard label="Benchmark items" value={benchmark.metrics.totalItems} />
                <SmallCard label="Match rate" value={formatPercent(benchmark.metrics.matchRate)} />
                <SmallCard label="Mismatch rate" value={formatPercent(benchmark.metrics.mismatchRate)} />
                <SmallCard label="Errors" value={benchmark.metrics.errorCount} />
                <SmallCard label="Route mismatch" value={benchmark.metrics.routeMismatchCount} />
                <SmallCard label="Risk mismatch" value={benchmark.metrics.riskMismatchCount} />
                <SmallCard label="Outcome mismatch" value={benchmark.metrics.outcomeMismatchCount} />
                <SmallCard label="Confidence drift" value={benchmark.metrics.confidenceOutOfRangeCount} />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <MetricTable title="Benchmark mismatches by reason" rows={rows.benchmarkReason} />
                <MetricTable title="Benchmark mismatches by route" rows={rows.benchmarkRoute} />
                <MetricTable title="Benchmark mismatches by risk" rows={rows.benchmarkRisk} />
              </div>
              <div className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
                <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
                  <h2 className="text-sm font-semibold text-[#162233]">Gold-set benchmark mismatches</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    APPROVED gold-set snapshots compared with current persisted PDF decisions.
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
                      <th className="px-4 py-2">Org</th>
                      <th className="px-4 py-2">Year</th>
                      <th className="px-4 py-2">Route</th>
                      <th className="px-4 py-2">Risk</th>
                      <th className="px-4 py-2">Outcome</th>
                      <th className="px-4 py-2">Severity</th>
                      <th className="px-4 py-2">Failures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmark.items.filter((item) => item.benchmarkOutcome !== "MATCH").length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-slate-400" colSpan={7}>
                          No benchmark mismatches for the current filter.
                        </td>
                      </tr>
                    ) : (
                      benchmark.items
                        .filter((item) => item.benchmarkOutcome !== "MATCH")
                        .slice(0, 25)
                        .map((item) => (
                          <tr key={item.goldSetItemId} className="border-t border-[rgba(15,23,42,0.06)]">
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.orgNumber ?? "-"}</td>
                            <td className="px-4 py-2 text-slate-700">{item.fiscalYear ?? "-"}</td>
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">
                              {item.curatedDecisionRoute ?? "-"} / {item.currentDecisionRoute ?? "-"}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">
                              {item.curatedRiskLevel ?? "-"} / {item.currentRiskLevel ?? "-"}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">
                              {item.curatedOutcome ?? "-"} / {item.currentOutcome ?? "-"}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.severity}</td>
                            <td className="min-w-72 px-4 py-2 text-slate-600">{item.failures.join(" ")}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeLearning ? (
            <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
              <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
                <h2 className="text-sm font-semibold text-[#162233]">Active-learning review queue</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Prioritized read-only queue for manual review and gold-set curation.
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-2">Score</th>
                    <th className="px-4 py-2">Org</th>
                    <th className="px-4 py-2">Year</th>
                    <th className="px-4 py-2">Route</th>
                    <th className="px-4 py-2">Risk</th>
                    <th className="px-4 py-2">Conf.</th>
                    <th className="px-4 py-2">Outcome</th>
                    <th className="px-4 py-2">Reasons</th>
                    <th className="px-4 py-2">Action</th>
                    <th className="px-4 py-2">Gold</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {activeLearning.items.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-slate-400" colSpan={11}>
                        No active-learning candidates for the current filter.
                      </td>
                    </tr>
                  ) : (
                    activeLearning.items.map((item) => (
                      <tr key={item.filingId} className="border-t border-[rgba(15,23,42,0.06)]">
                        <td className="px-4 py-2">
                          <span className="font-semibold text-[#162233]">{item.priorityScore}</span>
                          <span className="ml-2 font-mono text-xs text-slate-400">{item.priorityBand}</span>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.orgNumber ?? "-"}</td>
                        <td className="px-4 py-2 text-slate-700">{item.fiscalYear ?? "-"}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.decisionRoute ?? "-"}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.riskLevel ?? "-"}</td>
                        <td className="px-4 py-2 text-slate-700">{formatPercent(item.confidenceScore)}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.outcome ?? "-"}</td>
                        <td className="min-w-64 px-4 py-2 text-slate-600">{item.reasons.join(", ")}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">
                          {item.suggestedAction}
                          {item.suggestedGoldSetReason ? (
                            <div className="mt-1 text-slate-400">{item.suggestedGoldSetReason}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{item.goldSetStatus ?? "-"}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            {(["CANDIDATE", "APPROVED", "EXCLUDED"] as const).map((status) => (
                              <button
                                key={status}
                                type="button"
                                disabled={savingFilingId === item.filingId}
                                onClick={() => void upsertGoldSet(item, status)}
                                className="rounded border border-[rgba(15,23,42,0.12)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {status === "CANDIDATE" ? "Mark" : status === "APPROVED" ? "Approve" : "Exclude"}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
            <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#162233]">Candidate gold set</h2>
              <p className="mt-1 text-xs text-slate-500">
                Excluded filings are omitted; already curated filings are marked in-place.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2">Org</th>
                  <th className="px-4 py-2">Year</th>
                  <th className="px-4 py-2">Filing</th>
                  <th className="px-4 py-2">Route</th>
                  <th className="px-4 py-2">Risk</th>
                  <th className="px-4 py-2">Conf.</th>
                  <th className="px-4 py-2">Outcome</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Gold</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {metrics.candidateGoldSet.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={10}>
                      No candidate documents for the current filter.
                    </td>
                  </tr>
                ) : (
                  metrics.candidateGoldSet.map((candidate) => (
                    <tr key={candidate.filingId} className="border-t border-[rgba(15,23,42,0.06)]">
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{candidate.orgNumber ?? "-"}</td>
                      <td className="px-4 py-2 text-slate-700">{candidate.fiscalYear ?? "-"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{compactId(candidate.filingId)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{candidate.decisionRoute ?? "-"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{candidate.riskLevel ?? "-"}</td>
                      <td className="px-4 py-2 text-slate-700">{formatPercent(candidate.confidenceScore)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{candidate.outcome}</td>
                      <td className="min-w-64 px-4 py-2 text-slate-600">{candidate.reason}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{candidate.goldSet?.status ?? "-"}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          {(["CANDIDATE", "APPROVED", "EXCLUDED"] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              disabled={savingFilingId === candidate.filingId}
                              onClick={() => void upsertGoldSet(candidate, status)}
                              className="rounded border border-[rgba(15,23,42,0.12)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {status === "CANDIDATE" ? "Mark" : status === "APPROVED" ? "Approve" : "Exclude"}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
            <div className="border-b border-[rgba(15,23,42,0.08)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#162233]">Curated gold set</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9f9f7] text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Org</th>
                  <th className="px-4 py-2">Year</th>
                  <th className="px-4 py-2">Route</th>
                  <th className="px-4 py-2">Risk</th>
                  <th className="px-4 py-2">Outcome</th>
                  <th className="px-4 py-2">Note</th>
                  <th className="px-4 py-2">Updated</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {goldSet.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={10}>
                      No curated gold-set items.
                    </td>
                  </tr>
                ) : (
                  goldSet.map((item) => (
                    <tr key={item.filingId} className="border-t border-[rgba(15,23,42,0.06)]">
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.status}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.reason}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.orgNumber ?? "-"}</td>
                      <td className="px-4 py-2 text-slate-700">{item.fiscalYear ?? "-"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.decisionRoute ?? "-"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.riskLevel ?? "-"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.outcome ?? "-"}</td>
                      <td className="min-w-52 px-4 py-2 text-slate-600">{item.note ?? "-"}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{formatDate(item.updatedAt)}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          {(["APPROVED", "EXCLUDED"] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              disabled={savingFilingId === item.filingId}
                              onClick={() => void upsertGoldSet(item, status)}
                              className="rounded border border-[rgba(15,23,42,0.12)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {status === "APPROVED" ? "Approve" : "Exclude"}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={savingFilingId === item.filingId}
                            onClick={() => void removeGoldSet(item.filingId)}
                            className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
