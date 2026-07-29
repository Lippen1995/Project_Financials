"use client";

import React from "react";
import Link from "next/link";

export default function AnalysisError({ reset }: { reset: () => void }) {
  return (
    <main className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <div className="data-label text-[11px] text-rose-700">Analysefeil</div>
      <h1 className="mt-3 text-xl font-semibold text-rose-950">Kunne ikke laste analysen</h1>
      <p className="mt-2 text-sm text-rose-800">
        Den lagrede analysen er ikke endret. Prøv igjen eller gå tilbake til oversikten.
      </p>
      <div className="mt-5 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-[var(--px-surface)] hover:bg-[var(--px-action-hover)]"
        >
          Prøv igjen
        </button>
        <Link
          href={"/analyses" as never}
          className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-900"
        >
          Alle analyser
        </Link>
      </div>
    </main>
  );
}
