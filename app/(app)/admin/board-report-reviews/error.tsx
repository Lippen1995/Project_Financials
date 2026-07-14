"use client";

export default function BoardReportReviewsError({ reset }: { reset: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
      <h1 className="editorial-display text-2xl">Kontrollkøen er utilgjengelig</h1>
      <p className="mt-2 text-sm">
        Styreberetningene kunne ikke lastes. Ingen uttrekk eller beslutninger er endret.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-full border border-rose-300 px-4 py-2 text-sm font-medium hover:bg-rose-100"
      >
        Prøv igjen
      </button>
    </div>
  );
}
