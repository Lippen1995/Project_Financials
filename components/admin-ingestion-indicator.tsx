"use client";

import { useEffect, useState } from "react";

type IngestionRun = {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  totalCompanies: number;
  totalFilings: number;
  processedFilings: number;
  publishedCount: number;
  reviewCount: number;
  failedCount: number;
  notes: string | null;
};

const POLL_INTERVAL_MS = 4000;
// A finished run keeps showing for this long so the admin sees the outcome.
const SHOW_FINISHED_FOR_MS = 5 * 60 * 1000;

/**
 * Live indicator for background bulk ingestion. Polls the ingestion-run
 * endpoint and shows a progress bar while a run is in flight, plus a brief
 * summary for a few minutes after it finishes. Renders nothing when there is
 * no recent activity.
 */
export function AdminIngestionIndicator() {
  const [run, setRun] = useState<IngestionRun | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/admin/ingestion-run", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { run: IngestionRun | null };
        if (!cancelled) setRun(data.run);
      } catch {
        // Transient network error — keep the last known state, try again next tick.
      }
    }

    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!run) return null;

  const isRunning = run.status === "RUNNING";
  const finishedAgoMs = run.finishedAt
    ? Date.now() - new Date(run.finishedAt).getTime()
    : Number.POSITIVE_INFINITY;
  // Hide finished runs once they are no longer recent.
  if (!isRunning && finishedAgoMs > SHOW_FINISHED_FOR_MS) {
    return null;
  }

  const pct =
    run.totalFilings > 0
      ? Math.min(100, Math.round((run.processedFilings / run.totalFilings) * 100))
      : 0;

  const tone =
    run.status === "FAILED"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : run.status === "COMPLETED"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-sky-200 bg-sky-50 text-sky-900";

  return (
    <section className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-500"
            />
          ) : null}
          <p className="text-sm font-semibold">
            {isRunning
              ? run.totalFilings > 0
                ? `Bulk-opplasting pågår — ${run.processedFilings} av ${run.totalFilings} filings behandlet`
                : "Bulk-opplasting pågår — oppdager filings…"
              : run.status === "FAILED"
                ? "Bulk-opplasting feilet"
                : "Bulk-opplasting ferdig"}
          </p>
        </div>
        <span className="text-xs font-medium opacity-80">
          {run.publishedCount} publisert · {run.reviewCount} til kontroll
          {run.failedCount > 0 ? ` · ${run.failedCount} feilet` : ""}
        </span>
      </div>

      {isRunning && run.totalFilings > 0 ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/70">
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      {!isRunning && run.notes ? (
        <p className="mt-2 text-xs opacity-80">{run.notes}</p>
      ) : null}
    </section>
  );
}
