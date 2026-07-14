"use client";

import { AlertCircle } from "lucide-react";

export default function SearchHistoryError({ reset }: { reset: () => void }) {
  return (
    <main className="pb-12">
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <AlertCircle className="h-6 w-6" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold">Søkehistorikken kunne ikke lastes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-rose-800">
          Historikken er fortsatt lagret, men kunne ikke hentes akkurat nå. Prøv på nytt.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold hover:bg-rose-100"
        >
          Prøv på nytt
        </button>
      </section>
    </main>
  );
}
