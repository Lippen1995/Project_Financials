import React from "react";

export default function AnalysesLoading() {
  return (
    <main className="flex flex-col gap-8 pb-16" aria-busy="true" aria-label="Laster analyser">
      <div className="h-24 animate-pulse rounded-xl bg-[var(--px-subtle)]" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-56 animate-pulse rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)]"
          />
        ))}
      </div>
    </main>
  );
}
