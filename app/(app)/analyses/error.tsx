"use client";

import React from "react";

export default function AnalysesError({ reset }: { reset: () => void }) {
  return (
    <main className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <div className="data-label text-[11px] text-rose-700">Analysefeil</div>
      <h1 className="mt-3 text-xl font-semibold text-rose-950">Kunne ikke laste analysene</h1>
      <p className="mt-2 text-sm text-rose-800">
        Ingen data er endret. Prøv å laste den tilgangsstyrte oversikten på nytt.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-[var(--px-surface)] hover:bg-[var(--px-action-hover)]"
      >
        Prøv igjen
      </button>
    </main>
  );
}
