export default function SearchHistoryLoading() {
  return (
    <main className="space-y-8 pb-12" aria-busy="true" aria-label="Laster søkehistorikk">
      <div className="h-32 animate-pulse rounded-2xl bg-[var(--px-subtle)]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-2xl border border-[var(--px-border)] bg-[var(--px-subtle)]" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-[var(--px-border)] bg-[var(--px-subtle)]" />
    </main>
  );
}
