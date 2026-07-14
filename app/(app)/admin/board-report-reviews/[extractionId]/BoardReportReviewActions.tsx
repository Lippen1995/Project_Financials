"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BoardReportReviewActions({ extractionId }: { extractionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"ACCEPTED" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function decide(decision: "ACCEPTED" | "REJECTED") {
    setPending(decision);
    setError(null);
    try {
      const response = await fetch(
        `/api/internal/annual-report-board-reports/extractions/${extractionId}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision, reason: reason.trim() || null }),
        },
      );
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Kontrollen kunne ikke lagres.");
      }
      router.push("/admin/board-report-reviews");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kontrollen kunne ikke lagres.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm text-[var(--px-text)]">
        <span className="data-label text-xs text-[var(--px-muted)]">Begrunnelse</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={2_000}
          rows={4}
          className="mt-2 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] p-4 text-sm text-[var(--px-text)]"
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => decide("ACCEPTED")}
          className="rounded-full bg-[var(--px-action)] px-5 py-2 text-sm font-medium text-[var(--px-surface)] hover:bg-[var(--px-action-hover)] disabled:opacity-50"
        >
          {pending === "ACCEPTED" ? "Lagrer..." : "Godkjenn og publiser"}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => decide("REJECTED")}
          className="rounded-full border border-rose-300 px-5 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          {pending === "REJECTED" ? "Lagrer..." : "Avvis uttrekk"}
        </button>
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
