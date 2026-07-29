import React from "react";

export default function AnalysisLoading() {
  return (
    <main className="flex flex-col gap-8 pb-16" aria-busy="true" aria-label="Laster analyse">
      <div className="h-36 animate-pulse rounded-xl bg-[var(--px-subtle)]" />
      <div className="grid gap-4 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-48 animate-pulse rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)]"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)]" />
    </main>
  );
}
