import React from "react";
import Link from "next/link";

export default function AnalysisNotFound() {
  return (
    <main className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
      <div className="data-label text-[11px] text-[var(--px-accent)]">Ikke tilgjengelig</div>
      <h1 className="editorial-display mt-3 text-4xl text-[var(--px-text)]">
        Analysen finnes ikke
      </h1>
      <p className="mt-3 max-w-[62ch] text-sm text-[var(--px-muted)]">
        Analysen finnes ikke eller tilhører et workspace du ikke er medlem av. Ingen
        analysedetaljer er eksponert.
      </p>
      <Link
        href={"/analyses" as never}
        className="mt-5 inline-flex rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-[var(--px-surface)] hover:bg-[var(--px-action-hover)]"
      >
        Til analyseoversikten
      </Link>
    </main>
  );
}
